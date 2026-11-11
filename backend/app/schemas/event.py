import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import AttendanceStatus, EventType


class EventCreateIn(BaseModel):
    team_id: uuid.UUID | None = None  # None — индивидуальное событие игрока
    type: EventType
    title: str | None = Field(default=None, max_length=255)
    planned_start: datetime
    planned_duration_min: int = Field(ge=1, le=600)
    location_id: uuid.UUID | None = None
    # Упражнения события (docs/plan-workout-builder.md), у личного и командного.
    # Шаблон копируется в список события, список события (is_template=False)
    # ставится как есть. Чужой 404.
    workout_id: uuid.UUID | None = None
    # Кому назначены упражнения командного события: пусто = всем игрокам команды.
    # Только игроки команды события, иначе 422; у личного события 422.
    workout_athlete_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)


class EventUpdateIn(BaseModel):
    type: EventType | None = None
    title: str | None = None
    planned_start: datetime | None = None
    planned_duration_min: int | None = Field(default=None, ge=1, le=600)
    location_id: uuid.UUID | None = None
    # null снимает план с события (план удаляется), отсутствие поля его не трогает
    workout_id: uuid.UUID | None = None
    # Отсутствие поля назначения не трогает, [] возвращает «всем»
    workout_athlete_ids: list[uuid.UUID] | None = Field(default=None, max_length=200)


class EventOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    team_id: uuid.UUID | None
    type: EventType
    title: str | None
    planned_start: datetime
    planned_duration_min: int
    location_id: uuid.UUID | None
    created_by: uuid.UUID
    # Название шаблона для календаря без второго запроса; null, если шаблона нет
    # или его удалили (ON DELETE SET NULL).
    workout_id: uuid.UUID | None = None
    workout_name: str | None = None
    # Кому назначены упражнения: пусто = всем игрокам команды (или личное событие)
    workout_athlete_ids: list[uuid.UUID] = []


class AttendanceIn(BaseModel):
    user_id: uuid.UUID
    status: AttendanceStatus


class AttendanceOut(BaseModel):
    model_config = {"from_attributes": True}

    event_id: uuid.UUID
    user_id: uuid.UUID
    status: AttendanceStatus
