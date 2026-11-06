"""Паспорт игрока (docs/plan-player-season-stats.md) — сезонная статистика на
уже существующих в локальной БД игроках команды, для ручной проверки в
браузере (сайдбар → «Статистика игроков»).

Запуск:  make seed-season-stats                 (по умолчанию «ФK РУБИН» / «Основа»)
         make seed-season-stats team="Молодёжка"

Не создаёт новых пользователей/команд — берёт игроков, которые уже есть в
команде (make seed/seed-player/seed-second-team), и насыпает им записи:
большинству — текущий сезон с полной детализацией (виден радар), части —
без детализации или только часть категорий (виден список/нет радара —
разные состояния экрана), первым пяти — ещё и прошлый сезон во второй
команде (история из нескольких сезонов).

Идемпотентно: сносит прошлые season_player_stats* по athlete_id перед тем,
как насыпать заново (тот же приём, что у seed_player.wipe_own_history).
"""

import argparse
import asyncio
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, select  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
from app.models.enums import TeamRole  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.models.season_stats import SeasonPlayerStats, SeasonPlayerStatValue, SportMetricDef  # noqa: E402
from app.models.team import Team, TeamMembership  # noqa: E402
from app.models.user import User  # noqa: E402

PREVIOUS_SEASON_LABELS = [
    ("2024/25", "Сборная Татарстана U16", "Первенство ПФО"),
    ("2024/25", "Резерв «Б»", "Первенство Татарстана U17"),
]


def generate_values(defs: list[SportMetricDef], minutes: int, richness: str) -> dict[str, float]:
    """richness: "full" (почти весь каталог), "partial" (только 1-2 категории,
    радар не наберёт ≥3 осей), "none" (без детализации вообще)."""
    if richness == "none":
        return {}

    counters = [d for d in defs if d.pct_of_key is None]
    percents = [d for d in defs if d.pct_of_key is not None]

    if richness == "partial":
        # Одна категория целиком — реалистичный «тренер считал только удары»,
        # не вразнобой по всем сразу.
        category = random.choice(sorted({d.category_key for d in counters}))
        counters = [d for d in counters if d.category_key == category]
        percents = [d for d in percents if d.category_key == category]

    values: dict[str, float] = {}
    for d in counters:
        if random.random() < 0.15 and richness == "full":
            continue  # даже в «полной» записи изредка пропускаем метрику — не всё заполняют
        max_per90 = float(d.radar_max) if d.radar_max else 1.0
        per90 = max_per90 * random.uniform(0.35, 1.05)
        total = round(per90 * minutes / 90, 2 if max_per90 <= 2 else 0)
        values[d.key] = max(total, 0)

    for d in percents:
        denom = values.get(d.pct_of_key)
        if not denom:
            continue
        values[d.key] = round(denom * random.uniform(0.3, 0.75), 0 if denom > 5 else 2)

    return values


async def seed_season_stats(org_name: str, team_name: str) -> None:
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
            raise SystemExit(f"Команда «{team_name}» не найдена в «{org_name}»")
        if not team.sport:
            raise SystemExit(f"У команды «{team_name}» не указан вид спорта — заполните Team.sport")

        defs = list(
            (await db.execute(select(SportMetricDef).where(SportMetricDef.sport == team.sport))).scalars()
        )
        if not defs:
            raise SystemExit(f"Каталог метрик для спорта «{team.sport}» пуст — сначала make upgrade")

        coach = (
            await db.execute(
                select(User)
                .join(TeamMembership, TeamMembership.user_id == User.id)
                .where(
                    TeamMembership.team_id == team.id,
                    TeamMembership.team_role.in_([TeamRole.head_coach, TeamRole.coach]),
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if coach is None:
            raise SystemExit(f"В команде «{team_name}» нет тренера (head_coach/coach) — нужен created_by")

        athletes = list(
            (
                await db.execute(
                    select(User)
                    .join(TeamMembership, TeamMembership.user_id == User.id)
                    .where(TeamMembership.team_id == team.id, TeamMembership.team_role == TeamRole.athlete)
                    .order_by(User.last_name)
                )
            ).scalars()
        )
        if not athletes:
            raise SystemExit(f"В команде «{team_name}» нет игроков")

        athlete_ids = [a.id for a in athletes]
        await db.execute(delete(SeasonPlayerStats).where(SeasonPlayerStats.athlete_id.in_(athlete_ids)))
        await db.flush()

        created = 0
        for i, athlete in enumerate(athletes):
            # Распределение по полноте данных — чтобы на экране встретились все
            # состояния карточки: с радаром, со списком без радара, без детализации.
            richness = "full" if i % 10 < 6 else "partial" if i % 10 < 9 else "none"
            matches = random.randint(8, 18)
            minutes = matches * random.randint(55, 88)
            score = round(random.uniform(0, 0.9) * matches) if richness != "none" else random.randint(0, 3)
            assists = round(random.uniform(0, 0.6) * matches)

            entry = SeasonPlayerStats(
                athlete_id=athlete.id,
                sport=team.sport,
                season="2025/26",
                team_label=team.name,
                competition="Первенство Татарстана U17",
                matches=matches,
                minutes=minutes,
                score=score,
                assists=assists,
                penalty_minor=random.randint(0, 4),
                penalty_major=random.choice([0, 0, 0, 1]),
                created_by=coach.id,
                values=[
                    SeasonPlayerStatValue(metric_key=k, value=v)
                    for k, v in generate_values(defs, minutes, richness).items()
                ],
            )
            db.add(entry)
            created += 1

            # Трём игрокам — второй турнир в том же клубе+сезоне (кубок
            # вместо/вместе с первенством) — проверка выбора турнира: «Все
            # турниры» должен сложить обе записи, выбор конкретного — показать
            # только его.
            if 5 <= i < 8:
                cup_matches = random.randint(2, 5)
                cup_minutes = cup_matches * random.randint(55, 85)
                db.add(
                    SeasonPlayerStats(
                        athlete_id=athlete.id,
                        sport=team.sport,
                        season="2025/26",
                        team_label=team.name,
                        competition="Кубок Татарстана U17",
                        matches=cup_matches,
                        minutes=cup_minutes,
                        score=round(random.uniform(0, 0.9) * cup_matches),
                        assists=round(random.uniform(0, 0.5) * cup_matches),
                        penalty_minor=random.randint(0, 1),
                        penalty_major=0,
                        created_by=coach.id,
                        values=[
                            SeasonPlayerStatValue(metric_key=k, value=v)
                            for k, v in generate_values(defs, cup_minutes, "full").items()
                        ],
                    )
                )

            # Первым пяти — вторая, более старая запись (история нескольких
            # сезонов/команд на одном паспорте).
            if i < 5:
                season, label, competition = PREVIOUS_SEASON_LABELS[i % len(PREVIOUS_SEASON_LABELS)]
                prev_matches = random.randint(4, 10)
                prev_minutes = prev_matches * random.randint(50, 80)
                db.add(
                    SeasonPlayerStats(
                        athlete_id=athlete.id,
                        sport=team.sport,
                        season=season,
                        team_label=label,
                        competition=competition,
                        matches=prev_matches,
                        minutes=prev_minutes,
                        score=round(random.uniform(0, 0.7) * prev_matches),
                        assists=round(random.uniform(0, 0.4) * prev_matches),
                        penalty_minor=random.randint(0, 2),
                        penalty_major=0,
                        created_by=coach.id,
                        values=[
                            SeasonPlayerStatValue(metric_key=k, value=v)
                            for k, v in generate_values(defs, prev_minutes, "full").items()
                        ],
                    )
                )

        await db.commit()
        print(f"Готово: «{org_name}» → «{team_name}» ({team.sport}) — {created} игроков, записи пересеяны.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--org", default="ФK РУБИН")
    parser.add_argument("--team", default="Основа")
    args = parser.parse_args()
    asyncio.run(seed_season_stats(args.org, args.team))


if __name__ == "__main__":
    main()
