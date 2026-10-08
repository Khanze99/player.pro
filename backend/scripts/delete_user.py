"""Удаление пользователя по email/телефону со всеми зависимыми данными.

Запуск:  make delete-user identifier="test@example.com"

В БД ни у одной таблицы, ссылающейся на users.id, нет ON DELETE CASCADE (все
constraint'ы — NO ACTION, проверено по information_schema на реальной схеме, не
по моделям). Простой DELETE FROM users упадёт по первой же внешней ссылке.
Порядок удаления ниже подобран по фактическому графу зависимостей, включая
двухуровневые цепочки (cycle_symptom_logs -> cycle_logs, pain_points ->
wellness_entries, attendances/rpe_entries -> events, food_log_entries ->
food_items) — их нужно чистить раньше родителя, иначе тоже упадёт по FK.

ВАЖНО — несимметричный побочный эффект: если пользователь создавал события
(events.created_by) или личные продукты в дневнике питания (food_items.created_by),
их удаление тянет за собой attendances/rpe_entries/food_log_entries ДРУГИХ
пользователей, привязанные к этим событиям/продуктам. Для тренера/админа тестового
стенда это обычно ожидаемо (вместе с командой исчезают и её события), но не «только
данные этого юзера» в буквальном смысле — если это не ваш сценарий, сначала
проверьте превью (запуск без --yes) или уберите events/food_items из списка шагов ниже.

Без --yes скрипт только печатает, что нашёл, и ничего не удаляет (dry-run по
умолчанию, не наоборот) — специально, чтобы не снести боевой аккаунт по опечатке
в identifier.
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402

# (таблица, колонка) — всё, что в реальной схеме ссылается на users.id напрямую.
# Порядок важен только там, где есть пометка ниже; для остального порядок не влияет.
DIRECT_REFS = [
    ("audit_logs", "actor_id"),
    ("invitations", "invited_by"),
    ("refresh_tokens", "user_id"),
    ("team_memberships", "user_id"),
    ("athlete_profiles", "user_id"),
    ("notifications", "user_id"),
    ("nutrition_targets", "user_id"),
    ("cycle_settings", "user_id"),
    ("policy_consents", "user_id"),
    ("streaks", "athlete_id"),
    ("daily_metrics", "athlete_id"),
    ("data_consents", "athlete_id"),
    ("injury_records", "athlete_id"),
    ("injury_records", "created_by"),
    ("medical_exams", "athlete_id"),
    ("medical_exams", "created_by"),
    ("availability_records", "athlete_id"),
    ("availability_records", "set_by"),
]


async def preview(session, column_map: list[tuple[str, str]], user_id: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for table, column in column_map:
        row = await session.execute(
            text(f"SELECT count(*) FROM {table} WHERE {column} = :uid"),
            {"uid": user_id},  # noqa: S608
        )
        counts[f"{table}.{column}"] = row.scalar_one()
    return counts


async def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--identifier", required=True, help="email или телефон пользователя (как в users.email/phone)"
    )
    parser.add_argument("--yes", action="store_true", help="реально удалить (без флага — только превью)")
    args = parser.parse_args()

    async with AsyncSessionLocal() as session:
        row = await session.execute(
            text("SELECT id, email, phone, global_role, org_id FROM users WHERE email = :v OR phone = :v"),
            {"v": args.identifier},
        )
        user = row.mappings().one_or_none()
        if user is None:
            print(f"Пользователь с identifier={args.identifier!r} не найден.")
            return

        user_id = str(user["id"])
        print(f"Найден: id={user_id} email={user['email']} phone={user['phone']} role={user['global_role']}")

        # events/food_items — отдельно: у них два потребителя (DIRECT_REFS покрывает
        # created_by, но перед их собственным удалением нужно почистить то, что на
        # них ссылается у ЛЮБОГО пользователя, не только у этого).
        extra_preview = await preview(
            session,
            [
                ("events", "created_by"),
                ("food_items", "created_by"),
                ("wellness_entries", "athlete_id"),
                ("cycle_logs", "athlete_id"),
                ("attendances", "user_id"),
                ("rpe_entries", "athlete_id"),
                ("food_log_entries", "athlete_id"),
            ],
            user_id,
        )
        direct_preview = await preview(session, DIRECT_REFS, user_id)

        print("\nБудет удалено (превью):")
        for key, count in {**extra_preview, **direct_preview}.items():
            if count:
                print(f"  {key}: {count}")

        events_created = extra_preview["events.created_by"]
        foods_created = extra_preview["food_items.created_by"]
        if events_created or foods_created:
            print(
                "\n⚠ Этот пользователь создал события/продукты, на которые могут "
                "ссылаться ДРУГИЕ пользователи (их attendance/RPE/дневник по этим "
                f"событиям/продуктам тоже удалится): events={events_created}, food_items={foods_created}."
            )

        if not args.yes:
            print("\nЭто был dry-run. Добавьте --yes, чтобы удалить по-настоящему.")
            return

        # --- Двухуровневые цепочки: сначала дети, потом родитель ---
        await session.execute(
            text(
                "DELETE FROM cycle_symptom_logs WHERE log_id IN "
                "(SELECT id FROM cycle_logs WHERE athlete_id = :uid)"
            ),
            {"uid": user_id},
        )
        await session.execute(
            text(
                "DELETE FROM pain_points WHERE entry_id IN "
                "(SELECT id FROM wellness_entries WHERE athlete_id = :uid)"
            ),
            {"uid": user_id},
        )
        await session.execute(
            text("DELETE FROM attendances WHERE event_id IN (SELECT id FROM events WHERE created_by = :uid)"),
            {"uid": user_id},
        )
        await session.execute(
            text("DELETE FROM rpe_entries WHERE event_id IN (SELECT id FROM events WHERE created_by = :uid)"),
            {"uid": user_id},
        )
        await session.execute(text("DELETE FROM events WHERE created_by = :uid"), {"uid": user_id})
        await session.execute(
            text(
                "DELETE FROM food_log_entries WHERE food_item_id IN "
                "(SELECT id FROM food_items WHERE created_by = :uid)"
            ),
            {"uid": user_id},
        )
        await session.execute(text("DELETE FROM food_items WHERE created_by = :uid"), {"uid": user_id})

        # --- Собственные записи пользователя (теперь без детей, которые бы мешали) ---
        for table, column in [
            ("attendances", "user_id"),
            ("rpe_entries", "athlete_id"),
            ("food_log_entries", "athlete_id"),
            ("cycle_logs", "athlete_id"),
            ("wellness_entries", "athlete_id"),
            *DIRECT_REFS,
        ]:
            await session.execute(text(f"DELETE FROM {table} WHERE {column} = :uid"), {"uid": user_id})  # noqa: S608

        # Pending-приглашения НА этот адрес — не FK (identifier — текст), но для чистоты
        await session.execute(text("DELETE FROM invitations WHERE identifier = :v"), {"v": args.identifier})

        await session.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": user_id})
        await session.commit()
        print(f"\nУдалено: {args.identifier} ({user_id}).")


if __name__ == "__main__":
    asyncio.run(main())
