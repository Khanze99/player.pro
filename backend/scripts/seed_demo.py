"""Демо-данные для дашборда: команда из 25 игроков + месяц нагрузки и опросов.

Запуск:  make seed            (по умолчанию 30 дней в «ФK РУБИН» / «Основа»)
         make seed-reset      (снести прошлый сид и насыпать заново)

Все созданные игроки имеют email вида <slug>@demo.playerpro.local — по этому
домену работает --reset, поэтому реальные пользователи никогда не затрагиваются.

Данные строятся по недельному микроциклу и архетипам нагрузки, чтобы на Squad
Status оказались представлены все зоны ACWR и все зоны Readiness одновременно.
"""

import argparse
import asyncio
import random
import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, select  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
from app.models.availability import AvailabilityRecord  # noqa: E402
from app.models.enums import (  # noqa: E402
    AttendanceStatus,
    AvailabilityStatus,
    BodyRegion,
    BodySide,
    EventType,
    GlobalRole,
    InjurySeverity,
    InjuryStatus,
    InjuryType,
    SymptomType,
    TeamRole,
    UserStatus,
)
from app.models.event import Attendance, Event  # noqa: E402
from app.models.injury import InjuryRecord  # noqa: E402
from app.models.metric import DailyMetric, Streak  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.models.rpe import RpeEntry  # noqa: E402
from app.models.team import Team, TeamMembership  # noqa: E402
from app.models.user import AthleteProfile, RefreshToken, User  # noqa: E402
from app.models.wellness import WellnessEntry  # noqa: E402
from app.services import analytics_service  # noqa: E402

DEMO_DOMAIN = "demo.playerpro.local"

FUTURE_DAYS = 7  # события вперёд, чтобы на дашборде был блок «предстоящие»

ORG_NAME = "ФK РУБИН"
TEAM_NAME = "Основа"
COACH_EMAIL = f"coach@{DEMO_DOMAIN}"

# 25 игроков: имя + амплуа. Амплуа кладём в AthleteProfile.position — это его место.
ROSTER: list[tuple[str, str]] = [
    ("Артём Соколов", "вратарь"),
    ("Дмитрий Волков", "вратарь"),
    ("Игорь Лебедев", "правый защитник"),
    ("Максим Орлов", "правый защитник"),
    ("Роман Кузнецов", "центральный защитник"),
    ("Никита Морозов", "центральный защитник"),
    ("Егор Павлов", "центральный защитник"),
    ("Сергей Новиков", "левый защитник"),
    ("Андрей Зайцев", "левый защитник"),
    ("Владислав Ершов", "опорный полузащитник"),
    ("Кирилл Медведев", "опорный полузащитник"),
    ("Илья Тарасов", "центральный полузащитник"),
    ("Данила Фомин", "центральный полузащитник"),
    ("Марк Беляев", "центральный полузащитник"),
    ("Тимур Гафуров", "атакующий полузащитник"),
    ("Руслан Исаев", "атакующий полузащитник"),
    ("Александр Шилов", "правый вингер"),
    ("Павел Громов", "правый вингер"),
    ("Денис Крылов", "левый вингер"),
    ("Матвей Савин", "левый вингер"),
    ("Глеб Логинов", "нападающий"),
    ("Юрий Панов", "нападающий"),
    ("Степан Рябов", "нападающий"),
    ("Алексей Дроздов", "нападающий"),
    ("Виктор Самойлов", "нападающий"),
]


@dataclass(frozen=True)
class Archetype:
    """Как игрок нагружается и как себя чувствует — задаёт итоговые зоны на дашборде."""

    load: str  # spike | overreaching | steady | detrained | returning
    wellness: str  # green | yellow | red | mixed
    injured: bool = False


# Раскладка на 25 человек: все зоны ACWR и Readiness представлены одновременно.
ARCHETYPES: list[Archetype] = [
    Archetype("spike", "red"),  # перегруз + плохое самочувствие — верх списка
    Archetype("spike", "yellow"),
    Archetype("spike", "mixed"),
    Archetype("overreaching", "red"),
    Archetype("overreaching", "yellow"),
    Archetype("overreaching", "yellow"),
    Archetype("overreaching", "green"),
    Archetype("steady", "green"),
    Archetype("steady", "green"),
    Archetype("steady", "green"),
    Archetype("steady", "green"),
    Archetype("steady", "mixed"),
    Archetype("steady", "mixed"),
    Archetype("steady", "yellow"),
    Archetype("steady", "yellow"),
    Archetype("steady", "green"),
    Archetype("steady", "green"),
    Archetype("steady", "mixed"),
    Archetype("detrained", "green"),
    Archetype("detrained", "yellow"),
    Archetype("detrained", "green"),
    Archetype("returning", "yellow", injured=True),  # активная травма
    Archetype("returning", "red", injured=True),
    Archetype("steady", "red"),
    Archetype("steady", "green"),
]

# Недельный микроцикл: Пн=0 … Вс=6. None — выходной (0 AU, но не пропуск).
MICROCYCLE: dict[int, tuple[EventType, int, str] | None] = {
    0: None,  # Пн — выходной
    1: (EventType.training, 90, "Тренировка"),
    2: (EventType.training, 105, "Тренировка +"),
    3: (EventType.training, 90, "Тренировка"),
    4: (EventType.training, 70, "Предыгровая"),
    5: (EventType.match, 95, "Матч"),
    6: (EventType.training, 45, "Восстановление"),
}

# Травмы: свободный заголовок + структурная зона (те же энумы, что у карты боли)
ACTIVE_INJURIES: list[tuple[str, BodyRegion, BodySide, InjuryType, InjurySeverity]] = [
    (
        "Надрыв задней поверхности бедра",
        BodyRegion.hamstring,
        BodySide.left,
        InjuryType.muscle,
        InjurySeverity.moderate,
    ),
    (
        "Растяжение приводящей мышцы",
        BodyRegion.groin,
        BodySide.right,
        InjuryType.muscle,
        InjurySeverity.minor,
    ),
    (
        "Повреждение связок голеностопа",
        BodyRegion.ankle,
        BodySide.right,
        InjuryType.ligament,
        InjurySeverity.moderate,
    ),
    (
        "Тендинит коленного сустава",
        BodyRegion.knee,
        BodySide.left,
        InjuryType.tendon,
        InjurySeverity.minor,
    ),
    (
        "Укус клеща, наблюдение врача",
        BodyRegion.calf,
        BodySide.right,
        InjuryType.other,
        InjurySeverity.minor,
    ),
]

HEALED_INJURIES: list[tuple[str, BodyRegion, BodySide, InjuryType, InjurySeverity]] = [
    ("Ушиб бедра", BodyRegion.quad, BodySide.left, InjuryType.bruise, InjurySeverity.minor),
    ("Растяжение икроножной", BodyRegion.calf, BodySide.left, InjuryType.muscle, InjurySeverity.minor),
    (
        "Перегрузка поясницы",
        BodyRegion.lower_back,
        BodySide.center,
        InjuryType.other,
        InjurySeverity.moderate,
    ),
    ("Вывих плеча", BodyRegion.shoulder, BodySide.right, InjuryType.joint, InjurySeverity.severe),
    ("Подвывих голеностопа", BodyRegion.ankle, BodySide.left, InjuryType.joint, InjurySeverity.minor),
]

# Болезни идут не через InjuryRecord, а флагом symptom в опросе
SYMPTOMS: list[tuple[SymptomType, str]] = [
    (SymptomType.illness, "ОРВИ, температура"),
    (SymptomType.fever, "Температура 37.8"),
    (SymptomType.sore_throat, "Болит горло"),
    (SymptomType.gastro, "Отравление"),
    (SymptomType.headache, "Головная боль второй день"),
    (SymptomType.other, "Укус клеща, сдал анализы"),
]

# Самооценка выступления привязана к самочувствию, а не к тяжести сессии:
# тяжело ≠ плохо сыграл, иначе перфоманс просто дублирует RPE.
PERFORMANCE_BASE: dict[str, float] = {"green": 8.0, "yellow": 6.0, "red": 4.0, "mixed": 6.5}

# Базовый RPE по типу дня (до архетипных множителей)
BASE_RPE: dict[str, float] = {
    "Тренировка": 6.0,
    "Тренировка +": 7.5,
    "Предыгровая": 4.0,
    "Матч": 8.5,
    "Восстановление": 3.0,
}

# Границы подобраны так, чтобы взвешенная сумма (см. calculations.READINESS_WEIGHTS)
# гарантированно попадала в свою зону даже в худшем углу диапазона.
WELLNESS_BANDS: dict[str, dict[str, tuple[int, int]]] = {
    "green": {
        "sleep_quality": (8, 10),
        "energy": (8, 10),
        "mood": (8, 10),
        "stress": (1, 3),
        "soreness": (1, 3),
    },
    "yellow": {
        "sleep_quality": (6, 8),
        "energy": (6, 7),
        "mood": (6, 8),
        "stress": (3, 5),
        "soreness": (3, 5),
    },
    "red": {
        "sleep_quality": (2, 4),
        "energy": (2, 4),
        "mood": (3, 5),
        "stress": (7, 9),
        "soreness": (7, 9),
    },
}


def load_multiplier(kind: str, day: date, today: date) -> float:
    """Множитель нагрузки, зависящий от того, насколько день близок к «сегодня».

    Именно расхождение последней недели с предыдущими и разводит ACWR по зонам.
    """
    days_ago = (today - day).days
    if kind == "spike":
        return 2.6 if days_ago <= 6 else 0.95
    if kind == "overreaching":
        return 1.5 if days_ago <= 6 else 1.0
    if kind == "detrained":
        return 0.3 if days_ago <= 9 else 1.05
    if kind == "returning":
        # Пропуск двух недель, затем осторожное возвращение
        if days_ago <= 4:
            return 0.45
        if days_ago <= 16:
            return 0.0
        return 1.0
    return 1.0  # steady


def performance_for(wellness_kind: str, rng: random.Random) -> int:
    """Самооценка выступления 1–10 вокруг базы своего архетипа самочувствия."""
    base = PERFORMANCE_BASE[wellness_kind]
    return max(1, min(10, round(base + rng.uniform(-1.2, 1.2))))


def availability_timeline(
    archetype: Archetype, start: date, today: date, rng: random.Random
) -> list[tuple[date, AvailabilityStatus]]:
    """Точки смены статуса доступности за окно — из них считается Availability %."""
    points: list[tuple[date, AvailabilityStatus]] = [(start, AvailabilityStatus.full)]

    if archetype.injured:
        # Выбыл на травме, к сегодняшнему дню всё ещё недоступен
        points.append((today - timedelta(days=16), AvailabilityStatus.unavailable))
    elif archetype.load == "returning":
        points.append((today - timedelta(days=16), AvailabilityStatus.unavailable))
        points.append((today - timedelta(days=4), AvailabilityStatus.modified))
    elif archetype.load == "spike":
        points.append((today - timedelta(days=2), AvailabilityStatus.modified))
    else:
        # У части состава — короткие эпизоды ограниченного участия
        for _ in range(rng.randint(0, 2)):
            episode_start = start + timedelta(days=rng.randint(0, max(0, (today - start).days - 5)))
            points.append((episode_start, AvailabilityStatus.modified))
            points.append((episode_start + timedelta(days=rng.randint(2, 5)), AvailabilityStatus.full))

    # Одна запись на дату: последняя выигрывает (уникальный ключ athlete+date)
    unique: dict[date, AvailabilityStatus] = {}
    for day, status in points:
        if start <= day <= today:
            unique[day] = status
    return sorted(unique.items())


def wellness_band(kind: str, rng: random.Random) -> str:
    if kind != "mixed":
        return kind
    return rng.choices(["green", "yellow", "red"], weights=[6, 3, 1])[0]


async def wipe_demo(db) -> int:
    """Удаляет прошлый сид целиком: игроков демо-домена и все их данные."""
    demo_ids = list((await db.execute(select(User.id).where(User.email.like(f"%@{DEMO_DOMAIN}")))).scalars())
    if not demo_ids:
        return 0

    demo_events = list((await db.execute(select(Event.id).where(Event.created_by.in_(demo_ids)))).scalars())
    if demo_events:
        await db.execute(delete(Attendance).where(Attendance.event_id.in_(demo_events)))
        await db.execute(delete(RpeEntry).where(RpeEntry.event_id.in_(demo_events)))
        await db.execute(delete(Event).where(Event.id.in_(demo_events)))

    for model in (
        DailyMetric,
        Streak,
        RpeEntry,
        WellnessEntry,
        AvailabilityRecord,
        InjuryRecord,
        AthleteProfile,
    ):
        column = model.user_id if model is AthleteProfile else model.athlete_id
        await db.execute(delete(model).where(column.in_(demo_ids)))

    await db.execute(delete(InjuryRecord).where(InjuryRecord.created_by.in_(demo_ids)))
    await db.execute(delete(RefreshToken).where(RefreshToken.user_id.in_(demo_ids)))
    await db.execute(delete(Attendance).where(Attendance.user_id.in_(demo_ids)))
    await db.execute(delete(TeamMembership).where(TeamMembership.user_id.in_(demo_ids)))
    await db.execute(delete(User).where(User.id.in_(demo_ids)))
    await db.commit()
    return len(demo_ids)


async def get_or_create_org_team(db) -> tuple[Organization, Team]:
    org = (await db.execute(select(Organization).where(Organization.name == ORG_NAME))).scalar_one_or_none()
    if org is None:
        org = Organization(name=ORG_NAME, timezone="Europe/Moscow", locale="ru")
        db.add(org)
        await db.flush()

    team = (
        await db.execute(select(Team).where(Team.org_id == org.id, Team.name == TEAM_NAME))
    ).scalar_one_or_none()
    if team is None:
        team = Team(org_id=org.id, name=TEAM_NAME, sport="football")
        db.add(team)
        await db.flush()
    return org, team


def name_parts(full: str) -> dict[str, str]:
    """ROSTER задан как «Имя Фамилия»; в БД ФИО лежит раздельными полями."""
    first, last = full.split(" ", 1)
    return {"first_name": first, "last_name": last}


async def ensure_coach(db, org: Organization, team: Team) -> User:
    """Демо-тренер + подключение уже существующих админов организации к команде."""
    coach = (await db.execute(select(User).where(User.email == COACH_EMAIL))).scalar_one_or_none()
    if coach is None:
        coach = User(
            org_id=org.id,
            **name_parts("Валерий Демин"),
            email=COACH_EMAIL,
            global_role=GlobalRole.admin,
            status=UserStatus.active,
            email_verified=True,
        )
        db.add(coach)
        await db.flush()

    # Чтобы Squad Status открывался и под уже заведёнными аккаунтами организации
    staff = list(
        (
            await db.execute(
                select(User).where(
                    User.org_id == org.id, User.global_role.in_([GlobalRole.admin, GlobalRole.staff])
                )
            )
        ).scalars()
    )
    for member in staff:
        exists = await db.get(TeamMembership, (member.id, team.id))
        if exists is None:
            db.add(TeamMembership(user_id=member.id, team_id=team.id, team_role=TeamRole.head_coach))
    await db.flush()
    return coach


def slugify(name: str, index: int) -> str:
    table = str.maketrans(
        "абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
        "abvgdeejzijklmnoprstufhccss_y_eua",
    )
    return f"{name.split()[0].lower().translate(table)}{index:02d}"


async def seed(days: int, reset: bool, seed_value: int) -> None:
    rng = random.Random(seed_value)
    today = date.today()
    start = today - timedelta(days=days - 1)

    async with AsyncSessionLocal() as db:
        if reset:
            removed = await wipe_demo(db)
            print(f"  Снесено демо-игроков прошлого сида: {removed}")

        org, team = await get_or_create_org_team(db)
        coach = await ensure_coach(db, org, team)
        print(f"  Организация: {org.name} ({org.id})")
        print(f"  Команда:     {team.name} ({team.id})")

        # --- Игроки ---
        athletes: list[tuple[User, Archetype]] = []
        for index, ((name, position), archetype) in enumerate(zip(ROSTER, ARCHETYPES, strict=True)):
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
                    locale="ru",
                )
                db.add(user)
                await db.flush()
            if await db.get(TeamMembership, (user.id, team.id)) is None:
                db.add(TeamMembership(user_id=user.id, team_id=team.id, team_role=TeamRole.athlete))
            if await db.get(AthleteProfile, user.id) is None:
                db.add(
                    AthleteProfile(
                        user_id=user.id,
                        position=position,
                        baseline_resting_hr=rng.randint(48, 60),
                        birthdate=date(rng.randint(1994, 2006), rng.randint(1, 12), rng.randint(1, 28)),
                    )
                )
            athletes.append((user, archetype))
        await db.flush()
        print(f"  Игроков в составе: {len(athletes)}")

        # --- Командные события: вся история + ближайшая неделя вперёд ---
        events: dict[date, Event] = {}
        for offset in range(days + FUTURE_DAYS):
            day = start + timedelta(days=offset)
            plan = MICROCYCLE[day.weekday()]
            if plan is None:
                continue
            event_type, duration, title = plan
            event = Event(
                team_id=team.id,
                type=event_type,
                title=title,
                planned_start=datetime.combine(day, time(18, 0), tzinfo=UTC),
                planned_duration_min=duration,
                created_by=coach.id,
            )
            db.add(event)
            events[day] = event
        await db.flush()
        print(f"  Событий за период: {len(events)}")

        # --- RPE, wellness, посещаемость ---
        rpe_count = 0
        wellness_count = 0
        for user, archetype in athletes:
            band_for_athlete = archetype.wellness
            for offset in range(days):
                day = start + timedelta(days=offset)
                event = events.get(day)

                # RPE — только в дни с сессией и с учётом архетипа нагрузки
                if event is not None:
                    multiplier = load_multiplier(archetype.load, day, today)
                    if multiplier > 0 and rng.random() > 0.06:  # 6% пропусков сессии
                        base = BASE_RPE[event.title or "Тренировка"]
                        exertion = round(base * multiplier + rng.uniform(-0.7, 0.7))
                        exertion = max(1, min(10, exertion))
                        duration = max(
                            20,
                            round(event.planned_duration_min * min(1.5, multiplier) + rng.randint(-8, 8)),
                        )
                        db.add(
                            RpeEntry(
                                athlete_id=user.id,
                                event_id=event.id,
                                date=day,
                                exertion=exertion,
                                performance=performance_for(archetype.wellness, rng),
                                duration_min=duration,
                                session_load=exertion * duration,
                                is_late=rng.random() < 0.1,
                            )
                        )
                        rpe_count += 1
                        db.add(
                            Attendance(event_id=event.id, user_id=user.id, status=AttendanceStatus.present)
                        )
                        # Перегруженные — на двухразовых: RPE упирается в 10, поэтому
                        # объём добирается второй сессией, как в реальном микроцикле
                        if archetype.load == "spike" and (today - day).days <= 6:
                            extra_duration = rng.randint(40, 60)
                            extra_exertion = rng.randint(5, 7)
                            db.add(
                                RpeEntry(
                                    athlete_id=user.id,
                                    event_id=None,
                                    date=day,
                                    exertion=extra_exertion,
                                    performance=performance_for(archetype.wellness, rng),
                                    duration_min=extra_duration,
                                    session_load=extra_exertion * extra_duration,
                                )
                            )
                            rpe_count += 1
                    else:
                        db.add(Attendance(event_id=event.id, user_id=user.id, status=AttendanceStatus.absent))

                # Wellness — почти каждый день, 12% пропусков (для флага «нет опроса»)
                if rng.random() < 0.12:
                    continue
                band = WELLNESS_BANDS[wellness_band(band_for_athlete, rng)]
                profile = await db.get(AthleteProfile, user.id)
                baseline = profile.baseline_resting_hr if profile else 55
                has_symptom = rng.random() < 0.03
                symptom_type, symptom_details = rng.choice(SYMPTOMS) if has_symptom else (None, None)
                db.add(
                    WellnessEntry(
                        athlete_id=user.id,
                        date=day,
                        mood=rng.randint(*band["mood"]),
                        energy=rng.randint(*band["energy"]),
                        sleep_quality=rng.randint(*band["sleep_quality"]),
                        sleep_hours=round(rng.uniform(5.5, 9.0), 1),
                        stress=rng.randint(*band["stress"]),
                        soreness=rng.randint(*band["soreness"]),
                        injury=archetype.injured and (today - day).days <= 16,
                        symptom=has_symptom,
                        symptom_type=symptom_type,
                        symptom_details=symptom_details,
                        resting_hr=baseline + rng.randint(-4, 9),
                    )
                )
                wellness_count += 1

            # Доступность: пишем точки смены статуса за всё окно. summary_90d наследует
            # статус от последней записи, поэтому одной записи на сегодня мало —
            # процент получился бы бинарным (0 или 100).
            for change_day, status in availability_timeline(archetype, start, today, rng):
                db.add(
                    AvailabilityRecord(athlete_id=user.id, date=change_day, status=status, set_by=coach.id)
                )
            if archetype.injured:
                title, region, side, injury_type, severity = rng.choice(ACTIVE_INJURIES)
                db.add(
                    InjuryRecord(
                        athlete_id=user.id,
                        type=title,
                        body_region=region,
                        body_side=side,
                        injury_type=injury_type,
                        severity=severity,
                        start_date=today - timedelta(days=16),
                        status=InjuryStatus.active,
                        created_by=coach.id,
                    )
                )

        # Закрытые травмы в прошлом — чтобы раздел показывал историю и «горячие зоны»
        for user, _ in rng.sample(athletes, 6):
            title, region, side, injury_type, severity = rng.choice(HEALED_INJURIES)
            started = today - timedelta(days=rng.randint(25, 80))
            db.add(
                InjuryRecord(
                    athlete_id=user.id,
                    type=title,
                    body_region=region,
                    body_side=side,
                    injury_type=injury_type,
                    severity=severity,
                    start_date=started,
                    end_date=started + timedelta(days=rng.randint(5, 21)),
                    status=InjuryStatus.closed,
                    created_by=coach.id,
                )
            )

        await db.commit()
        print(f"  RPE-записей: {rpe_count}, wellness-записей: {wellness_count}")

        # --- Пересчёт DailyMetric (та же функция, что и в ночном пересчёте) ---
        total = 0
        for user, _ in athletes:
            total += await analytics_service.recalc_athlete(db, user.id, end_date=today, commit=False)
        await db.commit()
        print(f"  Пересчитано дней метрик: {total}")

        await report(db, team.id, today)


async def report(db, team_id: uuid.UUID, today: date) -> None:
    """Печатает итоговое распределение — чтобы сразу видеть, что дашборду есть что показать."""
    from app.services import dashboard_service

    squad = await dashboard_service.squad_status(db, team_id, today)
    load_zones: dict[str, int] = {}
    readiness_zones: dict[str, int] = {}
    for player in squad.players:
        load_zones[player.load_zone] = load_zones.get(player.load_zone, 0) + 1
        key = player.readiness_zone or "нет опроса"
        readiness_zones[key] = readiness_zones.get(key, 0) + 1

    print("\n  Squad Status на сегодня:")
    print(f"    зоны нагрузки (ACWR): {load_zones}")
    print(f"    зоны готовности:      {readiness_zones}")
    print("\n  Топ-5 строк дашборда (как их отдаёт сервер):")
    for player in squad.players[:5]:
        acwr = f"{player.acwr:.2f}" if player.acwr is not None else "—"
        print(
            f"    {player.name:<20} readiness={str(player.readiness or '—'):>4}"
            f" ({player.readiness_zone or 'нет'})  ACWR={acwr:>5} ({player.load_zone})"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Демо-данные PlayerPro")
    parser.add_argument("--days", type=int, default=30, help="глубина истории в днях (по умолчанию 30)")
    parser.add_argument("--reset", action="store_true", help="снести прошлый сид перед заливкой")
    parser.add_argument("--seed", type=int, default=20260807, help="зерно ГПСЧ для воспроизводимости")
    args = parser.parse_args()

    print(f"Сид демо-данных: {args.days} дн., reset={args.reset}")
    asyncio.run(seed(days=args.days, reset=args.reset, seed_value=args.seed))
    print(f"\nГотово. Вход тренером: {COACH_EMAIL} (код придёт в ответе /auth/otp/request, DEBUG=true)")


if __name__ == "__main__":
    main()
