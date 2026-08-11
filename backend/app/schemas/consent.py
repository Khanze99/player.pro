from datetime import datetime

from pydantic import BaseModel

from app.models.enums import ConsentAudience, ConsentScope


class ConsentSetIn(BaseModel):
    scope: ConsentScope
    audience: ConsentAudience  # none — отзыв


class ConsentOut(BaseModel):
    scope: ConsentScope
    audience: ConsentAudience
    policy_version: str | None = None
    granted_at: datetime | None = None


class ConsentListOut(BaseModel):
    """Карта согласий игрока. Всегда все scope — отсутствие записи это audience=none."""

    policy_version: str
    consents: list[ConsentOut]
