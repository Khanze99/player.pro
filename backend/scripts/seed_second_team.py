"""Вторая команда в уже существующей организации — ручная проверка перевода
игрока между командами (docs/plan-player-transfer.md).

Запуск:  make seed-second-team org="ФK РУБИН" team="Молодёжка" [count=4]

Не трогает первую команду и её историю нагрузки/опросов (seed_demo.py) — только
создаёт вторую команду и десяток лёгких игроков без DailyMetric/Wellness: для
проверки состава и перевода полная демо-история не нужна, нужны только живые
TeamMembership на двух разных командах одной организации.

Идемпотентно: повторный запуск с теми же --org/--team не плодит дублей (ищет
по имени команды и email игрока).
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
from app.models.enums import GlobalRole, TeamRole, UserStatus  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.models.team import Team, TeamMembership  # noqa: E402
from app.models.user import User  # noqa: E402

DEMO_DOMAIN = "demo.playerpro.local"

ROSTER: list[tuple[str, str]] = [
    ("Артур Валеев", "центральный защитник"),
    ("Богдан Сафин", "опорный полузащитник"),
    ("Вадим Юсупов", "правый вингер"),
    ("Георгий Ахметов", "нападающий"),
    ("Данил Хайруллин", "вратарь"),
    ("Емельян Шарипов", "левый защитник"),
]


def name_parts(full: str) -> dict[str, str]:
    first, last = full.split(" ", 1)
    return {"first_name": first, "last_name": last}


def slugify(name: str, index: int) -> str:
    table = str.maketrans(
        "абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
        "abvgdeejzijklmnoprstufhccss_y_eua",
    )
    return f"youth{index:02d}{name.split()[0].lower().translate(table)}"


async def seed_second_team(org_name: str, team_name: str, count: int) -> None:
    async with AsyncSessionLocal() as db:
        org = (
            await db.execute(select(Organization).where(Organization.name == org_name))
        ).scalar_one_or_none()
        if org is None:
            raise SystemExit(f"Организация «{org_name}» не найдена — сначала make seed")

        team = (
            await db.execute(select(Team).where(Team.org_id == org.id, Team.name == team_name))
        ).scalar_one_or_none()
        if team is None:
            team = Team(org_id=org.id, name=team_name, sport="football")
            db.add(team)
            await db.flush()
            print(f"  Команда создана: {team_name} ({team.id})")
        else:
            print(f"  Команда уже есть: {team_name} ({team.id})")

        count = max(0, min(count, len(ROSTER)))
        created = 0
        for index, (name, _position) in enumerate(ROSTER[:count]):
            email = f"{slugify(name, index)}@{DEMO_DOMAIN}"
            user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
            if user is None:
                user = User(
                    org_id=org.id,
                    **name_parts(name),
                    email=email,
                    global_role=GlobalRole.player,
                    status=UserStatus.active,
                    email_verified=True,
                )
                db.add(user)
                await db.flush()
                created += 1
            if await db.get(TeamMembership, (user.id, team.id)) is None:
                db.add(TeamMembership(user_id=user.id, team_id=team.id, team_role=TeamRole.athlete))

        await db.commit()
        print(f"  Игроков в «{team_name}»: {count} (новых: {created})")
        print(f"\nГотово: «{org_name}» → «{team_name}» ({count} игроков).")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--org", required=True)
    parser.add_argument("--team", required=True)
    parser.add_argument("--count", type=int, default=4)
    args = parser.parse_args()
    asyncio.run(seed_second_team(args.org, args.team, args.count))


if __name__ == "__main__":
    main()
