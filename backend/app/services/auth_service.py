"""Аутентификация: OTP → access-JWT + refresh-токен (раздел 5 ТЗ).

PIN — локальный код устройства, сервер про него не знает.
"""

import logging
import re
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.otp import OtpStore
from app.core.security import create_access_token, generate_otp_code, generate_refresh_token, hash_token
from app.models.enums import UserStatus
from app.models.user import RefreshToken, User

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE_RE = re.compile(r"^\+?\d{10,15}$")


def normalize_identifier(identifier: str) -> tuple[str, str]:
    """Возвращает ("email"|"phone", нормализованное значение) или бросает 422."""
    value = identifier.strip().lower()
    if _EMAIL_RE.match(value):
        return "email", value
    phone = re.sub(r"[\s\-()]", "", value)
    if _PHONE_RE.match(phone):
        return "phone", phone
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Укажите корректный телефон или email",
    )


async def _find_user(db: AsyncSession, kind: str, value: str) -> User | None:
    column = User.email if kind == "email" else User.phone
    row = await db.execute(select(User).where(column == value))
    return row.scalar_one_or_none()


async def request_otp(db: AsyncSession, store: OtpStore, identifier: str) -> str | None:
    """Создаёт/находит пользователя, шлёт OTP. Возвращает код только в debug-режиме."""
    kind, value = normalize_identifier(identifier)

    if not await store.check_rate_limit(value):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много запросов кода, попробуйте позже",
        )

    user = await _find_user(db, kind, value)
    if user is None:
        user = User(**{kind: value})
        db.add(user)
        await db.commit()
    elif user.status == UserStatus.blocked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Аккаунт заблокирован")

    code = generate_otp_code()
    await store.save_challenge(value, code)
    # MVP: реальный SMS-шлюз — пост-MVP; код уходит в лог (и в ответ при debug)
    logger.info("OTP for %s: %s", value, code)
    return code if settings.debug else None


async def verify_otp(
    db: AsyncSession, store: OtpStore, identifier: str, code: str, device_id: str
) -> tuple[str, str]:
    """Активирует пользователя, выдаёт (access, refresh). Refresh привязан к device_id."""
    kind, value = normalize_identifier(identifier)

    if not await store.verify(value, code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неверный или истёкший код")

    user = await _find_user(db, kind, value)
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Сначала запросите код")
    if user.status == UserStatus.blocked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Аккаунт заблокирован")

    user.status = UserStatus.active
    if kind == "email":
        user.email_verified = True
    else:
        user.phone_verified = True

    # Одно живое устройство = один refresh-токен: старые токены этого device_id отзываем
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.device_id == device_id)
        .values(revoked=True)
    )

    raw_refresh = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            device_id=device_id,
            token_hash=hash_token(raw_refresh),
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
        )
    )

    # Консюмим ожидающее приглашение (one-time) → привязка к орг/команде в той же транзакции
    from app.services import invitations_service  # локальный импорт — разрыв цикла auth↔invitations

    await invitations_service.consume_for_user(db, user)

    await db.commit()

    return create_access_token(user.id), raw_refresh


async def _get_valid_refresh(db: AsyncSession, raw_token: str) -> RefreshToken:
    row = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token)))
    token = row.scalar_one_or_none()
    if token is None or token.revoked:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный refresh-токен")
    expires_at = token.expires_at if token.expires_at.tzinfo else token.expires_at.replace(tzinfo=UTC)
    if expires_at < datetime.now(UTC):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh-токен истёк")
    return token


async def refresh_access(db: AsyncSession, raw_token: str, device_id: str) -> str:
    token = await _get_valid_refresh(db, raw_token)
    if token.device_id != device_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Токен выдан другому устройству")

    user = await db.get(User, token.user_id)
    if user is None or user.status != UserStatus.active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь неактивен")

    token.last_used_at = datetime.now(UTC)
    await db.commit()
    return create_access_token(user.id)


async def logout(db: AsyncSession, raw_token: str) -> None:
    row = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token)))
    token = row.scalar_one_or_none()
    if token is not None:
        token.revoked = True
        await db.commit()
