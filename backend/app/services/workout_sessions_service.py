"""Выполнение тренировки (docs/plan-workout-builder.md, раздел «Выполнение»).

Сессия создаётся при старте, подходы предзаполняются из шаблона и сохраняются
по ходу (полная замена списка), finish закрывает сессию и отдаёт фактическую
длительность для RPE. На метрики не влияет: нагрузка идёт только через RPE.

Что сессия и шаблон принадлежат пользователю, проверяет роут через authz.
"""

import math
import uuid
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.enums import EventType
from app.models.event import Event
from app.models.exercise import Exercise
from app.models.user import User
from app.models.workout import Workout, WorkoutItem, WorkoutSession, WorkoutSessionSet
from app.schemas.exercise import ExerciseHistoryOut, ExerciseShortOut, HistorySetOut
from app.schemas.workout import (
    LastResultOut,
    LastSetOut,
    SessionSetOut,
    SessionSetsIn,
    WorkoutSessionFinishOut,
    WorkoutSessionOut,
    WorkoutSessionShortOut,
    WorkoutSessionStartIn,
)
from app.services import exercise_service, workouts_service

MAX_ELAPSED_MIN = 600  # потолок duration_min у RPE


def _conflict(code: str, message: str, session_id: uuid.UUID | None) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": code, "message": message, "session_id": str(session_id) if session_id else None},
    )


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тренировка не найдена")


async def active_session_id(db: AsyncSession, athlete_id: uuid.UUID) -> uuid.UUID | None:
    return await db.scalar(
        select(WorkoutSession.id).where(
            WorkoutSession.athlete_id == athlete_id, WorkoutSession.finished_at.is_(None)
        )
    )


async def _ensure_no_active(db: AsyncSession, athlete_id: uuid.UUID) -> None:
    active = await active_session_id(db, athlete_id)
    if active is not None:
        raise _conflict("active_session", "Уже идёт другая тренировка", active)


def _sets_from_template(items: list[WorkoutItem]) -> list[WorkoutSessionSet]:
    """План = факт по умолчанию: пользователь отмечает подход и правит, если сделал иначе."""
    return [
        WorkoutSessionSet(
            position=item.position,
            exercise_id=item.exercise_id,
            set_index=index,
            mode=item.mode,
            planned_reps=item.reps,
            planned_weight_kg=item.weight_kg,
            planned_duration_sec=item.duration_sec,
            reps=item.reps,
            weight_kg=item.weight_kg,
            duration_sec=item.duration_sec,
            done=False,
        )
        for item in items
        for index in range(item.sets)
    ]


def _local_date(moment: datetime) -> date:
    """День события для личного режима: таймзоны у пользователя нет, берём общую."""
    return moment.astimezone(ZoneInfo(settings.default_timezone)).date()


async def start(
    db: AsyncSession, user: User, data: WorkoutSessionStartIn, workout: Workout | None
) -> uuid.UUID:
    """workout передаёт роут для варианта «начать сейчас» (уже проверен authz).
    Возвращает id сессии; ответ собирает build_out."""
    await _ensure_no_active(db, user.id)

    if data.event_id is not None:
        event = await db.get(Event, data.event_id)
        if event is None or event.team_id is not None or event.created_by != user.id:
            # Командное событие с шаблоном невозможно, чужое не раскрываем
            raise _not_found()
        if event.workout_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="К событию не привязана тренировка"
            )
        existing = await db.scalar(select(WorkoutSession.id).where(WorkoutSession.event_id == event.id))
        if existing is not None:
            raise _conflict("event_has_session", "Эта тренировка уже выполнялась", existing)
        workout = await workouts_service.load(db, event.workout_id)
        session_date = _local_date(event.planned_start)
    else:
        assert workout is not None and data.date is not None  # гарантирует схема и роут
        # У события свой план: копируем, как при выборе шаблона в календаре
        workout = await workouts_service.copy_as_event_plan(db, workout)
        workout = await workouts_service.load(db, workout.id)
        # «Начать сейчас» тоже событие: RPE, напоминание и календарь работают как обычно
        event = Event(
            team_id=None,
            # Тип личного события, как в event-create.tsx (PERSONAL_TYPES)
            type=EventType.individual,
            title=workout.name,
            planned_start=datetime.now(UTC),
            planned_duration_min=workouts_service.estimate_duration_min(workout.items),
            created_by=user.id,
            workout_id=workout.id,
        )
        db.add(event)
        await db.flush()
        session_date = data.date

    session = WorkoutSession(
        athlete_id=user.id,
        event_id=event.id,
        workout_id=workout.id,
        workout_name=workout.name,
        date=session_date,
    )
    session.sets = _sets_from_template(workout.items)
    db.add(session)
    try:
        await db.commit()
    except IntegrityError:
        # Гонка двух стартов: частичные уникальные индексы не дали создать вторую
        await db.rollback()
        # Сначала своё событие: если его сессию только что создал параллельный
        # старт, это «уже выполнялась», а не «идёт другая тренировка»
        if data.event_id is not None:
            existing = await db.scalar(
                select(WorkoutSession.id).where(WorkoutSession.event_id == data.event_id)
            )
            if existing is not None:
                raise _conflict("event_has_session", "Эта тренировка уже выполнялась", existing) from None
        active = await active_session_id(db, user.id)
        raise _conflict("active_session", "Уже идёт другая тренировка", active) from None
    return session.id


async def _load(db: AsyncSession, session_id: uuid.UUID) -> WorkoutSession:
    row = await db.scalar(
        select(WorkoutSession)
        .where(WorkoutSession.id == session_id)
        .options(selectinload(WorkoutSession.sets))
        .execution_options(populate_existing=True)
    )
    if row is None:
        raise _not_found()
    return row


async def _last_results(
    db: AsyncSession, athlete_id: uuid.UUID, exercise_ids: set[uuid.UUID], exclude_session: uuid.UUID
) -> list[LastResultOut]:
    """Прошлый раз по каждому упражнению: последняя завершённая сессия, где был
    хоть один выполненный подход. Два запроса вместо N."""
    if not exercise_ids:
        return []
    latest = await db.execute(
        select(WorkoutSessionSet.exercise_id, WorkoutSession.id, WorkoutSession.date)
        .join(WorkoutSession, WorkoutSession.id == WorkoutSessionSet.session_id)
        .where(
            WorkoutSession.athlete_id == athlete_id,
            WorkoutSession.finished_at.is_not(None),
            WorkoutSession.id != exclude_session,
            WorkoutSessionSet.exercise_id.in_(exercise_ids),
            WorkoutSessionSet.done.is_(True),
        )
        .distinct(WorkoutSessionSet.exercise_id)
        .order_by(WorkoutSessionSet.exercise_id, WorkoutSession.finished_at.desc())
    )
    picked = {exercise_id: (session_id, day) for exercise_id, session_id, day in latest}
    if not picked:
        return []
    rows = await db.scalars(
        select(WorkoutSessionSet)
        .where(
            WorkoutSessionSet.session_id.in_({session_id for session_id, _ in picked.values()}),
            WorkoutSessionSet.exercise_id.in_(picked.keys()),
            WorkoutSessionSet.done.is_(True),
        )
        .order_by(WorkoutSessionSet.position, WorkoutSessionSet.set_index)
    )
    sets_by_exercise: dict[uuid.UUID, list[LastSetOut]] = {}
    for row in rows:
        if picked[row.exercise_id][0] == row.session_id:
            sets_by_exercise.setdefault(row.exercise_id, []).append(
                LastSetOut(reps=row.reps, weight_kg=row.weight_kg, duration_sec=row.duration_sec)
            )
    return [
        LastResultOut(exercise_id=exercise_id, date=picked[exercise_id][1], sets=sets)
        for exercise_id, sets in sets_by_exercise.items()
    ]


async def build_out(db: AsyncSession, session_id: uuid.UUID) -> WorkoutSessionOut:
    session = await _load(db, session_id)
    exercise_ids = {s.exercise_id for s in session.sets}
    exercises = (
        list(await db.scalars(select(Exercise).where(Exercise.id.in_(exercise_ids)))) if exercise_ids else []
    )

    # Отдых берём из текущего шаблона, только если на позиции то же упражнение:
    # шаблон могли переставить после старта, тогда отдых не подставляем.
    rest: dict[int, int] = {}
    if session.workout_id is not None:
        items = await db.scalars(select(WorkoutItem).where(WorkoutItem.workout_id == session.workout_id))
        exercise_at = {s.position: s.exercise_id for s in session.sets}
        rest = {
            item.position: item.rest_sec
            for item in items
            if item.rest_sec is not None and exercise_at.get(item.position) == item.exercise_id
        }

    return WorkoutSessionOut(
        id=session.id,
        athlete_id=session.athlete_id,
        event_id=session.event_id,
        workout_id=session.workout_id,
        workout_name=session.workout_name,
        date=session.date,
        started_at=session.started_at,
        finished_at=session.finished_at,
        sets=[SessionSetOut.model_validate(s) for s in session.sets],
        exercises=[ExerciseShortOut.model_validate(e) for e in exercises],
        rest_sec_by_position=rest,
        last_results=await _last_results(db, session.athlete_id, exercise_ids, session.id),
    )


async def _lock(db: AsyncSession, session: WorkoutSession) -> WorkoutSession:
    """Блокирует строку сессии до конца транзакции. Сохранение подходов и
    завершение идут по одной сессии строго друг за другом: без этого два
    параллельных PUT удаляют и вставляют одни и те же слоты (UniqueViolation),
    а finish может проскочить между ними. finished_at читаем заново после
    блокировки, значение из authz могло устареть."""
    locked = await db.scalar(
        select(WorkoutSession)
        .where(WorkoutSession.id == session.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if locked is None:  # удалили параллельно
        raise _not_found()
    return locked


async def replace_sets(db: AsyncSession, session: WorkoutSession, data: SessionSetsIn) -> WorkoutSessionOut:
    session = await _lock(db, session)
    if session.finished_at is not None:
        raise _conflict("session_finished", "Тренировка уже завершена", session.id)
    await exercise_service.ensure_exist(db, {s.exercise_id for s in data.sets})
    await db.execute(delete(WorkoutSessionSet).where(WorkoutSessionSet.session_id == session.id))
    for item in data.sets:
        db.add(WorkoutSessionSet(session_id=session.id, **item.model_dump()))
    await db.commit()
    return await build_out(db, session.id)


async def finish(db: AsyncSession, session: WorkoutSession) -> WorkoutSessionFinishOut:
    """Идемпотентно: повтор после потерянного ответа отдаёт тот же результат,
    а не 409, иначе клиент не попадёт в RPE. finished_at не перезаписывается."""
    session = await _lock(db, session)
    if session.finished_at is None:
        session.finished_at = datetime.now(UTC)
        await db.commit()
    elapsed = math.ceil((session.finished_at - session.started_at).total_seconds() / 60)
    return WorkoutSessionFinishOut(
        event_id=session.event_id, elapsed_min=min(max(elapsed, 1), MAX_ELAPSED_MIN)
    )


async def discard(db: AsyncSession, session: WorkoutSession) -> None:
    """Отмена: подходы уходят каскадом, событие остаётся (его можно начать заново).
    Завершённую не удаляем: это история упражнений и отметка «выполнено» для RPE."""
    session = await _lock(db, session)
    if session.finished_at is not None:
        raise _conflict("session_finished", "Тренировка уже завершена", session.id)
    await db.delete(session)
    await db.commit()


def today_local() -> date:
    return _local_date(datetime.now(UTC))


async def list_mine(
    db: AsyncSession,
    athlete_id: uuid.UUID,
    date_from: date,
    date_to: date,
    event_id: uuid.UUID | None = None,
) -> list[WorkoutSessionShortOut]:
    """С event_id даты не учитываются: карточке события нужна его сессия
    независимо от того, на какой день оно стоит."""
    counts = (
        select(
            WorkoutSessionSet.session_id,
            func.count(func.distinct(WorkoutSessionSet.exercise_id)).label("exercises"),
            func.count().filter(WorkoutSessionSet.done.is_(True)).label("done"),
            func.count().label("total"),
        )
        .group_by(WorkoutSessionSet.session_id)
        .subquery()
    )
    rows = await db.execute(
        select(WorkoutSession, counts.c.exercises, counts.c.done, counts.c.total)
        .outerjoin(counts, counts.c.session_id == WorkoutSession.id)
        .where(
            WorkoutSession.athlete_id == athlete_id,
            *(
                (WorkoutSession.event_id == event_id,)
                if event_id is not None
                else (WorkoutSession.date >= date_from, WorkoutSession.date <= date_to)
            ),
        )
        .order_by(WorkoutSession.date.desc(), WorkoutSession.started_at.desc())
    )
    return [
        WorkoutSessionShortOut(
            id=session.id,
            event_id=session.event_id,
            workout_name=session.workout_name,
            date=session.date,
            started_at=session.started_at,
            finished_at=session.finished_at,
            exercises_count=exercises or 0,
            sets_done=done or 0,
            sets_total=total or 0,
        )
        for session, exercises, done, total in rows
    ]


async def exercise_history(
    db: AsyncSession, athlete_id: uuid.UUID, exercise_id: uuid.UUID, limit: int
) -> list[ExerciseHistoryOut]:
    """Мои завершённые тренировки с этим упражнением, новые сверху."""
    session_rows = await db.execute(
        select(WorkoutSession.id, WorkoutSession.date, WorkoutSession.workout_name)
        .join(WorkoutSessionSet, WorkoutSessionSet.session_id == WorkoutSession.id)
        .where(
            WorkoutSession.athlete_id == athlete_id,
            WorkoutSession.finished_at.is_not(None),
            WorkoutSessionSet.exercise_id == exercise_id,
        )
        .group_by(WorkoutSession.id)
        .order_by(WorkoutSession.finished_at.desc())
        .limit(limit)
    )
    sessions = list(session_rows)
    if not sessions:
        return []
    sets = await db.scalars(
        select(WorkoutSessionSet)
        .where(
            WorkoutSessionSet.session_id.in_([row.id for row in sessions]),
            WorkoutSessionSet.exercise_id == exercise_id,
        )
        .order_by(WorkoutSessionSet.position, WorkoutSessionSet.set_index)
    )
    by_session: dict[uuid.UUID, list[WorkoutSessionSet]] = {}
    for s in sets:
        by_session.setdefault(s.session_id, []).append(s)
    return [
        ExerciseHistoryOut(
            session_id=row.id,
            date=row.date,
            workout_name=row.workout_name,
            mode=by_session[row.id][0].mode,
            sets=[HistorySetOut.model_validate(s) for s in by_session[row.id]],
        )
        for row in sessions
    ]
