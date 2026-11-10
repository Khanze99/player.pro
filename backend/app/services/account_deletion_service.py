"""Удаление аккаунта самим пользователем (docs/plan-legal-texts.md, Apple 5.1.1(v),
Google Play Account deletion, 152-ФЗ ст. 21 ч. 5).

Отзыв согласий и удаление аккаунта: одно действие. Без обоих policy-согласий
приложение не работает, а после отзыва оператор обязан прекратить обработку и
уничтожить данные.

Стратегия «надгробие», не hard delete:
- личные и медицинские данные пользователя удаляются целиком, включая его личные
  события (без команды) и собственные продукты в дневнике питания;
- строка `users` остаётся со стёртыми ПДн и `status = deleted`, потому что на неё
  ссылаются записи, которые принадлежат не ему: командные события (к ним привязаны
  RPE и посещаемость других игроков), травмы/медосмотры/статусы, которые он как штаб
  вёл другим, сезонная статистика, приглашения, аудит-лог;
- в аудит-логе у записей, где субъект он сам, вычищается `detail` (диагнозы, статусы
  допуска, виды осмотров): остаётся только факт действия, кто и когда;
- история согласий не удаляется, а закрывается (`revoked_at`): её обязаны хранить.

Полнота держится на `OWNED` и `KEPT_REFERENCES`: тест обходит все FK на `users.id`
и падает, если новая таблица не попала ни в один из списков.

`backend/scripts/delete_user.py` (hard delete со сносом чужих RPE) только для
стенда; боевой путь: этот сервис, в том числе для запросов по почте
(`backend/scripts/delete_account.py`).
"""

import logging
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.availability import AvailabilityRecord
from app.models.consent import DataConsent
from app.models.cycle import CycleLog, CycleSettings
from app.models.enums import GlobalRole, InvitationStatus, UserStatus
from app.models.event import Attendance, Event
from app.models.injury import InjuryRecord
from app.models.invitation import Invitation
from app.models.medical_exam import MedicalExam
from app.models.metric import DailyMetric, Streak
from app.models.notification import Notification
from app.models.nutrition import FoodItem, FoodLogEntry, NutritionTarget
from app.models.pain_point import PainPoint
from app.models.policy_consent import PolicyConsent
from app.models.recovery_method import RecoveryMethodLog
from app.models.rpe import RpeEntry
from app.models.season_stats import SeasonPlayerStats
from app.models.team import TeamMembership
from app.models.user import AthleteProfile, RefreshToken, User
from app.models.weight_goal import WeightGoal
from app.models.wellness import WellnessEntry
from app.services import audit_service, avatar_service
from app.services.auth_service import normalize_identifier

logger = logging.getLogger(__name__)

LAST_ORG_ADMIN_DETAIL = (
    "Вы единственный администратор организации, в которой есть другие участники. "
    "Напишите на support@player-pro.ru, чтобы передать права администратора."
)

# (модель, колонка-владелец): записи, которые целиком принадлежат пользователю.
# Порядок важен: дети раньше родителей (FK без ondelete). Дети wellness_entries
# (pain_points, recovery_method_logs) удаляются отдельно до этого списка; значения
# сезонной статистики уходят по ondelete=CASCADE; FoodLogEntry раньше FoodItem.
OWNED = [
    (Attendance, Attendance.user_id),
    (RpeEntry, RpeEntry.athlete_id),
    (WellnessEntry, WellnessEntry.athlete_id),
    (CycleLog, CycleLog.athlete_id),
    (CycleSettings, CycleSettings.user_id),
    (FoodLogEntry, FoodLogEntry.athlete_id),
    # Пользовательский продукт виден только автору (nutrition_service): чужих
    # записей дневника на нём быть не может.
    (FoodItem, FoodItem.created_by),
    (NutritionTarget, NutritionTarget.user_id),
    (WeightGoal, WeightGoal.user_id),
    (AthleteProfile, AthleteProfile.user_id),
    (DailyMetric, DailyMetric.athlete_id),
    (Streak, Streak.athlete_id),
    (InjuryRecord, InjuryRecord.athlete_id),
    (MedicalExam, MedicalExam.athlete_id),
    (AvailabilityRecord, AvailabilityRecord.athlete_id),
    (SeasonPlayerStats, SeasonPlayerStats.athlete_id),
    (Notification, Notification.user_id),
    # Уведомления штабу об этом игроке (травма, боль, риск): тоже его данные.
    (Notification, Notification.athlete_id),
    (TeamMembership, TeamMembership.user_id),
    (RefreshToken, RefreshToken.user_id),
]

# FK на users.id, которые остаются за надгробием, с причиной. Вместе с OWNED это
# полный список: tests/test_account_deletion.py сверяет его с метаданными.
KEPT_REFERENCES = {
    "events.created_by": "командные события: к ним привязаны RPE и посещаемость других (личные удаляются)",
    "injury_records.created_by": "травмы, которые он как врач вёл другим игрокам",
    "medical_exams.created_by": "медосмотры других игроков, внесённые им",
    "availability_records.set_by": "статусы допуска других игроков, выставленные им",
    "season_player_stats.created_by": "статистика других игроков, внесённая им",
    "invitations.invited_by": "клубные приглашения (ожидающие отзываются, если он был последним админом)",
    "audit_logs.actor_id": "журнал: detail по нему как субъекту вычищается",
    "policy_consents.user_id": "история согласий обязана храниться, закрывается revoked_at",
    "data_consents.athlete_id": "история согласий обязана храниться, закрывается revoked_at",
}

# Записи аудита, где пользователь сам является субъектом, а не исполнителем
# над кем-то другим: detail вычищается, сам факт действия остаётся.
_SELF_AUDIT_TYPES = ("consent", "policy_consent", "user")


async def _ensure_not_last_org_admin(db: AsyncSession, user: User) -> None:
    """Админ организации в продукте ровно один (создатель), передачи прав нет.

    Если в организации есть другие активные участники, удаление оставило бы их
    без администратора: такое решается только через поддержку.
    """
    if user.global_role != GlobalRole.admin or user.org_id is None:
        return
    others = await db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.org_id == user.org_id, User.id != user.id, User.status == UserStatus.active)
    )
    if others:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=LAST_ORG_ADMIN_DETAIL)


async def _redact_audit(
    db: AsyncSession, user_id: uuid.UUID, injury_ids: list[uuid.UUID], exam_ids: list[uuid.UUID]
) -> None:
    """Вычищает detail у записей журнала о самом пользователе.

    Субъект определяется так: статус допуска и перевод (resource_id = его id),
    медосмотр (detail.athlete_id), его травмы и медосмотры по id, его собственные
    согласия и профиль (actor = он). Записи, где он как штаб действовал над другими
    игроками, остаются целыми: это история тех игроков.
    """
    uid = str(user_id)
    subject = or_(
        AuditLog.resource_id == uid,
        AuditLog.detail["athlete_id"].as_string() == uid,
        (AuditLog.actor_id == user_id) & AuditLog.resource_type.in_(_SELF_AUDIT_TYPES),
    )
    if injury_ids:
        subject = subject | (
            (AuditLog.resource_type == "injury") & AuditLog.resource_id.in_([str(i) for i in injury_ids])
        )
    if exam_ids:
        subject = subject | (
            (AuditLog.resource_type == "medical_exam") & AuditLog.resource_id.in_([str(i) for i in exam_ids])
        )
    await db.execute(update(AuditLog).where(subject).values(detail={}))


async def delete_account(db: AsyncSession, user: User) -> None:
    """Уничтожает данные пользователя и превращает его строку в надгробие.

    Одна транзакция. Строка users блокируется FOR UPDATE: параллельный PATCH профиля
    или загрузка аватара со второго устройства ждёт commit и не вернёт ФИО/фото в
    надгробие. Файлы аватара удаляются после commit, чтобы откат не оставил строку
    со ссылкой на уже стёртый файл. Повторный вызов для надгробия безопасен
    (идемпотентная дочистка, scripts/delete_account.py --user-id).
    """
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    await db.refresh(user)
    await _ensure_not_last_org_admin(db, user)

    user_id = user.id
    org_id = user.org_id
    was_admin = user.global_role == GlobalRole.admin
    identifiers = [value for value in (user.email, user.phone) if value]
    now = datetime.now(UTC)

    injury_ids = list(await db.scalars(select(InjuryRecord.id).where(InjuryRecord.athlete_id == user_id)))
    exam_ids = list(await db.scalars(select(MedicalExam.id).where(MedicalExam.athlete_id == user_id)))

    entry_ids = select(WellnessEntry.id).where(WellnessEntry.athlete_id == user_id)
    await db.execute(delete(PainPoint).where(PainPoint.entry_id.in_(entry_ids)))
    await db.execute(delete(RecoveryMethodLog).where(RecoveryMethodLog.entry_id.in_(entry_ids)))
    for model, column in OWNED:
        await db.execute(delete(model).where(column == user_id))
    # Личные события (без команды): RPE самого игрока уже удалены выше, посещаемость
    # уходит по ondelete=CASCADE. Командные события остаются (см. KEPT_REFERENCES).
    await db.execute(delete(Event).where(Event.created_by == user_id, Event.team_id.is_(None)))

    # Приглашения НА этого человека: identifier = его телефон/email (ПДн), не FK.
    if identifiers:
        await db.execute(delete(Invitation).where(Invitation.identifier.in_(identifiers)))
    # Последний админ ушёл (активных участников нет, иначе был бы 409): ожидающие
    # приглашения его организации отзываются, иначе люди вступили бы в организацию,
    # которую в системе никто не представляет.
    if was_admin and org_id is not None:
        await db.execute(
            update(Invitation)
            .where(Invitation.org_id == org_id, Invitation.status == InvitationStatus.pending)
            .values(status=InvitationStatus.revoked)
        )

    await db.execute(
        update(PolicyConsent)
        .where(PolicyConsent.user_id == user_id, PolicyConsent.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    await db.execute(
        update(DataConsent)
        .where(DataConsent.athlete_id == user_id, DataConsent.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    await _redact_audit(db, user_id, injury_ids, exam_ids)

    user.first_name = ""
    user.last_name = ""
    user.middle_name = ""
    user.phone = None
    user.email = None
    user.phone_verified = False
    user.email_verified = False
    user.avatar_path = None
    user.org_id = None
    user.global_role = GlobalRole.player
    user.status = UserStatus.deleted

    audit_service.log(db, user_id, "user.delete", "user", user_id)
    await db.commit()

    _unlink_avatars(user_id)
    # Только id: ФИО, телефон и email удалённого в логи не пишем.
    logger.info("account deleted: user_id=%s", user_id)


def _unlink_avatars(user_id: uuid.UUID) -> None:
    """Все файлы аватара пользователя, включая хвосты прошлых неудачных замен:
    имя файла `<user_id>_<hex>.webp` (avatar_service.store)."""
    for path in avatar_service.avatars_dir().glob(f"{user_id}_*.webp"):
        try:
            path.unlink(missing_ok=True)
        except OSError as exc:
            # Данные в БД уже стёрты; повторный прогон скрипта дочистит файл.
            logger.warning("avatar unlink failed after account deletion: %s", exc)


async def find_by_identifier(db: AsyncSession, identifier: str) -> User | None:
    """Для ручного удаления по запросу с почты (scripts/delete_account.py).

    Нормализация та же, что при входе: «+7 (999) 123-45-67» и «+79991234567»
    это один и тот же аккаунт.
    """
    _, value = normalize_identifier(identifier)
    row = await db.execute(select(User).where(or_(User.email == value, User.phone == value)))
    return row.scalar_one_or_none()
