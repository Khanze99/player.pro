"""УМО/ТМО — docs/plan-medical-exams.md. История (append-only, как травмы),
изменения — под аудит (тот же принцип, что у injuries_service)."""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import MedicalExamKind
from app.models.medical_exam import MedicalExam
from app.schemas.medical_exam import MedicalExamIn
from app.services import audit_service


async def create(
    db: AsyncSession, athlete_id: uuid.UUID, actor_id: uuid.UUID, data: MedicalExamIn
) -> MedicalExam:
    exam = MedicalExam(athlete_id=athlete_id, created_by=actor_id, **data.model_dump())
    db.add(exam)
    await db.flush()
    audit_service.log(
        db,
        actor_id,
        "medical_exam.create",
        "medical_exam",
        exam.id,
        {"athlete_id": str(athlete_id), "kind": data.kind.value},
    )
    await db.commit()
    await db.refresh(exam)
    return exam


async def list_for_athlete(db: AsyncSession, athlete_id: uuid.UUID) -> list[MedicalExam]:
    rows = await db.execute(
        select(MedicalExam)
        .where(MedicalExam.athlete_id == athlete_id)
        .order_by(MedicalExam.passed_date.desc())
    )
    return list(rows.scalars())


def current_status(exams: list[MedicalExam]) -> dict[MedicalExamKind, MedicalExam | None]:
    """Самая свежая по passed_date запись каждого типа — «текущий» УМО/ТМО.

    Не запрос к БД: применяется поверх уже загруженного list_for_athlete (тот
    уже отсортирован новыми сверху), чтобы не дублировать сортировку/выборку.
    Является ли она ещё действующей (valid_until >= сегодня) — решает клиент,
    у него уже есть обе даты; здесь только «какая запись последняя».
    """
    latest: dict[MedicalExamKind, MedicalExam | None] = dict.fromkeys(MedicalExamKind)
    for exam in exams:
        current = latest[exam.kind]
        if current is None or exam.passed_date > current.passed_date:
            latest[exam.kind] = exam
    return latest


def is_valid_today(exam: MedicalExam | None, today: date | None = None) -> bool:
    if exam is None:
        return False
    return exam.valid_until >= (today or date.today())
