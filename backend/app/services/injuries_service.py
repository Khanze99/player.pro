"""Травмы (раздел 3.3 ТЗ). Изменения — под аудит."""

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import InjuryStatus
from app.models.injury import InjuryRecord
from app.schemas.injury import InjuryCreateIn, InjuryUpdateIn
from app.services import audit_service


async def create_injury(db: AsyncSession, actor_id: uuid.UUID, data: InjuryCreateIn) -> InjuryRecord:
    injury = InjuryRecord(created_by=actor_id, **data.model_dump())
    db.add(injury)
    await db.flush()
    audit_service.log(db, actor_id, "injury.create", "injury", injury.id, {"type": data.type})
    await db.commit()
    await db.refresh(injury)
    return injury


async def get_injury(db: AsyncSession, injury_id: uuid.UUID) -> InjuryRecord:
    injury = await db.get(InjuryRecord, injury_id)
    if injury is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Травма не найдена")
    return injury


async def update_injury(
    db: AsyncSession, actor_id: uuid.UUID, injury: InjuryRecord, data: InjuryUpdateIn
) -> InjuryRecord:
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(injury, field, value)
    audit_service.log(
        db, actor_id, "injury.update", "injury", injury.id, {k: str(v) for k, v in changes.items()}
    )
    await db.commit()
    await db.refresh(injury)
    return injury


async def list_athlete_injuries(db: AsyncSession, athlete_id: uuid.UUID) -> list[InjuryRecord]:
    rows = await db.execute(
        select(InjuryRecord)
        .where(InjuryRecord.athlete_id == athlete_id)
        .order_by(InjuryRecord.start_date.desc())
    )
    return list(rows.scalars())


async def has_active_injury(db: AsyncSession, athlete_id: uuid.UUID) -> bool:
    row = await db.execute(
        select(InjuryRecord.id)
        .where(InjuryRecord.athlete_id == athlete_id, InjuryRecord.status == InjuryStatus.active)
        .limit(1)
    )
    return row.scalar_one_or_none() is not None
