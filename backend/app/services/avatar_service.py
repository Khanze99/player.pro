"""Аватар профиля.

Лицо человека — персональные данные, но не спецкатегория (152-ФЗ ст. 10): доступ
закрывается авторизацией (`authz.ensure_can_view_user_avatar`), согласие
`DataConsent` не требуется. Файл не раздаётся публичной статикой — только через
`GET /users/{id}/avatar`.

Обработка на загрузке обязательна: изображение пересоздаётся из пиксельных данных,
поэтому вся метадата (в т.ч. EXIF/GPS — фото с базы иначе утекает геолокацией)
не сохраняется. Результат — квадрат `settings.avatar_size_px` в WEBP.
"""

import io
import secrets
from pathlib import Path

from fastapi import HTTPException, status
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.services import audit_service

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


def avatars_dir() -> Path:
    path = _BACKEND_ROOT / settings.media_dir / "avatars"
    path.mkdir(parents=True, exist_ok=True)
    return path


def file_path(user: User) -> Path | None:
    """Путь к файлу аватара пользователя, если он загружен и лежит на диске."""
    if not user.avatar_path:
        return None
    path = avatars_dir() / user.avatar_path
    return path if path.is_file() else None


def _process(raw: bytes) -> bytes:
    """Декодирует, приводит к квадрату avatar_size_px и ре-энкодит в WEBP без метадаты."""
    try:
        with Image.open(io.BytesIO(raw)) as img:
            img = ImageOps.exif_transpose(img)  # учесть ориентацию до того, как снять EXIF
            img = img.convert("RGB")
            size = settings.avatar_size_px
            square = ImageOps.fit(img, (size, size), method=Image.Resampling.LANCZOS)
            out = io.BytesIO()
            square.save(out, format="WEBP", quality=82)  # save без exif=… → метадата не переносится
            return out.getvalue()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Файл не является изображением"
        ) from exc


async def store(db: AsyncSession, user: User, raw: bytes, content_type: str | None) -> User:
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Поддерживаются JPEG, PNG и WEBP",
        )
    if len(raw) > settings.avatar_max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Файл больше 5 МБ",
        )

    processed = _process(raw)
    directory = avatars_dir()
    new_name = f"{user.id}_{secrets.token_hex(4)}.webp"
    (directory / new_name).write_bytes(processed)

    old_name = user.avatar_path
    user.avatar_path = new_name
    audit_service.log(db, user.id, "profile.avatar.set", "user", user.id, {"file": new_name})
    await db.commit()
    await db.refresh(user)

    if old_name and old_name != new_name:
        (directory / old_name).unlink(missing_ok=True)
    return user


async def remove(db: AsyncSession, user: User) -> None:
    old_name = user.avatar_path
    if old_name is None:
        return
    user.avatar_path = None
    audit_service.log(db, user.id, "profile.avatar.clear", "user", user.id, {"file": old_name})
    await db.commit()
    (avatars_dir() / old_name).unlink(missing_ok=True)


def avatar_url(user: User) -> str | None:
    """Ссылка для клиента; None — аватар не загружен."""
    return f"/api/v1/users/{user.id}/avatar" if user.avatar_path else None
