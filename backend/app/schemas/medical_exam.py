import uuid
from datetime import date, datetime

from pydantic import BaseModel, model_validator

from app.models.enums import MedicalExamKind


class MedicalExamIn(BaseModel):
    kind: MedicalExamKind
    passed_date: date
    valid_until: date

    @model_validator(mode="after")
    def _check_dates(self) -> "MedicalExamIn":
        if self.valid_until < self.passed_date:
            raise ValueError("Срок действия не может быть раньше даты прохождения")
        return self


class MedicalExamOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    athlete_id: uuid.UUID
    kind: MedicalExamKind
    passed_date: date
    valid_until: date
    created_by: uuid.UUID
    created_at: datetime


class MedicalExamsOut(BaseModel):
    """Вся история + самая свежая запись каждого типа — чтобы клиенту не
    считать «текущий» УМО/ТМО самому (medical_exam_service.current_status)."""

    exams: list[MedicalExamOut]
    current_umo: MedicalExamOut | None
    current_tmo: MedicalExamOut | None
