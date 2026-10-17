"""Сделать уже существующего пользователя глобальным админом его организации.

Запуск:  make set-admin email="a@b.com" org="ФK РУБИН"

Отличие от set_role.py: тот меняет командную роль (coach/medic/athlete) и
глобальную роль разом по жёсткой карте TeamRole → GlobalRole, где нет
админа — у admin нет командной роли по смыслу (это не тренер и не врач,
раздел 2.1 ТЗ). Этот скрипт меняет только global_role, TeamMembership не
трогает: пользователь остаётся кем был в команде (или не состоит ни в одной —
admin видит всю организацию и так, через authz.is_org_admin).

Пользователь должен уже существовать и состоять в указанной организации —
не создаёт ни пользователя, ни организацию (для первого входа — make invite).
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
from app.models.enums import GlobalRole  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.models.user import User  # noqa: E402


async def set_global_admin(email: str, org_name: str) -> None:
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

        user.global_role = GlobalRole.admin
        await db.commit()
        print(f"{email}: global_role=admin в «{org_name}»")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--org", required=True)
    args = parser.parse_args()
    asyncio.run(set_global_admin(args.email, args.org))


if __name__ == "__main__":
    main()
