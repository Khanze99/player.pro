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
    # Первый успешный вход в этот аккаунт: клиенту — показывать ли онбординг.
    # Определяет сервер: только он знает, существовал ли аккаунт до этого кода.
    is_new_user: bool = False


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
    last_name: str
    first_name: str
    middle_name: str
    locale: str
    global_role: GlobalRole
    org_id: uuid.UUID | None
    phone: str | None
    email: str | None
    status: UserStatus
    # Юридический гейт онбординга (152-ФЗ ст. 9/10) — считается независимо по
    # каждому kind, см. policy_consent_service.status_for.
    terms_accepted: bool
    health_consent_accepted: bool
