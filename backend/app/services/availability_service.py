"""Availability decisions are independent per professional responsibility."""

import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import authz
from app.core.availability import DIRECTIONS, AvailabilityError, Direction
from app.models.availability import AvailabilityBaseline, AvailabilityChange
from app.models.enums import AvailabilityStatus, PolicyConsentKind, TeamRole
from app.models.organization import Organization
from app.models.user import User
from app.schemas.availability import (
    AvailabilityChangeIn,
    AvailabilityChangeOut,
    AvailabilityChangePage,
    AvailabilityDirectionOut,
    AvailabilityMedicalNoteOut,
    AvailabilityMedicalNotePage,
    AvailabilityOut,
    AvailabilitySavedOut,
    AvailabilityStateOut,
    AvailabilitySummaryOut,
)
from app.services import audit_service, notifications_service, policy_consent_service
from app.services.availability_timeline import Timeline, load_timelines


async def local_today(db: AsyncSession, athlete_id: uuid.UUID) -> date:
    timezone = await db.scalar(
        select(Organization.timezone).join(User, User.org_id == Organization.id).where(User.id == athlete_id)
    )
    return datetime.now(UTC).astimezone(ZoneInfo(timezone or "UTC")).date()


async def initialize_athlete(db: AsyncSession, athlete: User) -> None:
    """Called in the membership transaction, never on GET; conflict cannot reset history."""
    if athlete.org_id is None:
        return
    await db.execute(
        insert(AvailabilityBaseline)
        .values(
            athlete_id=athlete.id,
            org_id=athlete.org_id,
            start_date=await local_today(db, athlete.id),
            source="enrollment",
            version=0,
        )
        .on_conflict_do_nothing(index_elements=["athlete_id"])
    )


async def current_status(db: AsyncSession, athlete_id: uuid.UUID, day: date) -> AvailabilityStatus | None:
    return (await load_timelines(db, [athlete_id]))[athlete_id].status(day)


async def summary_90d(db: AsyncSession, athlete_id: uuid.UUID, today: date) -> AvailabilitySummaryOut:
    return (await load_timelines(db, [athlete_id]))[athlete_id].summary(today)


async def get_history(
    db: AsyncSession, athlete_id: uuid.UUID, date_from: date, date_to: date
) -> list[AvailabilityOut]:
    return (await load_timelines(db, [athlete_id]))[athlete_id].history(date_from, date_to)


async def _health_consent(db: AsyncSession, athlete_id: uuid.UUID) -> bool:
    consent = (await policy_consent_service.status_for(db, athlete_id))[PolicyConsentKind.health_data]
    return consent.granted


def _editable(roles: set[TeamRole]) -> list[Direction]:
    result: list[Direction] = []
    if TeamRole.medic in roles:
        result.append("medical")
    if roles & {TeamRole.coach, TeamRole.head_coach}:
        result.append("coaching")
    return result


async def _authors(db: AsyncSession, changes: list[AvailabilityChange]) -> dict[uuid.UUID, str]:
    ids = {change.actor_id for change in changes}
    users = await db.scalars(select(User).where(User.id.in_(ids))) if ids else []
    return {u.id: " ".join(filter(None, [u.last_name, u.first_name])) or "—" for u in users}


def _change_out(change: AvailabilityChange, authors: dict[uuid.UUID, str]) -> AvailabilityChangeOut:
    return AvailabilityChangeOut(
        id=change.id,
        athlete_id=change.athlete_id,
        direction=change.direction,
        date=change.date,
        status=change.status,
        actor_id=change.actor_id,
        actor_name=authors.get(change.actor_id, "—"),
        actor_role=change.actor_role,
        comment=change.comment,
        source=change.source,
        version=change.version,
        created_at=change.created_at,
    )


def _direction_out(
    timeline: Timeline, change: AvailabilityChange | None, authors: dict[uuid.UUID, str]
) -> AvailabilityDirectionOut:
    assert timeline.baseline is not None
    return AvailabilityDirectionOut(
        status=change.status if change else AvailabilityStatus.full,
        effective_from=change.date if change else timeline.baseline.start_date,
        source=change.source if change else "default",
        change=_change_out(change, authors) if change else None,
    )


async def get_state(db: AsyncSession, viewer: User, athlete_id: uuid.UUID) -> AvailabilityStateOut:
    roles = await authz.availability_roles(db, viewer, athlete_id)
    timeline = (await load_timelines(db, [athlete_id]))[athlete_id]
    today = await local_today(db, athlete_id)
    consent = await _health_consent(db, athlete_id)
    details = consent and (bool(roles) or viewer.id == athlete_id)
    rows = timeline.directions(today)
    authors = await _authors(db, [r for r in rows.values() if r]) if details else {}
    directions = (
        {key: _direction_out(timeline, row if details else None, authors) for key, row in rows.items()}
        if timeline.baseline
        else dict.fromkeys(DIRECTIONS)
    )
    if not details and timeline.baseline:
        for key, row in rows.items():
            if row:
                directions[key].status = AvailabilityStatus(row.status)
                directions[key].effective_from = row.date
                directions[key].source = row.source
    return AvailabilityStateOut(
        athlete_id=athlete_id,
        today=today,
        start_date=timeline.baseline.start_date if timeline.baseline else None,
        status=timeline.status(today),
        **directions,
        version=timeline.baseline.version if timeline.baseline else 0,
        editable_directions=_editable(roles) if consent and timeline.baseline else [],
        can_view_details=details,
        summary=timeline.summary(today),
    )


async def _require_details(db: AsyncSession, viewer: User, athlete_id: uuid.UUID) -> User:
    roles = await authz.availability_roles(db, viewer, athlete_id)
    if (not roles and viewer.id != athlete_id) or not await _health_consent(db, athlete_id):
        raise AvailabilityError("forbidden", "Нет доступа к подробностям доступности")
    athlete = await db.get(User, athlete_id)
    assert athlete is not None
    return athlete


def _history_filter(athlete: User, date_from: date, date_to: date) -> tuple:
    if date_from > date_to or (date_to - date_from).days > 366:
        raise AvailabilityError("invalid", "Период истории должен быть от 1 до 367 дней")
    return (
        AvailabilityChange.athlete_id == athlete.id,
        AvailabilityChange.org_id == athlete.org_id,
        AvailabilityChange.date >= date_from,
        AvailabilityChange.date <= date_to,
    )


async def change_history(
    db: AsyncSession,
    viewer: User,
    athlete_id: uuid.UUID,
    date_from: date | None,
    date_to: date | None,
    page: int,
    size: int,
) -> AvailabilityChangePage:
    athlete = await _require_details(db, viewer, athlete_id)
    end = date_to or await local_today(db, athlete_id)
    filters = _history_filter(athlete, date_from or end - timedelta(days=89), end)
    total = await db.scalar(select(func.count()).select_from(AvailabilityChange).where(*filters))
    rows = list(
        await db.scalars(
            select(AvailabilityChange)
            .where(*filters)
            .order_by(AvailabilityChange.version.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
    )
    authors = await _authors(db, rows)
    return AvailabilityChangePage(
        items=[_change_out(r, authors) for r in rows], total=total, page=page, size=size
    )


async def medical_notes(
    db: AsyncSession,
    viewer: User,
    athlete_id: uuid.UUID,
    date_from: date | None,
    date_to: date | None,
    page: int,
    size: int,
) -> AvailabilityMedicalNotePage:
    athlete = await _require_details(db, viewer, athlete_id)
    end = date_to or await local_today(db, athlete_id)
    filters = (
        *_history_filter(athlete, date_from or end - timedelta(days=89), end),
        AvailabilityChange.medical_note.is_not(None),
    )
    total = await db.scalar(select(func.count()).select_from(AvailabilityChange).where(*filters))
    rows = await db.scalars(
        select(AvailabilityChange)
        .where(*filters)
        .order_by(AvailabilityChange.version.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    timeline = (await load_timelines(db, [athlete_id]))[athlete_id]
    current = timeline.directions(await local_today(db, athlete_id))["medical"]
    return AvailabilityMedicalNotePage(
        current=AvailabilityMedicalNoteOut(
            change_id=current.id, date=current.date, medical_note=current.medical_note
        )
        if current and current.medical_note
        else None,
        items=[
            AvailabilityMedicalNoteOut(change_id=r.id, date=r.date, medical_note=r.medical_note) for r in rows
        ],
        total=total,
        page=page,
        size=size,
    )


async def _locked_baseline(db: AsyncSession, athlete_id: uuid.UUID) -> AvailabilityBaseline:
    baseline = await db.scalar(
        select(AvailabilityBaseline)
        .where(AvailabilityBaseline.athlete_id == athlete_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if baseline is None:
        raise AvailabilityError("conflict", "Учёт доступности ещё не инициализирован")
    return baseline


def _validate_change(data: AvailabilityChangeIn, baseline: AvailabilityBaseline, today: date) -> None:
    if data.expected_version != baseline.version:
        raise AvailabilityError("conflict", "Статус уже изменён. Обновите данные и повторите сохранение")
    if not baseline.start_date <= data.date <= today:
        raise AvailabilityError("invalid", "Дата должна быть между началом учёта и сегодняшним днём")


def _assert_replay(change: AvailabilityChange, actor: User, data: AvailabilityChangeIn) -> None:
    same = (
        change.actor_id == actor.id
        and change.athlete_id == data.athlete_id
        and change.direction == data.direction
        and change.date == data.date
        and change.status == data.status
        and change.comment == data.comment
        and change.medical_note == (data.medical_note or None)
    )
    if not same:
        raise AvailabilityError("conflict", "Этот идентификатор запроса уже использован")


async def _record_change(
    db: AsyncSession,
    actor: User,
    data: AvailabilityChangeIn,
    baseline: AvailabilityBaseline,
    role: TeamRole,
) -> AvailabilityChange:
    baseline.version += 1
    change = AvailabilityChange(
        **data.model_dump(exclude={"expected_version", "medical_note"}),
        medical_note=data.medical_note or None,
        actor_id=actor.id,
        org_id=baseline.org_id,
        actor_role=role.value,
        version=baseline.version,
    )
    db.add(change)
    await db.flush()
    return change


def _audit_change(
    db: AsyncSession,
    change: AvailabilityChange,
    before: AvailabilityStatus | None,
    after: AvailabilityStatus | None,
) -> None:
    audit_service.log(
        db,
        change.actor_id,
        "availability.set",
        "availability",
        change.athlete_id,
        {
            "change_id": str(change.id),
            "direction": change.direction,
            "date": change.date.isoformat(),
            "status": change.status,
            "old_effective_status": before,
            "new_effective_status": after,
        },
    )


async def save_change(db: AsyncSession, actor: User, data: AvailabilityChangeIn) -> AvailabilitySavedOut:
    roles = await authz.availability_roles(db, actor, data.athlete_id)
    if data.direction not in _editable(roles) or (
        data.medical_note is not None and data.direction != "medical"
    ):
        raise AvailabilityError("forbidden", "Нельзя менять чужое направление доступности")
    await _require_details(db, actor, data.athlete_id)
    # Serialize the global idempotency key even when two requests target different athletes.
    await db.execute(
        select(func.pg_advisory_xact_lock(int.from_bytes(data.request_id.bytes[:8], signed=True)))
    )
    baseline = await _locked_baseline(db, data.athlete_id)
    if baseline.org_id != actor.org_id:
        raise AvailabilityError("not_found", "Игрок не найден")
    existing = await db.scalar(
        select(AvailabilityChange).where(AvailabilityChange.request_id == data.request_id)
    )
    if existing:
        _assert_replay(existing, actor, data)
        return AvailabilitySavedOut(
            change=_change_out(existing, await _authors(db, [existing])),
            state=await get_state(db, actor, data.athlete_id),
        )
    today = await local_today(db, data.athlete_id)
    _validate_change(data, baseline, today)
    before = await current_status(db, data.athlete_id, today)
    role = (
        TeamRole.medic
        if data.direction == "medical"
        else (TeamRole.head_coach if TeamRole.head_coach in roles else TeamRole.coach)
    )
    change = await _record_change(db, actor, data, baseline, role)
    after = await current_status(db, data.athlete_id, today)
    _audit_change(db, change, before, after)
    if before != after:
        await notifications_service.notify_availability_changed(db, actor.id, data.athlete_id, today, after)
    await db.commit()
    return AvailabilitySavedOut(
        change=_change_out(change, await _authors(db, [change])),
        state=await get_state(db, actor, data.athlete_id),
    )
