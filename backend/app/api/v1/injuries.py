import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.core import authz
from app.schemas.injury import InjuryCreateIn, InjuryOut, InjuryUpdateIn
from app.services import injuries_service

router = APIRouter(prefix="/injuries", tags=["injuries"])


@router.post("", response_model=InjuryOut, status_code=201)
async def create_injury(data: InjuryCreateIn, user: CurrentUser, db: DbSession):
    await authz.ensure_can_manage_athlete_status(db, user, data.athlete_id)
    return await injuries_service.create_injury(db, user.id, data)


@router.patch("/{injury_id}", response_model=InjuryOut)
async def update_injury(injury_id: uuid.UUID, data: InjuryUpdateIn, user: CurrentUser, db: DbSession):
    injury = await injuries_service.get_injury(db, injury_id)
    await authz.ensure_can_manage_athlete_status(db, user, injury.athlete_id)
    return await injuries_service.update_injury(db, user.id, injury, data)


@router.get("/athletes/{athlete_id}", response_model=list[InjuryOut])
async def athlete_injuries(athlete_id: uuid.UUID, user: CurrentUser, db: DbSession):
    await authz.ensure_can_view_athlete(db, user, athlete_id)
    return await injuries_service.list_athlete_injuries(db, athlete_id)
