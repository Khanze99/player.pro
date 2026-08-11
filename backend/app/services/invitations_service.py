"""Приглашения в организацию/команду: one-time, TTL, преднастроенная роль (раздел 2.3/3.4 ТЗ).

Админ создаёт приглашение на email/телефон. Пользователь входит обычным OTP по этому же
identifier — на verify приглашение консюмится (см. consume_for_user) и привязывает его к
орг/команде. Отдельный код/ссылку вводить не нужно.
"""

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.enums import InvitationStatus
from app.models.invitation import Invitation
from app.models.team import Team, TeamMembership
from app.models.user import User
from app.schemas.organization import InvitationCreateIn
from app.services import users_service
from app.services.auth_service import _find_user, normalize_identifier


async def create_invitation(db: AsyncSession, admin: User, data: InvitationCreateIn) -> Invitation:
    if admin.org_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Вы не состоите в организации")

    kind, value = normalize_identifier(data.identifier)

    if data.team_id is not None:
        team = await db.get(Team, data.team_id)
        if team is None or team.org_id != admin.org_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Команда не найдена")
        if data.team_role is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Для приглашения в команду укажите командную роль",
            )

    existing_user = await _find_user(db, kind, value)
    if existing_user is not None and existing_user.org_id not in (None, admin.org_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Пользователь состоит в другой организации"
        )

    # Инвайт one-time: прежние pending на этот identifier в эту орг гасим, оставляя один свежий
    prior = await db.execute(
        select(Invitation).where(
            Invitation.identifier == value,
            Invitation.org_id == admin.org_id,
            Invitation.status == InvitationStatus.pending,
        )
    )
    for inv in prior.scalars():
        inv.status = InvitationStatus.revoked

    invitation = Invitation(
        identifier=value,
        name=data.name or None,
        org_id=admin.org_id,
        global_role=data.global_role,
        team_id=data.team_id,
        team_role=data.team_role,
        invited_by=admin.id,
        expires_at=datetime.now(UTC) + timedelta(days=settings.invite_ttl_days),
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)
    return invitation


async def consume_for_user(db: AsyncSession, user: User) -> None:
    """Применяет свежее pending-приглашение по identifier пользователя (one-time).

    Вызывается из verify_otp в той же транзакции — commit делает вызывающий.
    """
    identifiers = [v for v in (user.email, user.phone) if v]
    if not identifiers:
        return

    rows = await db.execute(
        select(Invitation)
        .where(
            Invitation.identifier.in_(identifiers),
            Invitation.status == InvitationStatus.pending,
        )
        .order_by(Invitation.created_at.desc())
    )
    invitation = rows.scalars().first()
    if invitation is None:
        return

    now = datetime.now(UTC)
    expires_at = invitation.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at < now:
        invitation.status = InvitationStatus.expired
        return

    # Пользователь уже в другой организации — приглашение не применяем (оставляем pending)
    if user.org_id is not None and user.org_id != invitation.org_id:
        return

    user.org_id = invitation.org_id
    user.global_role = invitation.global_role
    if invitation.name and not (user.last_name or user.first_name):
        # Админ вводит ФИО одной строкой — раскладываем, чтобы онбординг подставил поля
        user.last_name, user.first_name, user.middle_name = users_service.split_full_name(invitation.name)

    if invitation.team_id is not None:
        existing = await db.get(TeamMembership, (user.id, invitation.team_id))
        if existing is None:
            db.add(
                TeamMembership(user_id=user.id, team_id=invitation.team_id, team_role=invitation.team_role)
            )
        else:
            existing.team_role = invitation.team_role

    invitation.status = InvitationStatus.accepted
    invitation.accepted_at = now
