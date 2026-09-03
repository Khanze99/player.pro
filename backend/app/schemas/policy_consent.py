from datetime import datetime

from pydantic import BaseModel

from app.models.enums import PolicyConsentKind


class PolicyConsentStatusOut(BaseModel):
    """Статус согласия по одному kind. Отсутствие активной записи актуальной
    версии — granted=False, а не ошибка."""

    granted: bool
    policy_version: str | None = None
    granted_at: datetime | None = None


class PolicyConsentListOut(BaseModel):
    """Статус обоих kind разом — ответ GET и PUT /consents/policy."""

    terms: PolicyConsentStatusOut
    health_data: PolicyConsentStatusOut


class PolicyConsentSetIn(BaseModel):
    kind: PolicyConsentKind
    granted: bool  # false — отзыв
