"""Контраст и различимость цветов — WCAG 2.1.

Чистые функции без I/O: тема организации проверяется ими до сохранения
(docs/plan-org-branding.md). Порог AA — 4.5:1 для текста, 3:1 для крупных
элементов и индикаторов.
"""


def _rgb(hex_color: str) -> tuple[float, float, float]:
    """Первые 6 знаков; альфа для контраста не учитывается."""
    h = hex_color.lstrip("#")[:6]
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def relative_luminance(hex_color: str) -> float:
    channels = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in _rgb(hex_color)]
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def contrast_ratio(a: str, b: str) -> float:
    """Отношение контраста двух цветов: от 1 (неразличимы) до 21 (чёрный/белый)."""
    lighter, darker = sorted((relative_luminance(a), relative_luminance(b)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


def _to_lab(hex_color: str) -> tuple[float, float, float]:
    """sRGB → CIE Lab (D65): в нём расстояние между цветами близко к воспринимаемому."""
    r, g, b = (c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in _rgb(hex_color))
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883

    def f(t: float) -> float:
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116

    fx, fy, fz = f(x), f(y), f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def delta_e(a: str, b: str) -> float:
    """Перцептивное расстояние CIE76. Ориентиры: <10 — один цвет, >20 — разные."""
    return sum((p - q) ** 2 for p, q in zip(_to_lab(a), _to_lab(b), strict=True)) ** 0.5


#: Ниже этого порога брендовый цвет спутывается со статусным. Калибровка:
#: клубный зелёный Татарстана против «нормы» — 22.7 (проходит, но впритык, поэтому
#: для него в дизайне действуют правила размежевания по контексту); оттенок,
#: отличающийся от «нормы» на глаз незаметно, — 5.9 (отклоняется).
MIN_DELTA_E = 20.0


def is_distinguishable(brand: str, status_color: str, *, minimum: float = MIN_DELTA_E) -> bool:
    """Брендовый цвет не читается как статусный.

    Оттенка и светлоты по отдельности недостаточно: насыщенный синий бренд и серый
    «нет данных» имеют один оттенок и близкую светлоту, но спутать их невозможно.
    """
    return delta_e(brand, status_color) >= minimum
