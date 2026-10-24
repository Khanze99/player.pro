"""Присоединить существующий реальный аккаунт к демо-команде с полной историей
опросов/RPE — тот же генератор данных, что у 25 игроков seed_demo.py, применённый
к ОДНОМУ реальному email вместо @demo.playerpro.local-ростера.

Запуск:  make seed-player email="a@b.com" org="ФK РУБИН" team="Основа" [days=21]

Пользователь должен уже существовать (хотя бы раз входил по OTP) — скрипт не
регистрирует новых людей, только довключает в организацию и насыпает данные.

Идемпотентно: свою прошлую историю (по athlete_id) скрипт сносит перед тем, как
насыпать заново — повторный запуск не плодит дубликаты и не падает на
UniqueConstraint(athlete_id, date) в wellness_entries.

Командные события (RPE привязывается к ним) не создаёт — использует то, что уже
накидал seed_demo.py для той же команды; если там пусто, RPE просто не наберётся.
"""

import argparse
import asyncio
import random
import sys
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))  # соседний seed_demo.py как модуль

import seed_demo as demo  # noqa: E402
from sqlalchemy import delete, select  # noqa: E402

from app.config import settings as app_settings  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.models.consent import DataConsent  # noqa: E402
from app.models.cycle import CycleLog  # noqa: E402
from app.models.enums import (  # noqa: E402
    AttendanceStatus,
    ConsentAudience,
    ConsentScope,
    GlobalRole,
    Sex,
    TeamRole,
)
from app.models.event import Attendance, Event  # noqa: E402
from app.models.metric import DailyMetric, Streak  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.models.pain_point import PainPoint  # noqa: E402
from app.models.rpe import RpeEntry  # noqa: E402
from app.models.team import Team, TeamMembership  # noqa: E402
from app.models.user import AthleteProfile, User  # noqa: E402
from app.models.wellness import WellnessEntry  # noqa: E402
from app.services import analytics_service  # noqa: E402


async def wipe_own_history(db, athlete_id, *, cycle: bool = False) -> None:
    """Своя история только: не трогает других игроков команды, безопасно перезапускать."""
    own_wellness = list(
        (await db.execute(select(WellnessEntry.id).where(WellnessEntry.athlete_id == athlete_id))).scalars()
    )
    if own_wellness:
        await db.execute(delete(PainPoint).where(PainPoint.entry_id.in_(own_wellness)))
    await db.execute(delete(WellnessEntry).where(WellnessEntry.athlete_id == athlete_id))
    own_events = list((await db.execute(select(Event.id).where(Event.created_by == athlete_id))).scalars())
    if own_events:
        await db.execute(delete(Attendance).where(Attendance.event_id.in_(own_events)))
        await db.execute(delete(RpeEntry).where(RpeEntry.event_id.in_(own_events)))
        await db.execute(delete(Event).where(Event.id.in_(own_events)))
    await db.execute(delete(Attendance).where(Attendance.user_id == athlete_id))
    await db.execute(delete(RpeEntry).where(RpeEntry.athlete_id == athlete_id))
    await db.execute(delete(DailyMetric).where(DailyMetric.athlete_id == athlete_id))
    await db.execute(delete(Streak).where(Streak.athlete_id == athlete_id))
    # Вес (docs/plan-weight-tracking.md) пересчитывается заново при каждом
    # запуске — старое согласие body_metrics сносим, иначе повторный запуск
    # плодил бы вторую активную запись (revoked_at не проставлен).
    await db.execute(
        delete(DataConsent).where(
            DataConsent.athlete_id == athlete_id, DataConsent.scope == ConsentScope.body_metrics
        )
    )

    if cycle:
        # CycleSettings не трогаем (seed_cycle_for_athlete сам идемпотентен на неё) —
        # только логи/согласие, чтобы --cycle можно было перезапускать.
        await db.execute(delete(CycleLog).where(CycleLog.athlete_id == athlete_id))
        await db.execute(
            delete(DataConsent).where(
                DataConsent.athlete_id == athlete_id, DataConsent.scope == ConsentScope.cycle
            )
        )


async def seed_player(
    email: str,
    org_name: str,
    team_name: str,
    days: int,
    archetype: demo.Archetype,
    *,
    sex: Sex | None = None,
    cycle: bool = False,
) -> None:
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            raise SystemExit(f"Пользователь {email} не найден — должен хотя бы раз войти по OTP")

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

        if user.org_id not in (None, org.id):
            raise SystemExit(f"{email} уже состоит в другой организации — сначала make delete-user")

        user.org_id = org.id
        user.global_role = GlobalRole.player

        # Если аккаунт уже состоял в этой команде с другой ролью (coach/head_coach/
        # medic — например, переводим реальный тренерский логин в игрока для теста)
        # — переводим её в athlete, а не молча пропускаем.
        membership = await db.get(TeamMembership, (user.id, team.id))
        if membership is None:
            db.add(TeamMembership(user_id=user.id, team_id=team.id, team_role=TeamRole.athlete))
        else:
            membership.team_role = TeamRole.athlete

        profile = await db.get(AthleteProfile, user.id)
        if profile is None:
            db.add(AthleteProfile(user_id=user.id, sex=sex or Sex.not_specified))
        elif sex is not None:
            profile.sex = sex

        await wipe_own_history(db, user.id, cycle=cycle)
        await db.flush()

        rng = random.Random(hash(email) & 0xFFFFFFFF)
        today = date.today()
        start = today - timedelta(days=days - 1)

        # Рост/вес (docs/plan-weight-tracking.md) — тот же генератор, что у
        # демо-игроков seed_demo.py: целевой ИМТ привязан к архетипу нагрузки,
        # тренд за окно. Профиль — «последнее известное» (конец тренда), сама
        # серия по дням — ниже, в цикле. Согласие body_metrics даём сразу
        # (audience=coach — старший ранг, открывает и coach, и medic), иначе
        # self-тест под своим же логином ничего не покажет в отчёте штаба.
        height_cm, start_weight, end_weight = demo.weight_plan_for_athlete(archetype, rng)
        profile.height_cm = height_cm
        profile.weight_kg = end_weight
        db.add(
            DataConsent(
                athlete_id=user.id,
                scope=ConsentScope.body_metrics,
                audience=ConsentAudience.coach,
                policy_version=app_settings.consent_policy_version,
            )
        )

        events_by_day: dict[date, Event] = {}
        rows = await db.execute(
            select(Event).where(
                Event.team_id == team.id,
                Event.planned_start >= datetime.combine(start, time.min, tzinfo=UTC),
                Event.planned_start <= datetime.combine(today, time.max, tzinfo=UTC),
            )
        )
        for event in rows.scalars():
            events_by_day.setdefault(event.planned_start.date(), event)

        injury_choice = rng.choice(demo.ACTIVE_INJURIES) if archetype.injured else None
        rpe_count = wellness_count = 0

        for offset in range(days):
            day = start + timedelta(days=offset)
            event = events_by_day.get(day)

            if event is not None and rng.random() > 0.08:
                base = demo.BASE_RPE.get(event.title or "Тренировка", 6.0)
                multiplier = demo.load_multiplier(archetype.load, day, today)
                exertion = max(1, min(10, round(base * multiplier + rng.uniform(-0.7, 0.7))))
                duration = max(
                    20, round(event.planned_duration_min * min(1.5, multiplier) + rng.randint(-8, 8))
                )
                db.add(
                    RpeEntry(
                        athlete_id=user.id,
                        event_id=event.id,
                        date=day,
                        exertion=exertion,
                        performance=demo.performance_for(archetype.wellness, rng),
                        duration_min=duration,
                        session_load=exertion * duration,
                        is_late=rng.random() < 0.1,
                    )
                )
                rpe_count += 1
                db.add(Attendance(event_id=event.id, user_id=user.id, status=AttendanceStatus.present))

            if rng.random() < 0.1:
                continue
            band = demo.WELLNESS_BANDS[demo.wellness_band(archetype.wellness, rng)]
            soreness_val = rng.randint(*band["soreness"])
            is_injury_day = archetype.injured and (today - day).days <= 16
            has_symptom = rng.random() < 0.03
            symptom_type, symptom_details = rng.choice(demo.SYMPTOMS) if has_symptom else (None, None)

            # Вес — разреженно (не каждый день), последний день окна всегда
            # отмечен (тот же приём, что в seed_demo.py — он же синхронизирован
            # в profile.weight_kg выше).
            progress = offset / (days - 1) if days > 1 else 1
            trend_weight = start_weight + (end_weight - start_weight) * progress
            is_last_day = offset == days - 1
            weight_today = (
                round(trend_weight + rng.uniform(-0.4, 0.4), 1)
                if is_last_day or rng.random() < 0.45
                else None
            )

            entry = WellnessEntry(
                athlete_id=user.id,
                date=day,
                mood=rng.randint(*band["mood"]),
                energy=rng.randint(*band["energy"]),
                sleep_quality=rng.randint(*band["sleep_quality"]),
                sleep_hours=round(rng.uniform(5.5, 9.0), 1),
                stress=rng.randint(*band["stress"]),
                soreness=soreness_val,
                injury=is_injury_day,
                injury_area=injury_choice[1] if is_injury_day and injury_choice else None,
                injury_type=injury_choice[3] if is_injury_day and injury_choice else None,
                injury_details=injury_choice[0] if is_injury_day and injury_choice else None,
                symptom=has_symptom,
                symptom_type=symptom_type,
                symptom_details=symptom_details,
                resting_hr=62 + rng.randint(-4, 9),
                weight_kg=weight_today,
                comment=rng.choice(demo.DAY_COMMENTS) if rng.random() < 0.2 else None,
            )
            if is_injury_day and injury_choice and injury_choice[1] in demo.MAPPED_PAIN_REGIONS:
                entry.pain_points.append(
                    PainPoint(
                        region=injury_choice[1],
                        side=injury_choice[2],
                        severity=min(10, soreness_val + rng.randint(0, 2)),
                        note=rng.choice(demo.PAIN_NOTES),
                    )
                )
            elif soreness_val >= 7 and rng.random() < 0.6:
                region, side = rng.choice(demo.SORENESS_POINTS)
                entry.pain_points.append(
                    PainPoint(
                        region=region, side=side, severity=soreness_val, note=rng.choice(demo.PAIN_NOTES)
                    )
                )
            db.add(entry)
            wellness_count += 1

        await db.commit()
        await analytics_service.recalc_athlete(db, user.id, end_date=today, commit=False)
        await db.commit()

        if cycle:
            # Та же функция, что у демо-женщин в seed_demo.py: сейчас 3-й день
            # менструации, 4 якоря за 86 дней, симптом и болевой порог сегодня,
            # согласие audience=coach (видно и coach, и medic демо-команды).
            await demo.seed_cycle_for_athlete(db, user, today)

        print(f"{email} -> {org_name} / {team_name}, роль athlete" + (", пол=" + sex.value if sex else ""))
        print(
            f"wellness: {wellness_count}, rpe: {rpe_count}, окно: {days} дн."
            + (", цикл: да" if cycle else "")
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--org", required=True)
    parser.add_argument("--team", required=True)
    parser.add_argument("--days", type=int, default=21)
    parser.add_argument(
        "--load", default="steady", choices=["spike", "overreaching", "steady", "detrained", "returning"]
    )
    parser.add_argument("--wellness", default="mixed", choices=["green", "yellow", "red", "mixed"])
    parser.add_argument("--injured", action="store_true")
    parser.add_argument("--sex", choices=[s.value for s in Sex], default=None)
    parser.add_argument(
        "--cycle", action="store_true", help="насыпать историю цикла (месячные) — для --sex female"
    )
    args = parser.parse_args()

    archetype = demo.Archetype(load=args.load, wellness=args.wellness, injured=args.injured)
    asyncio.run(
        seed_player(
            args.email,
            args.org,
            args.team,
            args.days,
            archetype,
            sex=Sex(args.sex) if args.sex else None,
            cycle=args.cycle,
        )
    )


if __name__ == "__main__":
    main()
