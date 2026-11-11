"""Колокольчик: создание уведомлений по триггерам и лента пользователя.

docs/plan-notifications.md. Устройство:
- триггеры (wellness, пересчёт метрик, события, статус доступности, Beat-задачи)
  зовут функции `notify_*`; они только добавляют строки в сессию, commit делает
  вызывающая сторона, атомарно с исходным изменением;
- идемпотентность держит уникальный индекс (user_id, dedup_key) и вставка через
  ON CONFLICT DO NOTHING, а не проверка «уже есть?» в коде: ретрай задачи Celery
  или два воркера сразу дубль не создадут;
- в payload только коды и снимки расписания, никаких медицинских подробностей.

Push появится здесь же вторым каналом: триггеры менять не придётся.
"""

import base64
import binascii
import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import and_, delete, func, or_, select, tuple_, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core import calculations as calc
from app.models.enums import (
    STAFF_ROLES,
    AttendanceStatus,
    AvailabilityStatus,
    NotificationType,
    TeamRole,
    UserStatus,
)
from app.models.event import Attendance, Event
from app.models.metric import DailyMetric
from app.models.notification import Notification
from app.models.organization import Organization
from app.models.rpe import RpeEntry
from app.models.team import TeamMembership
from app.models.user import User, display_name
from app.models.wellness import WellnessEntry
from app.schemas.notification import (
    NotificationAthleteOut,
    NotificationEventOut,
    NotificationOut,
    NotificationPageOut,
)

logger = logging.getLogger(__name__)

# Точка на карте боли с такой силой и выше будит тренера и врача. Ниже: обычная
# забитость после нагрузки, о ней и так скажет soreness в Readiness.
PAIN_NOTIFY_MIN_SEVERITY = 5

# Изменение этих полей события меняет планы игрока; правка названия не уведомляет.
_EVENT_SIGNIFICANT_FIELDS = ("type", "planned_start", "planned_duration_min", "location_id")

# Напоминание о wellness после полудня уже не «утреннее»: не шлём.
_WELLNESS_REMINDER_LAST_HOUR = 12


@dataclass
class _Row:
    user_id: uuid.UUID
    type: NotificationType
    team_id: uuid.UUID | None = None
    athlete_id: uuid.UUID | None = None
    event_id: uuid.UUID | None = None
    payload: dict = field(default_factory=dict)
    dedup_key: str | None = None


async def _insert(db: AsyncSession, rows: list[_Row]) -> None:
    if not rows:
        return
    stmt = insert(Notification).values(
        [
            {
                "id": uuid.uuid4(),
                "user_id": r.user_id,
                "type": r.type.value,
                "team_id": r.team_id,
                "athlete_id": r.athlete_id,
                "event_id": r.event_id,
                "payload": r.payload,
                "dedup_key": r.dedup_key,
            }
            for r in rows
        ]
    )
    await db.execute(
        stmt.on_conflict_do_nothing(
            index_elements=["user_id", "dedup_key"],
            index_where=Notification.dedup_key.is_not(None),
        )
    )
    # Только тип и количество: payload и получатели в лог не идут.
    logger.info("notifications: +%d %s", len(rows), rows[0].type.value)


# ------------------------------------------------------------------ получатели


async def _staff_of_athlete(db: AsyncSession, athlete_id: uuid.UUID) -> list[tuple[uuid.UUID, uuid.UUID]]:
    """(staff_id, team_id) по командам, где игрок числится athlete.

    Один штабной в двух общих командах получит одно уведомление (дедуп по ключу),
    team_id берётся первой из них. Admin без командной роли сюда не попадает:
    он менеджер клуба, не участник тренировочного процесса.
    """
    athlete_teams = select(TeamMembership.team_id).where(
        TeamMembership.user_id == athlete_id, TeamMembership.team_role == TeamRole.athlete
    )
    rows = await db.execute(
        select(TeamMembership.user_id, TeamMembership.team_id)
        .join(User, User.id == TeamMembership.user_id)
        .where(
            TeamMembership.team_id.in_(athlete_teams),
            TeamMembership.team_role.in_([r.value for r in STAFF_ROLES]),
            TeamMembership.user_id != athlete_id,
            User.status == UserStatus.active,
        )
        .order_by(TeamMembership.team_id)
    )
    seen: set[uuid.UUID] = set()
    result: list[tuple[uuid.UUID, uuid.UUID]] = []
    for user_id, team_id in rows.all():
        if user_id not in seen:
            seen.add(user_id)
            result.append((user_id, team_id))
    return result


async def _athletes_of_team(
    db: AsyncSession, team_id: uuid.UUID, exclude: uuid.UUID | None = None
) -> list[uuid.UUID]:
    rows = await db.execute(
        select(TeamMembership.user_id)
        .join(User, User.id == TeamMembership.user_id)
        .where(
            TeamMembership.team_id == team_id,
            TeamMembership.team_role == TeamRole.athlete,
            User.status == UserStatus.active,
        )
    )
    return [uid for uid in rows.scalars() if uid != exclude]


async def _event_athletes(
    db: AsyncSession, event: Event, exclude: uuid.UUID | None = None
) -> list[uuid.UUID]:
    """Участники командного события: выбранные игроки (этап 2
    docs/plan-workout-builder.md), а без выбора вся команда."""
    assigned = set(event.workout_athlete_ids)
    athletes = await _athletes_of_team(db, event.team_id, exclude=exclude)
    return [a for a in athletes if not assigned or a in assigned]


async def _notify_staff(
    db: AsyncSession, athlete_id: uuid.UUID, ntype: NotificationType, key: str, payload: dict | None = None
) -> None:
    staff = await _staff_of_athlete(db, athlete_id)
    await _insert(
        db,
        [
            _Row(
                user_id=staff_id,
                type=ntype,
                team_id=team_id,
                athlete_id=athlete_id,
                payload=payload or {},
                dedup_key=key,
            )
            for staff_id, team_id in staff
        ],
    )


# ------------------------------------------------------------------ триггеры: штабу


async def notify_wellness_flags(db: AsyncSession, entry: WellnessEntry) -> None:
    """Травма, болезнь, сильная боль из опроса. Вызывается до commit сабмита."""
    athlete, day = entry.athlete_id, entry.date.isoformat()
    if entry.injury:
        await _notify_staff(db, athlete, NotificationType.athlete_injury, f"injury:{athlete}:{day}")
    if entry.symptom:
        await _notify_staff(db, athlete, NotificationType.athlete_illness, f"illness:{athlete}:{day}")
    if any(p.severity >= PAIN_NOTIFY_MIN_SEVERITY for p in entry.pain_points):
        await _notify_staff(db, athlete, NotificationType.athlete_pain, f"pain:{athlete}:{day}")


async def notify_risk(db: AsyncSession, athlete_id: uuid.UUID, day: date) -> None:
    """После live-пересчёта: красный Readiness и/или ACWR в high_risk.

    Readiness и нагрузка: разные ключи. Утром упал Readiness, вечером после RPE
    улетел ACWR: это два уведомления, второе несёт новую информацию. Ночной
    пересчёт сюда не ходит, иначе игрок, неделю сидящий в красном ACWR, будил бы
    тренера каждую ночь.
    """
    from app.services.dashboard_service import LOW_READINESS_REASON  # цикл импортов

    metric = await db.scalar(
        select(DailyMetric).where(DailyMetric.athlete_id == athlete_id, DailyMetric.date == day)
    )
    if metric is None:
        return

    if metric.readiness_zone == "red":
        entry = await db.scalar(
            select(WellnessEntry).where(WellnessEntry.athlete_id == athlete_id, WellnessEntry.date == day)
        )
        # Травма/болезнь уже пришли своим уведомлением и сами валят Readiness:
        # второе «низкая готовность» к тому же игроку было бы шумом.
        if entry is not None and not (entry.injury or entry.symptom):
            weakest = (
                calc.readiness_breakdown(
                    calc.ReadinessInput(
                        mood=entry.mood,
                        energy=entry.energy,
                        sleep_quality=entry.sleep_quality,
                        stress=entry.stress,
                        soreness=entry.soreness,
                        injury=entry.injury,
                        symptom=entry.symptom,
                    )
                )
                .components[0]
                .key
            )
            await _notify_staff(
                db,
                athlete_id,
                NotificationType.athlete_risk,
                f"risk:{athlete_id}:{day.isoformat()}:readiness",
                {"reasons": [LOW_READINESS_REASON.get(weakest, "low_readiness")]},
            )

    if metric.load_zone == "high_risk":
        await _notify_staff(
            db,
            athlete_id,
            NotificationType.athlete_risk,
            f"risk:{athlete_id}:{day.isoformat()}:load",
            {"reasons": ["high_load"]},
        )


# ------------------------------------------------------------------ триггеры: игроку


def _event_snapshot(event: Event) -> dict:
    return {
        "event_type": event.type.value if hasattr(event.type, "value") else event.type,
        "title": event.title,
        "planned_start": event.planned_start.isoformat(),
    }


def _is_future(event: Event) -> bool:
    start = event.planned_start
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    return start > datetime.now(UTC)


async def notify_event_created(db: AsyncSession, event: Event, actor_id: uuid.UUID) -> None:
    if event.team_id is None or not _is_future(event):
        return
    await _notify_team_athletes(db, event, NotificationType.event_created, actor_id, event.id)


async def notify_event_updated(
    db: AsyncSession,
    event: Event,
    changed: set[str],
    actor_id: uuid.UUID,
    participants_before: list[uuid.UUID] | None = None,
) -> None:
    """participants_before: назначения до правки. Сменился круг участников: кому
    событие стало видно, приходит «новое событие», кому перестало, «отменено»."""
    if event.team_id is None or not _is_future(event):
        return
    before = set(participants_before if participants_before is not None else event.workout_athlete_ids)
    after = set(event.workout_athlete_ids)
    if before == after:
        if changed.intersection(_EVENT_SIGNIFICANT_FIELDS):
            await _notify_team_athletes(db, event, NotificationType.event_updated, actor_id, event.id)
        return
    athletes = await _athletes_of_team(db, event.team_id, exclude=actor_id)
    old = {a for a in athletes if not before or a in before}
    new = {a for a in athletes if not after or a in after}
    snapshot = _event_snapshot(event)
    groups = [
        (new - old, NotificationType.event_created, event.id),
        (old - new, NotificationType.event_cancelled, None),
    ]
    if changed.intersection(_EVENT_SIGNIFICANT_FIELDS):
        groups.append((old & new, NotificationType.event_updated, event.id))
    await _insert(
        db,
        [
            _Row(user_id=a, type=ntype, team_id=event.team_id, event_id=event_id, payload=snapshot)
            for users, ntype, event_id in groups
            for a in sorted(users)
        ],
    )


async def notify_event_cancelled(db: AsyncSession, event: Event, actor_id: uuid.UUID) -> None:
    """До удаления события: ссылаться потом не на что, поэтому только снимок."""
    if event.team_id is None or not _is_future(event):
        return
    await _notify_team_athletes(db, event, NotificationType.event_cancelled, actor_id, None)


async def _notify_team_athletes(
    db: AsyncSession,
    event: Event,
    ntype: NotificationType,
    actor_id: uuid.UUID,
    event_id: uuid.UUID | None,
) -> None:
    if event.team_id is None:
        return
    athletes = await _event_athletes(db, event, exclude=actor_id)
    snapshot = _event_snapshot(event)
    await _insert(
        db,
        [
            _Row(user_id=a, type=ntype, team_id=event.team_id, event_id=event_id, payload=snapshot)
            for a in athletes
        ],
    )


async def notify_availability_changed(
    db: AsyncSession, actor_id: uuid.UUID, athlete_id: uuid.UUID, day: date, new_status: AvailabilityStatus
) -> None:
    if actor_id == athlete_id:
        return
    await _insert(
        db,
        [
            _Row(
                user_id=athlete_id,
                type=NotificationType.availability_changed,
                payload={"status": new_status.value, "date": day.isoformat()},
            )
        ],
    )


async def send_rpe_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    """Beat: событие закончилось 30 мин - 6 ч назад, RPE по нему нет. Возвращает число кандидатов.

    Командное событие: игроки команды, кроме отмеченных absent/excused.
    Индивидуальное (team_id = NULL): его автор.
    """
    now = now or datetime.now(UTC)
    end = Event.planned_start + func.make_interval(0, 0, 0, 0, 0, Event.planned_duration_min)
    events = (
        await db.execute(
            select(Event).where(
                end <= now - timedelta(minutes=settings.rpe_reminder_delay_min),
                end > now - timedelta(hours=settings.rpe_reminder_window_hours),
            )
        )
    ).scalars()

    rows: list[_Row] = []
    for event in events:
        if event.team_id is not None:
            candidates = await _event_athletes(db, event)
        else:
            candidates = [event.created_by]
        if not candidates:
            continue
        skipped = set(
            (
                await db.execute(
                    select(Attendance.user_id).where(
                        Attendance.event_id == event.id,
                        Attendance.status.in_(
                            [AttendanceStatus.absent.value, AttendanceStatus.excused.value]
                        ),
                    )
                )
            ).scalars()
        )
        rated = set(
            (await db.execute(select(RpeEntry.athlete_id).where(RpeEntry.event_id == event.id))).scalars()
        )
        snapshot = _event_snapshot(event)
        for user_id in candidates:
            if user_id in skipped or user_id in rated:
                continue
            rows.append(
                _Row(
                    user_id=user_id,
                    type=NotificationType.rpe_reminder,
                    team_id=event.team_id,
                    event_id=event.id,
                    payload=snapshot,
                    dedup_key=f"rpe:{event.id}",
                )
            )
    await _insert(db, rows)
    return len(rows)


def _zone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or settings.default_timezone)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo(settings.default_timezone)


async def send_wellness_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    """Beat: наступил час напоминания по времени организации, опроса за сегодня нет.

    Кому: активные игроки команд и пользователи личного режима (без организации).
    Штаб опрос не заполняет, напоминать ему незачем.
    """
    now = now or datetime.now(UTC)
    athlete_ids = select(TeamMembership.user_id).where(TeamMembership.team_role == TeamRole.athlete)
    candidates = (
        await db.execute(
            select(User.id, Organization.timezone)
            .outerjoin(Organization, Organization.id == User.org_id)
            .where(
                User.status == UserStatus.active,
                or_(User.id.in_(athlete_ids), User.org_id.is_(None)),
            )
        )
    ).all()

    due: dict[uuid.UUID, date] = {}
    for user_id, tz_name in candidates:
        local = now.astimezone(_zone(tz_name))
        if settings.wellness_reminder_hour <= local.hour < _WELLNESS_REMINDER_LAST_HOUR:
            due[user_id] = local.date()
    if not due:
        return 0

    filled = {
        (athlete_id, day)
        for athlete_id, day in (
            await db.execute(
                select(WellnessEntry.athlete_id, WellnessEntry.date).where(
                    WellnessEntry.athlete_id.in_(list(due)),
                    WellnessEntry.date.in_(set(due.values())),
                )
            )
        ).all()
    }
    rows = [
        _Row(
            user_id=user_id,
            type=NotificationType.wellness_reminder,
            payload={"date": day.isoformat()},
            dedup_key=f"wellness:{day.isoformat()}",
        )
        for user_id, day in due.items()
        if (user_id, day) not in filled
    ]
    await _insert(db, rows)
    return len(rows)


async def cleanup_old(db: AsyncSession, now: datetime | None = None) -> int:
    now = now or datetime.now(UTC)
    result = await db.execute(
        delete(Notification).where(
            Notification.created_at < now - timedelta(days=settings.notification_retention_days)
        )
    )
    return result.rowcount or 0


# ------------------------------------------------------------------ лента


def _visible(user_id: uuid.UUID):
    """Свои уведомления, и командные только пока пользователь в этой команде."""
    my_teams = select(TeamMembership.team_id).where(TeamMembership.user_id == user_id)
    return and_(
        Notification.user_id == user_id,
        or_(Notification.team_id.is_(None), Notification.team_id.in_(my_teams)),
    )


def _encode_cursor(n: Notification) -> str:
    raw = f"{n.created_at.isoformat()}|{n.id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        created, nid = base64.urlsafe_b64decode(cursor.encode()).decode().split("|")
        return datetime.fromisoformat(created), uuid.UUID(nid)
    except (ValueError, binascii.Error, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Некорректный курсор"
        ) from exc


def _to_out(n: Notification, athlete: User | None, event: Event | None) -> NotificationOut:
    payload = n.payload or {}
    event_out: NotificationEventOut | None = None
    if event is not None:
        event_out = NotificationEventOut(
            id=event.id, type=event.type, title=event.title, planned_start=event.planned_start
        )
    elif "planned_start" in payload:
        # Отменённое (или удалённое позже) событие: показываем снимок.
        event_out = NotificationEventOut(
            id=None,
            type=payload["event_type"],
            title=payload.get("title"),
            planned_start=payload["planned_start"],
        )
    return NotificationOut(
        id=n.id,
        type=n.type,
        created_at=n.created_at,
        read_at=n.read_at,
        team_id=n.team_id,
        athlete=(
            NotificationAthleteOut(id=athlete.id, name=display_name(athlete.last_name, athlete.first_name))
            if athlete is not None
            else None
        ),
        event=event_out,
        reasons=payload.get("reasons", []),
        status=payload.get("status"),
    )


async def list_page(
    db: AsyncSession, user_id: uuid.UUID, cursor: str | None, limit: int
) -> NotificationPageOut:
    stmt = (
        select(Notification, User, Event)
        .outerjoin(User, User.id == Notification.athlete_id)
        .outerjoin(Event, Event.id == Notification.event_id)
        .where(_visible(user_id))
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(limit + 1)
    )
    if cursor:
        created, nid = _decode_cursor(cursor)
        stmt = stmt.where(tuple_(Notification.created_at, Notification.id) < tuple_(created, nid))
    rows = (await db.execute(stmt)).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    items = [_to_out(n, athlete, event) for n, athlete, event in rows]
    next_cursor = _encode_cursor(rows[-1][0]) if has_more and rows else None
    return NotificationPageOut(items=items, next_cursor=next_cursor)


async def unread_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(_visible(user_id), Notification.read_at.is_(None))
        )
        or 0
    )


async def mark_read(db: AsyncSession, user_id: uuid.UUID, notification_id: uuid.UUID) -> None:
    """Чужой или невидимый id: 404, а не 403, существование чужих записей не подтверждаем."""
    found = await db.scalar(
        select(Notification.id).where(Notification.id == notification_id, _visible(user_id))
    )
    if found is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Уведомление не найдено")
    await db.execute(
        update(Notification)
        .where(Notification.id == notification_id, Notification.read_at.is_(None))
        .values(read_at=func.now())
    )
    await db.commit()


async def mark_all_read(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(
        update(Notification)
        .where(_visible(user_id), Notification.read_at.is_(None))
        .values(read_at=func.now())
        .execution_options(synchronize_session=False)
    )
    await db.commit()
