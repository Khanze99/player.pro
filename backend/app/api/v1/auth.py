from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.core.otp import get_otp_store
from app.schemas.auth import (
    AccessTokenOut,
    LogoutIn,
    MeOut,
    OtpRequestIn,
    OtpRequestOut,
    OtpVerifyIn,
    TokenPairOut,
    TokenRefreshIn,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/otp/request", response_model=OtpRequestOut)
async def request_otp(data: OtpRequestIn, db: DbSession):
    debug_code = await auth_service.request_otp(db, get_otp_store(), data.identifier)
    return OtpRequestOut(sent=True, debug_code=debug_code)


@router.post("/otp/verify", response_model=TokenPairOut)
async def verify_otp(data: OtpVerifyIn, db: DbSession):
    access, refresh = await auth_service.verify_otp(
        db, get_otp_store(), data.identifier, data.code, data.device_id
    )
    return TokenPairOut(access_token=access, refresh_token=refresh)


@router.post("/token/refresh", response_model=AccessTokenOut)
async def refresh_token(data: TokenRefreshIn, db: DbSession):
    access = await auth_service.refresh_access(db, data.refresh_token, data.device_id)
    return AccessTokenOut(access_token=access)


@router.post("/logout", status_code=204)
async def logout(data: LogoutIn, db: DbSession):
    await auth_service.logout(db, data.refresh_token)


@router.get("/me", response_model=MeOut)
async def me(user: CurrentUser):
    return user
