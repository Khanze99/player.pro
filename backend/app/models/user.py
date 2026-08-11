import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base
from app.models.enums import GlobalRole, Sex, UserStatus


def display_name(last_name: str, first_name: str) -> str:
    """Как человек показывается в списках: «Фамилия Имя». Отчество в них не выводим."""
    return " ".join(part for part in (last_name, first_name) if part)


class User(Base):
    """Инвариант: задан хотя бы один из phone/email. PIN на сервере не хранится."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id"), nullable=True, index=True
    )
    # ФИО хранится только раздельно; строка для списков собирается в display_name()
    last_name: Mapped[str] = mapped_column(String(128), default="")
    first_name: Mapped[str] = mapped_column(String(128), default="")
    middle_name: Mapped[str] = mapped_column(String(128), default="")
    locale: Mapped[str] = mapped_column(String(8), default="ru")
    global_role: Mapped[GlobalRole] = mapped_column(String(16), default=GlobalRole.player)
    phone: Mapped[str | None] = mapped_column(String(32), unique=True, nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    status: Mapped[UserStatus] = mapped_column(String(16), default=UserStatus.pending)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    device_id: Mapped[str] = mapped_column(String(128))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AthleteProfile(Base):
    __tablename__ = "athlete_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    position: Mapped[str | None] = mapped_column(String(64), nullable=True)
    baseline_resting_hr: Mapped[int | None] = mapped_column(nullable=True)
    birthdate: Mapped[date | None] = mapped_column(nullable=True)
    # Самодекларация. Входной параметр для цикл-трекинга, никогда не навязывается.
    sex: Mapped[Sex] = mapped_column(String(16), default=Sex.not_specified)
