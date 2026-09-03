"""Тема организации: контракт цветов, которые клиент применяет как есть.

Светофор состояний (`good/caution/risk/low`) в теме отсутствует физически — это
язык продукта, общий для всех организаций (раздел 4.1 дизайн-ТЗ). Переопределить
его нельзя даже случайно: поля под него просто нет.
"""

import uuid
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

#: #RRGGBB или #RRGGBBAA — восьмизначные нужны для полупрозрачных обводок
HexColor = Annotated[str, StringConstraints(pattern=r"^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")]


class ThemeTokens(BaseModel):
    """Цвета темы. Значения по умолчанию — тема продукта (mobile/src/theme/index.ts)."""

    model_config = ConfigDict(extra="forbid")

    # Поверхности
    bg: HexColor = "#0A0D13"
    bg_top: HexColor = "#10161F"
    surface: HexColor = "#131A26"
    surface_2: HexColor = "#1B2432"
    border: HexColor = "#26303F"
    border_bright: HexColor = "#33405280"
    # Текст
    text: HexColor = "#EDF2F9"
    text_muted: HexColor = "#8A99AD"
    # Брендовый слой — то, что меняет организация
    brand: HexColor = "#2D8CFF"
    brand_dark: HexColor = "#1B6FE8"
    #: Бренд как текст и иконки на тёмном фоне: тёмный клубный цвет на нём нечитаем,
    #: поэтому это отдельный, осветлённый оттенок, а не тот же `brand`.
    brand_on: HexColor = "#2D8CFF"
    #: Текст поверх брендовой заливки
    on_brand: HexColor = "#FFFFFF"
    #: Второй клубный цвет; по умолчанию совпадает с основным
    brand_2: HexColor = "#2D8CFF"
    brand_2_on: HexColor = "#2D8CFF"
    # Градиенты: [начало, конец]
    gradient_brand: tuple[HexColor, HexColor] = ("#3D96FF", "#1B6FE8")
    gradient_screen: tuple[HexColor, HexColor] = ("#111927", "#0A0D13")


DEFAULT_TOKENS = ThemeTokens()


class BrandingOut(BaseModel):
    """Ответ клиенту: тема применяется как есть, без ветвлений."""

    #: 0 — тема продукта по умолчанию, организация своей не имеет
    version: int = Field(ge=0)
    org_id: uuid.UUID | None = None
    org_name: str | None = None
    logo_url: str | None = None
    tokens: ThemeTokens
