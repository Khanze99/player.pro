import uuid

from pydantic import BaseModel, Field

from app.models.enums import GlobalRole, UserStatus


class OtpRequestIn(BaseModel):
    identifier: str = Field(min_length=3, max_length=255)  # телефон или email


class OtpRequestOut(BaseModel):
    sent: bool
    # Только в debug-режиме, пока нет SMS/email-шлюза
    debug_code: str | None = None


class OtpVerifyIn(BaseModel):
    identifier: str
    code: str = Field(min_length=6, max_length=6)
    device_id: str = Field(min_length=8, max_length=128)


class TokenPairOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefreshIn(BaseModel):
    refresh_token: str
    device_id: str


class AccessTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LogoutIn(BaseModel):
    refresh_token: str


class MeOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    locale: str
    global_role: GlobalRole
    org_id: uuid.UUID | None
    phone: str | None
    email: str | None
    status: UserStatus
