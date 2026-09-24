import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.core import authz
from app.models.enums import MedicalExamKind
from app.schemas.medical_exam import MedicalExamIn, MedicalExamOut, MedicalExamsOut
from app.services import medical_exam_service

# Тот же паттерн путей, что у wellness/rpe/injuries: /<ресурс>/athletes/{id},
# не /athletes/{id}/<ресурс> (см. docs/plan-medical-exams.md — там путь был
# записан иначе, поправлено при реализации под фактическую конвенцию проекта).
router = APIRouter(prefix="/medical-exams", tags=["medical-exams"])


@router.get("/athletes/{athlete_id}", response_model=MedicalExamsOut)
async def athlete_medical_exams(athlete_id: uuid.UUID, user: CurrentUser, db: DbSession):
    await authz.ensure_can_view_athlete(db, user, athlete_id)
    exams = await medical_exam_service.list_for_athlete(db, athlete_id)
    current = medical_exam_service.current_status(exams)
    return MedicalExamsOut(
        exams=exams,
        current_umo=current[MedicalExamKind.umo],
        current_tmo=current[MedicalExamKind.tmo],
    )


@router.post("/athletes/{athlete_id}", response_model=MedicalExamOut, status_code=201)
async def create_medical_exam(athlete_id: uuid.UUID, data: MedicalExamIn, user: CurrentUser, db: DbSession):
    await authz.ensure_can_manage_medical_exams(db, user, athlete_id)
    return await medical_exam_service.create(db, athlete_id, user.id, data)
