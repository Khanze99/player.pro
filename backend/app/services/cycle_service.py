"""Минимальный трекинг цикла (решение 2026-10-16, docs/plan-women-health-nutrition.md):
отметка «сегодня месячные» + болевой порог. Фаза, прогноз следующей менструации,
аменорея и детальные симптомы убраны из кода — если понадобятся, возвращать
отдельным решением, не восстанавливать по памяти.

Записывать может только сама спортсменка (роуты); сервис читает чужие данные
только через authz.ensure_can_view_sensitive(scope=cycle) выше по стеку.
"""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cycle import CycleLog, CycleSettings
from app.schemas.cycle import CycleLogIn, CycleSettingsIn, CycleStaffOut

DEFAULT_CYCLE_LENGTH = 28
DEFAULT_PERIOD_LENGTH = 5


# ------------------------------------------------------------------ настройки


async def get_settings(db: AsyncSession, user_id: uuid.UUID) -> CycleSettings:
    """Настройки создаются лениво — отсутствие записи просто значит «дефолты».

    Значения задаём явно: default= у mapped_column срабатывает только при INSERT,
    а этот объект в БД не попадает — иначе все поля были бы None.
    """
    settings = await db.get(CycleSettings, user_id)
    if settings is None:
        settings = CycleSettings(
            user_id=user_id,
            average_cycle_length=DEFAULT_CYCLE_LENGTH,
            average_period_length=DEFAULT_PERIOD_LENGTH,
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

    log.on_period = data.on_period
    log.pain_level = data.pain_level

    await db.commit()
    await db.refresh(log)
    return log


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


async def record_from_wellness(
    db: AsyncSession, athlete_id: uuid.UUID, day: date, on_period: bool | None, pain_level: int | None
) -> None:
    """Пишет цикл-поля из утреннего опроса прямо в `cycle_logs`, а не в `WellnessEntry` —
    иначе согласие на цикл обходилось бы через опрос, который coach/medic видят без
    него (ensure_can_view_athlete).

    Запись, поставленная вручную на экране цикла, не трогается: только дозаполняем
    `pain_level`, если он там ещё не был задан. on_period=None — поля цикла в опросе
    не заполнялись (не женщина/клиент их не прислал) — писать нечего.
    """
    if on_period is None:
        return

    row = await db.execute(select(CycleLog).where(CycleLog.athlete_id == athlete_id, CycleLog.date == day))
    log = row.scalar_one_or_none()

    if log is not None:
        if pain_level is not None and log.pain_level is None:
            log.pain_level = pain_level
            await db.commit()
        return

    db.add(CycleLog(athlete_id=athlete_id, date=day, on_period=on_period, pain_level=pain_level))
    await db.commit()


# ------------------------------------------------------------------ витрина для штаба


async def staff_view(db: AsyncSession, athlete_id: uuid.UUID, day: date) -> CycleStaffOut:
    """Единая витрина coach/medic: детализации больше нет, скрывать нечего —
    видимость целиком решает ensure_can_view_sensitive выше по стеку."""
    row = await db.execute(select(CycleLog).where(CycleLog.athlete_id == athlete_id, CycleLog.date == day))
    log = row.scalar_one_or_none()
    return CycleStaffOut(
        athlete_id=athlete_id,
        date=day,
        on_period=bool(log and log.on_period),
        pain_level=log.pain_level if log else None,
    )
