"""Тестовая организация для ревью сторов и наших проверок на проде
(docs/plan-legal-texts.md, «Ревью-аккаунт»).

Запуск:  make seed-review-org            (по умолчанию «PlayerPro Demo» / «Демо-команда»)

Создаёт отдельную организацию с выдуманными игроками (генератор seed_demo.py, email
@demo.playerpro.local) и два входа для ревьюеров:
- review-player@player-pro.ru: игрок команды с историей опросов и RPE за 3 недели;
- review-coach@player-pro.ru: тренер команды (не админ организации, поэтому
  удаление аккаунта у него работает без 409).

Входят по фиксированному коду: на сервере в infra/.env должны быть
REVIEW_LOGIN_IDENTIFIERS=review-player@player-pro.ru,review-coach@player-pro.ru и
REVIEW_OTP_CODE. Оба аккаунта создаются в статусе pending с заполненным ФИО: при
первом входе ревьюер проходит настоящий онбординг (согласия, пол, PIN).

Реальных людей сюда не добавлять: ревьюеры Apple/Google/RuStore видят всё, что
видит тренер этой команды. Скрипт откажется работать, если демо-игроки уже
числятся в другой организации (например, в реальном клубе).

Повторный запуск досоздаёт ревью-аккаунты и обновляет историю игрока, состав не
трогает; make seed-review-org refresh=1 пересоздаёт состав со свежими датами. Если
ревьюер удалил аккаунт, повторный запуск создаст его заново (у надгробия email стёрт).
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # соседние seed_demo.py / seed_player.py
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import seed_demo as demo  # noqa: E402
import seed_player  # noqa: E402
from sqlalchemy import func, select  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
from app.models.enums import GlobalRole, Sex, TeamRole, UserStatus  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.models.team import Team, TeamMembership  # noqa: E402
from app.models.user import User  # noqa: E402

DEFAULT_ORG = "PlayerPro Demo"
DEFAULT_TEAM = "Демо-команда"
REVIEW_PLAYER = "review-player@player-pro.ru"
REVIEW_COACH = "review-coach@player-pro.ru"


async def ensure_demo_roster_is_free(org_name: str) -> None:
    """Демо-игроки (@demo.playerpro.local) глобальны по email: если они уже в другой
    организации, seed_demo добавил бы их в нашу команду поверх чужой."""
    async with AsyncSessionLocal() as db:
        rows = await db.execute(
            select(Organization.name)
            .join(User, User.org_id == Organization.id)
            .where(User.email.like(f"%@{demo.DEMO_DOMAIN}"), Organization.name != org_name)
            .distinct()
        )
        foreign = list(rows.scalars())
    if foreign:
        raise SystemExit(f"Демо-игроки уже состоят в других организациях: {foreign}. Остановлено.")


async def roster_exists(org_name: str) -> bool:
    async with AsyncSessionLocal() as db:
        count = await db.scalar(
            select(func.count())
            .select_from(User)
            .join(Organization, User.org_id == Organization.id)
            .where(Organization.name == org_name, User.email.like(f"%@{demo.DEMO_DOMAIN}"))
        )
    return bool(count)


async def ensure_review_user(
    db, email: str, first: str, last: str, role: GlobalRole, org: Organization
) -> User:
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None:
        user = User(
            email=email,
            first_name=first,
            last_name=last,
            global_role=role,
            org_id=org.id,
            status=UserStatus.pending,
            locale="ru",
        )
        db.add(user)
        await db.flush()
    elif user.org_id not in (None, org.id):
        raise SystemExit(f"{email} состоит в другой организации. Остановлено.")
    return user


async def main_async(org_name: str, team_name: str, days: int, refresh: bool) -> None:
    await ensure_demo_roster_is_free(org_name)

    # Организация, команда и выдуманный состав: тот же генератор, что у make seed.
    # seed_demo.seed без reset не идемпотентен, поэтому состав насыпается только при
    # первом запуске; refresh пересоздаёт его (wipe по домену @demo.playerpro.local,
    # других организаций с демо-игроками нет: это проверено выше).
    demo.ORG_NAME = org_name
    demo.TEAM_NAME = team_name
    if refresh or not await roster_exists(org_name):
        await demo.seed(days=days, reset=refresh, seed_value=20261108)
    else:
        print("  Демо-состав уже есть, не трогаю (refresh=1 пересоздаст его со свежими датами).")

    async with AsyncSessionLocal() as db:
        org = (await db.execute(select(Organization).where(Organization.name == org_name))).scalar_one()
        team = (
            await db.execute(select(Team).where(Team.org_id == org.id, Team.name == team_name))
        ).scalar_one()

        coach = await ensure_review_user(db, REVIEW_COACH, "Тест", "Тренер", GlobalRole.staff, org)
        if await db.get(TeamMembership, (coach.id, team.id)) is None:
            db.add(TeamMembership(user_id=coach.id, team_id=team.id, team_role=TeamRole.head_coach))
        await ensure_review_user(db, REVIEW_PLAYER, "Тест", "Игрок", GlobalRole.player, org)
        await db.commit()

    # История игрока (опросы, RPE по событиям команды, метрики): генератор seed_player
    archetype = demo.Archetype(load="steady", wellness="mixed", injured=False)
    await seed_player.seed_player(REVIEW_PLAYER, org_name, team_name, 21, archetype, sex=Sex.male)

    print(f"\nГотово: «{org_name}» / «{team_name}».")
    print(f"  Игрок:  {REVIEW_PLAYER}")
    print(f"  Тренер: {REVIEW_COACH}")
    print("  Код входа: значение REVIEW_OTP_CODE из infra/.env (API должен быть перезапущен с ним).")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--org", default=DEFAULT_ORG)
    parser.add_argument("--team", default=DEFAULT_TEAM)
    parser.add_argument("--days", type=int, default=30, help="глубина истории команды в днях")
    parser.add_argument("--refresh", action="store_true", help="пересоздать демо-состав со свежими датами")
    args = parser.parse_args()
    asyncio.run(main_async(args.org, args.team, args.days, args.refresh))


if __name__ == "__main__":
    main()
