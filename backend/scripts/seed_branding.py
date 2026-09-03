"""Тема организации: заводим её мы, клиент только читает.

Запуск:  make branding org="ФК Рубин" f=themes/rubin.json

Файл содержит только те цвета, которые отличаются от темы продукта; остальные
берутся по умолчанию. В БД при этом ложится полный набор — тема клуба согласуется
целиком и не должна меняться сама от правок продуктовой палитры.

Контраст проверяется и печатается как предупреждение: тему готовит человек, и
нечитаемую пару лучше увидеть при заведении, чем на экране у игрока.
"""

import argparse
import asyncio
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.core.contrast import contrast_ratio, delta_e  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.schemas.branding import ThemeTokens  # noqa: E402
from app.services.branding_service import set_branding  # noqa: E402

#: Светофор состояний — фиксирован, тема его не касается (mobile/src/theme/index.ts)
STATUS_COLORS = {"good": "#2FD27A", "caution": "#FFB02E", "risk": "#FF5C5C", "low": "#6B7A8D"}

AA_TEXT = 4.5
AA_LARGE = 3.0
MIN_DELTA_E = 20.0


def warnings_for(tokens: ThemeTokens) -> list[str]:
    """Что в этой теме будет плохо читаться. Не запрет, а предупреждение человеку."""
    out: list[str] = []
    checks = [
        ("text", "bg", AA_TEXT, "основной текст"),
        ("text", "surface", AA_TEXT, "текст на карточке"),
        ("text_muted", "surface", AA_TEXT, "вторичный текст"),
        ("brand_on", "bg", AA_TEXT, "брендовый текст и иконки"),
        ("on_brand", "brand_dark", AA_TEXT, "текст на кнопке"),
    ]
    for fg, bg, minimum, what in checks:
        ratio = contrast_ratio(getattr(tokens, fg), getattr(tokens, bg))
        if ratio < minimum:
            out.append(f"{what}: {fg} на {bg} — {ratio:.2f}:1, ниже {minimum}")
    for surface in ("bg", "surface"):
        for name, color in STATUS_COLORS.items():
            ratio = contrast_ratio(color, getattr(tokens, surface))
            if ratio < AA_LARGE:
                out.append(f"статус «{name}» на {surface} — {ratio:.2f}:1, ниже {AA_LARGE}")
    for key in ("brand", "brand_2"):
        for name, color in STATUS_COLORS.items():
            distance = delta_e(getattr(tokens, key), color)
            if distance < MIN_DELTA_E:
                out.append(f"{key} спутывается со статусом «{name}»: ΔE {distance:.1f} < {MIN_DELTA_E}")
    return out


STATIC_BRANDING = Path(__file__).resolve().parent.parent / "static" / "branding"


def place_logo(org_id, source: Path) -> str:
    """Кладём герб в статику под id организации и возвращаем путь для клиента."""
    STATIC_BRANDING.mkdir(parents=True, exist_ok=True)
    target = STATIC_BRANDING / f"{org_id}{source.suffix.lower()}"
    shutil.copyfile(source, target)
    return f"/static/branding/{target.name}"


async def seed(org_name: str, theme_path: Path, logo_url: str | None, logo_file: Path | None) -> None:
    raw = json.loads(theme_path.read_text())
    raw.pop("_comment", None)
    tokens = ThemeTokens(**raw)

    for problem in warnings_for(tokens):
        print(f"  ⚠ {problem}")

    async with AsyncSessionLocal() as db:
        org = (
            await db.execute(select(Organization).where(Organization.name == org_name))
        ).scalar_one_or_none()
        if org is None:
            raise SystemExit(f"Организация «{org_name}» не найдена")
        url = place_logo(org.id, logo_file) if logo_file else logo_url
        branding = await set_branding(db, org.id, tokens, url)
        if url:
            print(f"Герб: {url}")
        print(f"Тема «{org_name}» сохранена, версия {branding.version}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Тема организации")
    parser.add_argument("--org", required=True, help="название организации")
    parser.add_argument("--file", required=True, type=Path, help="JSON с цветами")
    parser.add_argument("--logo", default=None, help="готовый URL логотипа")
    parser.add_argument("--logo-file", default=None, type=Path, help="файл герба — скопируем в статику")
    args = parser.parse_args()
    asyncio.run(seed(args.org, args.file, args.logo, args.logo_file))
