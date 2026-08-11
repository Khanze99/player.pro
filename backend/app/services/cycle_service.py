"""Менструальный цикл (этап 1, docs/plan-women-health-nutrition.md).

Сознательно НЕ делает: не выдаёт рекомендаций по нагрузке на основе фазы.
Мета-анализ McNulty et al. (2020) показывает тривиальный усреднённый эффект фазы
на работоспособность при огромном межиндивидуальном разбросе — предписания на
такой основе выдавали бы шум за сигнал. Вместо этого показываем спортсменке её
собственный паттерн и оставляем решение ей.
"""

import uuid
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import calculations as calc
from app.models.cycle import CycleLog, CycleSettings, CycleSymptomLog
from app.models.enums import (
    OVULATION_SUPPRESSING,
    TRAINING_AFFECTING_SYMPTOMS,
    Contraception,
    CyclePhase,
    CycleSymptom,
)
from app.models.metric import DailyMetric
from app.schemas.cycle import (
    CycleInsightOut,
    CycleLogIn,
    CycleSettingsIn,
    CycleStaffCoachOut,
    CycleStaffMedicOut,
    CycleStateOut,
    PhaseInsightOut,
)

INSIGHT_WINDOW_DAYS = 180
SYMPTOM_FLAG_SEVERITY = 6  # с какой выраженности симптом считаем влияющим на тренировку


# ------------------------------------------------------------------ настройки


DEFAULT_CYCLE_LENGTH = 28
DEFAULT_PERIOD_LENGTH = 5


async def get_settings(db: AsyncSession, user_id: uuid.UUID) -> CycleSettings:
    """Настройки создаются лениво: отсутствие записи — это выключенный трекинг.

    Значения задаём явно: default= у mapped_column срабатывает только при INSERT,
    а этот объект в БД не попадает — иначе все поля были бы None.
    """
    settings = await db.get(CycleSettings, user_id)
    if settings is None:
        settings = CycleSettings(
            user_id=user_id,
            tracking_enabled=False,
            average_cycle_length=DEFAULT_CYCLE_LENGTH,
            average_period_length=DEFAULT_PERIOD_LENGTH,
            contraception=Contraception.not_specified,
        )
    return settings


async def upsert_settings(db: AsyncSession, user_id: uuid.UUID, data: CycleSettingsIn) -> CycleSettings:
    settings = await db.get(CycleSettings, user_id)
    if settings is None:
        settings = CycleSettings(user_id=user_id)
        db.add(settings)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)
    await db.commit()
    await db.refresh(settings)
    return settings


# ------------------------------------------------------------------ записи


async def upsert_log(db: AsyncSession, athlete_id: uuid.UUID, data: CycleLogIn) -> CycleLog:
    """Одна запись на день: повторный ввод перезаписывает, а не плодит дубли."""
    row = await db.execute(
        select(CycleLog).where(CycleLog.athlete_id == athlete_id, CycleLog.date == data.date)
    )
    log = row.scalar_one_or_none()
    if log is None:
        log = CycleLog(athlete_id=athlete_id, date=data.date)
        db.add(log)
        await db.flush()

    log.period_start = data.period_start
    log.period_end = data.period_end
    log.flow = data.flow
    log.note = data.note

    # Симптомы заменяем через DELETE + INSERT, а не log.symptoms.clear():
    # у только что созданного объекта коллекция ещё не загружена, и обращение
    # к ней в async-сессии роняет greenlet (MissingGreenlet).
    await db.execute(delete(CycleSymptomLog).where(CycleSymptomLog.log_id == log.id))
    for item in data.symptoms:
        db.add(CycleSymptomLog(log_id=log.id, symptom=item.symptom, severity=item.severity))

    await db.commit()

    # Перечитываем через select, чтобы selectin подтянул symptoms
    row = await db.execute(select(CycleLog).where(CycleLog.id == log.id))
    return row.scalar_one()


async def get_logs(db: AsyncSession, athlete_id: uuid.UUID, date_from: date, date_to: date) -> list[CycleLog]:
    rows = await db.execute(
        select(CycleLog)
        .where(
            CycleLog.athlete_id == athlete_id,
            CycleLog.date >= date_from,
            CycleLog.date <= date_to,
        )
        .order_by(CycleLog.date)
    )
    return list(rows.scalars())


async def delete_log(db: AsyncSession, athlete_id: uuid.UUID, day: date) -> None:
    row = await db.execute(select(CycleLog).where(CycleLog.athlete_id == athlete_id, CycleLog.date == day))
    log = row.scalar_one_or_none()
    if log is not None:
        await db.delete(log)
        await db.commit()


async def _period_starts(db: AsyncSession, athlete_id: uuid.UUID, until: date) -> list[date]:
    rows = await db.execute(
        select(CycleLog.date)
        .where(
            CycleLog.athlete_id == athlete_id,
            CycleLog.period_start.is_(True),
            CycleLog.date <= until,
        )
        .order_by(CycleLog.date)
    )
    return list(rows.scalars())


# ------------------------------------------------------------------ состояние


async def current_state(db: AsyncSession, athlete_id: uuid.UUID, day: date) -> CycleStateOut:
    settings = await get_settings(db, athlete_id)
    starts = await _period_starts(db, athlete_id, day)
    last_start = starts[-1] if starts else None

    # Наблюдаемая длина цикла точнее заявленной — если данных хватает, берём её
    observed = calc.average_cycle_length(starts)
    cycle_length = observed or settings.average_cycle_length

    suppressed = Contraception(settings.contraception) in OVULATION_SUPPRESSING
    day_of_cycle = calc.cycle_day(day, last_start)
    phase = calc.cycle_phase(
        day_of_cycle, cycle_length, settings.average_period_length, suppressed=suppressed
    )

    return CycleStateOut(
        date=day,
        tracking_enabled=settings.tracking_enabled,
        cycle_day=day_of_cycle,
        phase=CyclePhase(phase),
        last_period_start=last_start,
        next_period_predicted=(None if suppressed else calc.predict_next_period(last_start, cycle_length)),
        average_cycle_length=cycle_length,
        observed_cycle_length=observed,
        days_since_last_period=(day - last_start).days if last_start else None,
        amenorrhea_flag=calc.is_amenorrhea(day, last_start),
        contraception=Contraception(settings.contraception),
    )


# ------------------------------------------------------------------ витрины для штаба


async def _has_training_affecting_symptom(db: AsyncSession, athlete_id: uuid.UUID, day: date) -> bool:
    rows = await db.execute(
        select(CycleSymptomLog.symptom, CycleSymptomLog.severity)
        .join(CycleLog, CycleLog.id == CycleSymptomLog.log_id)
        .where(CycleLog.athlete_id == athlete_id, CycleLog.date == day)
    )
    return any(
        CycleSymptom(symptom) in TRAINING_AFFECTING_SYMPTOMS and severity >= SYMPTOM_FLAG_SEVERITY
        for symptom, severity in rows
    )


async def staff_view_for_coach(db: AsyncSession, athlete_id: uuid.UUID, day: date) -> CycleStaffCoachOut:
    """Тренеру — фаза и один флаг. Ни дат, ни симптомов, ни прогнозов."""
    state = await current_state(db, athlete_id, day)
    return CycleStaffCoachOut(
        athlete_id=athlete_id,
        date=day,
        phase=state.phase,
        has_training_affecting_symptoms=await _has_training_affecting_symptom(db, athlete_id, day),
    )


async def staff_view_for_medic(db: AsyncSession, athlete_id: uuid.UUID, day: date) -> CycleStaffMedicOut:
    """Врачу — клиническая картина целиком, включая флаг аменореи."""
    state = await current_state(db, athlete_id, day)
    logs = await get_logs(db, athlete_id, day - timedelta(days=6), day)
    symptoms = [
        {"date": log.date, "symptom": s.symptom, "severity": s.severity} for log in logs for s in log.symptoms
    ]
    return CycleStaffMedicOut(athlete_id=athlete_id, state=state, recent_symptoms=symptoms)


# ------------------------------------------------------------------ инсайты


async def insights(db: AsyncSession, athlete_id: uuid.UUID, day: date) -> CycleInsightOut:
    """Личный паттерн: как её собственные Readiness и нагрузка распределены по фазам.

    Это описание того, что было, а не предсказание и не рекомендация.
    """
    window_start = day - timedelta(days=INSIGHT_WINDOW_DAYS)
    settings = await get_settings(db, athlete_id)
    starts = await _period_starts(db, athlete_id, day)
    cycle_length = calc.average_cycle_length(starts) or settings.average_cycle_length
    suppressed = Contraception(settings.contraception) in OVULATION_SUPPRESSING

    rows = await db.execute(
        select(DailyMetric)
        .where(
            DailyMetric.athlete_id == athlete_id,
            DailyMetric.date >= window_start,
            DailyMetric.date <= day,
        )
        .order_by(DailyMetric.date)
    )
    metrics = list(rows.scalars())

    readiness_by_phase: dict[str, list[float]] = defaultdict(list)
    load_by_phase: dict[str, list[float]] = defaultdict(list)
    days_by_phase: dict[str, int] = defaultdict(int)

    for metric in metrics:
        anchor = max((s for s in starts if s <= metric.date), default=None)
        phase = calc.cycle_phase(
            calc.cycle_day(metric.date, anchor),
            cycle_length,
            settings.average_period_length,
            suppressed=suppressed,
        )
        days_by_phase[phase] += 1
        if metric.readiness is not None:
            readiness_by_phase[phase].append(float(metric.readiness))
        load_by_phase[phase].append(metric.daily_load)

    phases = [
        PhaseInsightOut(
            phase=CyclePhase(phase),
            days=days_by_phase[phase],
            avg_readiness=calc.mean(readiness_by_phase[phase]),
            avg_load=calc.mean(load_by_phase[phase]),
        )
        for phase in days_by_phase
    ]
    phases.sort(key=lambda p: p.phase.value)

    covered = sum(days_by_phase[p] for p in days_by_phase if p != CyclePhase.unknown.value)
    return CycleInsightOut(
        window_days=INSIGHT_WINDOW_DAYS,
        cycles_recorded=max(0, len(starts) - 1),
        covered_days=covered,
        # Меньше двух полных циклов — паттерн показывать рано, это будет шум
        enough_data=len(starts) >= 3,
        phases=phases,
    )
