import uuid
from datetime import date, datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base
from app.models.enums import MedicalExamKind


class MedicalExam(Base):
    """УМО/ТМО — docs/plan-medical-exams.md. История, не текущая запись (как
    InjuryRecord): ошибку в дате чинят новой записью, не правкой старой —
    медицинский журнал должен быть аудируемым. Текущий статус («действует до»/
    «истёк») — производное значение (см. medical_exam_service.current_status),
    отдельного поля для него нет.
    """

    __tablename__ = "medical_exams"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    athlete_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[MedicalExamKind] = mapped_column(String(8))
    passed_date: Mapped[date] = mapped_column()
    valid_until: Mapped[date] = mapped_column()
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
