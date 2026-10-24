"""Перевести уже существующего участника организации в личный режим игрока.

Запуск:  make set-personal email="a@b.com"

Личный режим — это org_id=None на User (раздел CLAUDE.md «Пользователь без
организации — личный режим»). Скрипт глушит global_role=player и org_id=None,
но TeamMembership НЕ удаляет — роль и команда просто становятся невидимы,
пока пользователь не в организации. Обратный переход — make set-role с тем
же org/team/role, он восстанавливает org_id по уже имеющемуся членству.

Пользователь должен уже состоять в организации — не для первого входа.
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
from app.models.enums import GlobalRole  # noqa: E402
from app.models.user import User  # noqa: E402


async def set_personal(email: str) -> None:
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            raise SystemExit(f"Пользователь {email} не найден")
        if user.org_id is None:
            raise SystemExit(f"{email} уже в личном режиме")

        user.global_role = GlobalRole.player
        user.org_id = None
        await db.commit()
        print(f"{email}: личный режим (global_role=player, org_id=None)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    args = parser.parse_args()
    asyncio.run(set_personal(args.email))


if __name__ == "__main__":
    main()
