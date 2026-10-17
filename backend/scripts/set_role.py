"""Сменить роль существующего участника организации — глобальную и командную разом.

Запуск:  make set-role email="a@b.com" org="ФK РУБИН" team="Основа" role=coach

Не создаёт пользователя и не меняет организацию — только роль внутри уже
имеющегося членства. Нужно оба поля разом: team_role один меняет только
teams_service.upsert_member (TeamMembership), а на то, увидит ли мобилка
CoachHome вместо своей ленты игрока, смотрит User.global_role
((tabs)/index.tsx: `global_role !== 'player'`) — порознь роль разъезжается.

Для первого включения в организацию — make invite (новый email) или
make seed-player (игрок сразу с историей), не этот скрипт.
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
from app.services import teams_service  # noqa: E402

GLOBAL_ROLE_FOR: dict[TeamRole, GlobalRole] = {
    TeamRole.head_coach: GlobalRole.staff,
    TeamRole.coach: GlobalRole.staff,
    TeamRole.medic: GlobalRole.staff,
    TeamRole.athlete: GlobalRole.player,
}


async def set_role(email: str, org_name: str, team_name: str, role: TeamRole) -> None:
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            raise SystemExit(f"Пользователь {email} не найден")

        org = (
            await db.execute(select(Organization).where(Organization.name == org_name))
        ).scalar_one_or_none()
        if org is None:
            raise SystemExit(f"Организация «{org_name}» не найдена")
        if user.org_id != org.id:
            raise SystemExit(f"{email} не состоит в «{org_name}» (org_id={user.org_id})")

        team = (
            await db.execute(select(Team).where(Team.org_id == org.id, Team.name == team_name))
        ).scalar_one_or_none()
        if team is None:
            raise SystemExit(f"Команда «{team_name}» не найдена в «{org_name}»")

        user.global_role = GLOBAL_ROLE_FOR[role]
        await db.flush()
        try:
            await teams_service.upsert_member(db, team, user.id, role)  # сам коммитит, та же транзакция
        except HTTPException as exc:
            raise SystemExit(exc.detail) from None

        print(
            f"{email}: global_role={user.global_role.value}, team_role={role.value} в {org_name}/{team_name}"
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--org", required=True)
    parser.add_argument("--team", required=True)
    parser.add_argument("--role", required=True, choices=[r.value for r in TeamRole])
    args = parser.parse_args()
    asyncio.run(set_role(args.email, args.org, args.team, TeamRole(args.role)))


if __name__ == "__main__":
    main()
