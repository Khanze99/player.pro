"""Аудит изменений статусов доступности/травм (НФТ, раздел 11 ТЗ)."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


def log(
    db: AsyncSession,
    actor_id: uuid.UUID,
    action: str,
    resource_type: str,
    resource_id: uuid.UUID | str,
    detail: dict | None = None,
) -> None:
    """Добавляет запись в сессию; commit — на вызывающей стороне (атомарно с изменением)."""
    db.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id),
            detail=detail or {},
        )
    )
