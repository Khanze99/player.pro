import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base
from app.models.enums import GlobalRole, InvitationStatus, TeamRole


class Invitation(Base):
    """Приглашение в организацию/команду: one-time, с TTL и преднастроенной ролью.

    Пользователь входит обычным OTP по этому identifier (никакого отдельного кода вводить не надо);
    на verify приглашение консюмится один раз и привязывает его к орг/команде.
    """

    __tablename__ = "invitations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    identifier: Mapped[str] = mapped_column(String(255), index=True)  # нормализованный email/phone
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    global_role: Mapped[GlobalRole] = mapped_column(String(16), default=GlobalRole.player)
    team_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("teams.id"), nullable=True)
    team_role: Mapped[TeamRole | None] = mapped_column(String(16), nullable=True)
    status: Mapped[InvitationStatus] = mapped_column(String(16), default=InvitationStatus.pending, index=True)
    invited_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
