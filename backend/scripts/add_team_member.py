"""Добавить уже существующего пользователя в ещё одну команду той же организации
БЕЗ изменения его глобальной роли — в отличие от set_role.py, который меняет
global_role + team_role разом по жёсткой карте.

Запуск:  make add-member email="a@b.com" org="ФK РУБИН" team="Молодёжка" role=athlete

Нужно, когда у аккаунта уже есть осмысленная глобальная роль (например, admin
для ручного тестирования) и его просто нужно добавить ещё в одну команду —
второе TeamMembership, первое не трогается (пользователь может состоять сразу
в нескольких командах той же категории — все athlete, либо все head_coach/
coach/medic в любой комбинации).

Упадёт с ошибкой, если у пользователя уже есть членство ДРУГОЙ категории
(игрок vs штаб) в другой команде — teams_service.ensure_single_role_category:
аккаунт либо игрок, либо штаб, смешивать нельзя.
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
from app.models.enums import TeamRole  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.models.team import Team  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import teams_service  # noqa: E402


async def add_team_member(email: str, org_name: str, team_name: str, role: TeamRole) -> None:
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

        try:
            await teams_service.upsert_member(db, team, user.id, role)  # сам коммитит
        except HTTPException as exc:
            raise SystemExit(exc.detail) from None
        print(f"{email}: team_role={role.value} в {org_name}/{team_name} (global_role не менялся)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--org", required=True)
    parser.add_argument("--team", required=True)
    parser.add_argument("--role", required=True, choices=[r.value for r in TeamRole])
    args = parser.parse_args()
    asyncio.run(add_team_member(args.email, args.org, args.team, TeamRole(args.role)))


if __name__ == "__main__":
    main()
