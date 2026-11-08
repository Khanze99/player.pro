"""Удаление аккаунта по запросу пользователя, пришедшему на support@player-pro.ru
(страница player-pro.ru/delete-account, docs/plan-legal-texts.md).

Запуск:  make delete-account identifier="a@b.com" [yes=1]
         make delete-account user_id="<uuid>" [yes=1]   (повторная дочистка надгробия)

Делает ровно то же, что кнопка «Удалить аккаунт» в приложении
(`account_deletion_service.delete_account`): личные и медданные удаляются, строка
`users` становится надгробием, чужие события и RPE остаются целыми. Это боевой путь.
Не путать с `delete_user.py`: тот делает hard delete и сносит RPE и посещаемость
других игроков по событиям, которые создал пользователь; он только для стенда.

Перед запуском убедитесь, что запрос пришёл от владельца аккаунта (ответ на email
аккаунта или код на его телефон). Без --yes скрипт только показывает, кого нашёл.

--user-id нужен для надгробия: по email/телефону его уже не найти (они стёрты), а
дочистка может понадобиться, если параллельный запрос успел записать данные во время
удаления или файл аватара не удалился с диска. Повторный прогон безопасен.
"""

import argparse
import asyncio
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException  # noqa: E402

import app.models  # noqa: E402, F401  (регистрация моделей в metadata)
from app.database import AsyncSessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import account_deletion_service  # noqa: E402


async def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--identifier", help="email или телефон, с которым входит пользователь")
    target.add_argument(
        "--user-id", type=uuid.UUID, help="id пользователя (для повторной дочистки надгробия)"
    )
    parser.add_argument("--yes", action="store_true", help="реально удалить (без флага только превью)")
    args = parser.parse_args()

    async with AsyncSessionLocal() as session:
        if args.user_id:
            user = await session.get(User, args.user_id)
        else:
            try:
                user = await account_deletion_service.find_by_identifier(session, args.identifier)
            except HTTPException as exc:
                print(f"Некорректный идентификатор: {exc.detail}")
                return 1
        if user is None:
            print("Аккаунт не найден (если он уже удалён, используйте user_id=<uuid>).")
            return 1

        print(f"Найден: id={user.id} role={user.global_role} org_id={user.org_id} status={user.status}")
        if not args.yes:
            print("Это был dry-run. Проверили, что запрос от владельца? Тогда добавьте yes=1.")
            return 0

        try:
            await account_deletion_service.delete_account(session, user)
        except HTTPException as exc:
            print(f"Не удалено: {exc.detail}")
            return 1
        print(f"Удалено: id={user.id}. Ответьте пользователю, что аккаунт удалён.")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
