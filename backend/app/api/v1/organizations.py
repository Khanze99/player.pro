from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.core import authz
from app.schemas.organization import (
    InvitationCreateIn,
    InvitationOut,
    OrganizationCreateIn,
    OrganizationOut,
)
from app.services import invitations_service, organizations_service

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.post("", response_model=OrganizationOut, status_code=201)
async def create_organization(data: OrganizationCreateIn, user: CurrentUser, db: DbSession):
    return await organizations_service.create_organization(db, user, data)


@router.get("/me", response_model=OrganizationOut)
async def my_organization(user: CurrentUser, db: DbSession):
    return await organizations_service.get_my_organization(db, user)


@router.post("/invites", response_model=InvitationOut, status_code=201)
async def create_invite(data: InvitationCreateIn, user: CurrentUser, db: DbSession):
    await authz.require_org_admin(user)
    return await invitations_service.create_invitation(db, user, data)
