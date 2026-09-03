"""Брендинг организации: цвета темы и логотип (docs/plan-org-branding.md).

Инварианты:
  · запись необязательна — её отсутствие означает тему продукта по умолчанию;
  · хранится полный набор цветов, а не отличия от дефолта: тема клуба согласуется
    целиком и не должна меняться сама от правок продуктовой палитры;
  · version растёт при каждом изменении — по ней клиент понимает, что тему пора перечитать.
"""

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class OrganizationBranding(Base):
    __tablename__ = "organization_branding"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True
    )
    # Набор цветовых токенов; контракт держит app/schemas/branding.py
    tokens: Mapped[dict] = mapped_column(JSON, default=dict)
    logo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
