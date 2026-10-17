"""Пригласить реальный email в демо-организацию тестовой ролью (ручная проверка).

Запуск:  make invite org="ФK РУБИН" team="Основа" email="you@example.com" role=head_coach

Приглашение идёт через тот же сервис, что и POST /organizations/invites:
one-time, с TTL (`settings.invite_ttl_days`), на конкретную команду и роль.
Войти затем обычным OTP по этому email — приглашение консюмится на verify
(organizations_service.consume_for_user), отдельного кода вводить не нужно.
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
from app.models.enums import GlobalRole, TeamRole  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.models.team import Team  # noqa: E402
from app.models.user import User  # noqa: E402
from app.schemas.organization import InvitationCreateIn  # noqa: E402
from app.services import invitations_service  # noqa: E402

# Командные роли на стороне штаба всегда дают глобальную staff; athlete — player.
GLOBAL_ROLE_FOR: dict[TeamRole, GlobalRole] = {
    TeamRole.head_coach: GlobalRole.staff,
    TeamRole.coach: GlobalRole.staff,
    TeamRole.medic: GlobalRole.staff,
    TeamRole.athlete: GlobalRole.player,
}


async def invite(org_name: str, team_name: str, email: str, role: TeamRole) -> None:
    async with AsyncSessionLocal() as db:
        org = (
            await db.execute(select(Organization).where(Organization.name == org_name))
        ).scalar_one_or_none()
        if org is None:
            raise SystemExit(f"Организация «{org_name}» не найдена")

        team = (
            await db.execute(select(Team).where(Team.org_id == org.id, Team.name == team_name))
        ).scalar_one_or_none()
        if team is None:
            raise SystemExit(f"Команда «{team_name}» не найдена в «{org_name}»")

        # Инвайт создаётся от имени существующего админа организации — так же,
        # как это сделал бы он сам через POST /organizations/invites.
        admin = (
            (
                await db.execute(
                    select(User).where(User.org_id == org.id, User.global_role == GlobalRole.admin)
                )
            )
            .scalars()
            .first()
        )
        if admin is None:
            raise SystemExit(f"В «{org_name}» нет администратора — некому пригласить")

        data = InvitationCreateIn(
            identifier=email,
            global_role=GLOBAL_ROLE_FOR[role],
            team_id=team.id,
            team_role=role,
        )
        try:
            await invitations_service.create_invitation(db, admin, data)
        except HTTPException as exc:
            raise SystemExit(exc.detail) from None

        print(f"Приглашение создано: {email} -> {org_name} / {team_name}, роль {role.value}")
        print("Вход: POST /auth/otp/request с этим identifier, код — в ответе при DEBUG=true")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--org", required=True)
    parser.add_argument("--team", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--role", required=True, choices=[r.value for r in TeamRole])
    args = parser.parse_args()
    asyncio.run(invite(args.org, args.team, args.email, TeamRole(args.role)))


if __name__ == "__main__":
    main()
