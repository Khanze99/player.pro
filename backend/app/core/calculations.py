"""Формулы аналитики — раздел 6 ТЗ. Чистые функции, покрыты юнит-тестами."""

from dataclasses import dataclass
from datetime import date as date_type
from datetime import timedelta

LAMBDA_ACUTE = 2 / (7 + 1)  # 0.25
LAMBDA_CHRONIC = 2 / (28 + 1)  # ≈ 0.0690

# Зоны ACWR (пороги конфигурируемы на уровне команды — пост-MVP, пока дефолты)
ACWR_UNDER = 0.8
ACWR_UPPER_NORMAL = 1.3
ACWR_UPPER_WARNING = 1.5

READINESS_GREEN = 75
READINESS_YELLOW = 55

# Самооценка выступления (RpeEntry.performance, шкала 1–10)
PERFORMANCE_GREEN = 7.0
PERFORMANCE_YELLOW = 5.0

# Доступность за 90 дней, % дней full
AVAILABILITY_GREEN = 85.0
AVAILABILITY_YELLOW = 70.0

NO_DATA = "no_data"

READINESS_WEIGHTS = {
    "sleep_quality": 0.25,
    "energy": 0.25,
    "soreness": 0.20,  # обратная шкала
    "stress": 0.15,  # обратная шкала
    "mood": 0.15,
}

RESTING_HR_THRESHOLD_BPM = 7
RESTING_HR_PENALTY = -12

CHRONIC_MIN_EPSILON = 1e-6


def session_load(exertion: int, duration_min: int) -> int:
    """session_load (AU) = RPE(1–10) × длительность_минут."""
    return exertion * duration_min


def ewma_next(load_today: float, ewma_yesterday: float | None, lam: float) -> float:
    """EWMA_today = load × λ + EWMA_yesterday × (1 − λ). Первый день: EWMA = load."""
    if ewma_yesterday is None:
        return float(load_today)
    return load_today * lam + ewma_yesterday * (1 - lam)


def acwr(ewma_acute: float, ewma_chronic: float) -> float | None:
    """None — недостаточно данных (защита от деления на ноль)."""
    if ewma_chronic <= CHRONIC_MIN_EPSILON:
        return None
    return ewma_acute / ewma_chronic


def load_zone(ratio: float | None) -> str:
    if ratio is None:
        return "no_data"
    if ratio < ACWR_UNDER:
        return "undertraining"  # серый
    if ratio <= ACWR_UPPER_NORMAL:
        return "optimal"  # зелёный
    if ratio <= ACWR_UPPER_WARNING:
        return "overreaching"  # жёлтый
    return "high_risk"  # красный


def normalize_positive(value: int) -> float:
    """Шкала 1–10, 10 = лучше (сон, энергия, настроение)."""
    return (value - 1) / 9 * 100


def normalize_negative(value: int) -> float:
    """Шкала 1–10, 1 = лучше (боль, стресс)."""
    return (10 - value) / 9 * 100


@dataclass
class ReadinessInput:
    mood: int
    energy: int
    sleep_quality: int
    stress: int
    soreness: int
    resting_hr: int | None = None
    baseline_resting_hr: int | None = None
    injury: bool = False
    symptom: bool = False


@dataclass
class ReadinessResult:
    score: int
    zone: str  # green | yellow | red
    hr_flag: bool
    unavailable_flag: bool  # травма/болезнь — жёсткий флаг независимо от балла


@dataclass
class ComponentBreakdown:
    """Один критерий Readiness, разложенный на составляющие.

    `contribution` — сколько очков из 100 критерий принёс; `deficit` — сколько очков
    он стоил относительно максимума (`вес × 100`). Веса суммируются в 1.0, поэтому
    Σ deficit по всем критериям всегда равна `100 − base_score` — это и есть ответ на
    «по каким критериям идёт просадка», без прочих объяснений.
    """

    key: str  # sleep_quality | energy | mood | soreness | stress
    value: float  # сырое 1–10 (на дне) или среднее (за период)
    normalized: float  # 0–100
    weight: float
    contribution: float
    deficit: float


@dataclass
class ReadinessBreakdown:
    """Полная раскладка одного дня — то же, что считает readiness(), но с деталями."""

    components: list[ComponentBreakdown]  # отсортированы по deficit убыв.
    base_score: float  # Σ contribution, до модификатора пульса и клампа
    hr_modifier: float  # 0 или RESTING_HR_PENALTY
    hr_flag: bool
    injury: bool
    symptom: bool
    unavailable_flag: bool  # injury or symptom — жёсткий флаг независимо от балла
    score: int
    zone: str


def readiness_breakdown(data: ReadinessInput) -> ReadinessBreakdown:
    normalizers = {
        "sleep_quality": normalize_positive,
        "energy": normalize_positive,
        "mood": normalize_positive,
        "soreness": normalize_negative,
        "stress": normalize_negative,
    }
    raw_values = {
        "sleep_quality": data.sleep_quality,
        "energy": data.energy,
        "mood": data.mood,
        "soreness": data.soreness,
        "stress": data.stress,
    }

    components: list[ComponentBreakdown] = []
    base = 0.0
    for key, weight in READINESS_WEIGHTS.items():
        value = raw_values[key]
        normalized = normalizers[key](value)
        contribution = normalized * weight
        base += contribution
        components.append(
            ComponentBreakdown(
                key=key,
                value=value,
                normalized=normalized,
                weight=weight,
                contribution=contribution,
                deficit=weight * 100 - contribution,
            )
        )
    components.sort(key=lambda c: c.deficit, reverse=True)

    hr_flag = (
        data.resting_hr is not None
        and data.baseline_resting_hr is not None
        and data.resting_hr >= data.baseline_resting_hr + RESTING_HR_THRESHOLD_BPM
    )
    hr_modifier = float(RESTING_HR_PENALTY) if hr_flag else 0.0
    score = max(0, min(100, round(base + hr_modifier)))

    if score >= READINESS_GREEN:
        zone = "green"
    elif score >= READINESS_YELLOW:
        zone = "yellow"
    else:
        zone = "red"

    return ReadinessBreakdown(
        components=components,
        base_score=base,
        hr_modifier=hr_modifier,
        hr_flag=hr_flag,
        injury=data.injury,
        symptom=data.symptom,
        unavailable_flag=data.injury or data.symptom,
        score=score,
        zone=zone,
    )


def readiness(data: ReadinessInput) -> ReadinessResult:
    breakdown = readiness_breakdown(data)
    return ReadinessResult(
        score=breakdown.score,
        zone=breakdown.zone,
        hr_flag=breakdown.hr_flag,
        unavailable_flag=breakdown.unavailable_flag,
    )


@dataclass
class ReadinessBreakdownAverage:
    """Средняя раскладка за период — по дням, где был опрос (пропуск — не ноль)."""

    components: list[ComponentBreakdown]  # value/normalized/contribution/deficit — средние
    avg_score: float | None
    days_with_data: int


def readiness_breakdown_average(breakdowns: list[ReadinessBreakdown]) -> ReadinessBreakdownAverage:
    days = len(breakdowns)
    if days == 0:
        return ReadinessBreakdownAverage(components=[], avg_score=None, days_with_data=0)

    totals: dict[str, dict[str, float]] = {
        key: {"value": 0.0, "normalized": 0.0, "contribution": 0.0, "deficit": 0.0}
        for key in READINESS_WEIGHTS
    }
    for bd in breakdowns:
        for comp in bd.components:
            acc = totals[comp.key]
            acc["value"] += comp.value
            acc["normalized"] += comp.normalized
            acc["contribution"] += comp.contribution
            acc["deficit"] += comp.deficit

    components = [
        ComponentBreakdown(
            key=key,
            value=acc["value"] / days,
            normalized=acc["normalized"] / days,
            weight=READINESS_WEIGHTS[key],
            contribution=acc["contribution"] / days,
            deficit=acc["deficit"] / days,
        )
        for key, acc in totals.items()
    ]
    components.sort(key=lambda c: c.deficit, reverse=True)

    return ReadinessBreakdownAverage(
        components=components,
        avg_score=mean([bd.score for bd in breakdowns]),
        days_with_data=days,
    )


def availability_percent(full_days: int, total_status_days: int) -> float | None:
    """% дней 'full' от дней с любым статусом за окно (90 дн). None — нет данных."""
    if total_status_days == 0:
        return None
    return full_days / total_status_days * 100


def readiness_zone(score: float | None) -> str:
    """Зона по готовности 0–100 — та же шкала, что и в readiness(), но для агрегатов."""
    if score is None:
        return NO_DATA
    if score >= READINESS_GREEN:
        return "green"
    if score >= READINESS_YELLOW:
        return "yellow"
    return "red"


def performance_zone(value: float | None) -> str:
    """Зона по самооценке выступления 1–10."""
    if value is None:
        return NO_DATA
    if value >= PERFORMANCE_GREEN:
        return "green"
    if value >= PERFORMANCE_YELLOW:
        return "yellow"
    return "red"


def availability_zone(percent: float | None) -> str:
    """Зона по проценту доступности за окно."""
    if percent is None:
        return NO_DATA
    if percent >= AVAILABILITY_GREEN:
        return "green"
    if percent >= AVAILABILITY_YELLOW:
        return "yellow"
    return "red"


def mean(values: list[float]) -> float | None:
    """Среднее по непустому списку, иначе None — агрегаты дашборда не делят на ноль."""
    return sum(values) / len(values) if values else None


# ------------------------------------------------------------------ цикл

# Лютеиновая фаза стабильна (~14 дней) независимо от длины цикла — овуляцию
# отсчитываем от конца, а не от начала.
LUTEAL_LENGTH_DAYS = 14
OVULATION_WINDOW_DAYS = 1  # ±1 день вокруг расчётной овуляции
AMENORRHEA_DAYS = 90  # 3 месяца без менструации — красный флаг RED-S
CYCLE_LENGTH_MIN = 21
CYCLE_LENGTH_MAX = 45


def cycle_day(day: "date_type", last_period_start: "date_type | None") -> int | None:
    """День цикла, считая от первого дня последней менструации (день 1)."""
    if last_period_start is None or day < last_period_start:
        return None
    return (day - last_period_start).days + 1


def predict_next_period(
    last_period_start: "date_type | None", average_cycle_length: int
) -> "date_type | None":
    if last_period_start is None:
        return None
    return last_period_start + timedelta(days=average_cycle_length)


def cycle_phase(
    day_of_cycle: int | None,
    average_cycle_length: int,
    average_period_length: int,
    suppressed: bool = False,
) -> str:
    """Фаза по дню цикла.

    Прогноз, а не факт: без измерения гормонов или базальной температуры точную
    овуляцию не определить. Годится, чтобы показать игроку её собственный паттерн,
    и не годится, чтобы что-то ей предписывать.
    """
    if suppressed:
        return "suppressed"
    if day_of_cycle is None or day_of_cycle < 1:
        return "unknown"
    # Цикл затянулся сверх правдоподобного — вероятно, пропущена отметка
    if day_of_cycle > CYCLE_LENGTH_MAX:
        return "unknown"
    if day_of_cycle <= average_period_length:
        return "menstrual"

    ovulation_day = average_cycle_length - LUTEAL_LENGTH_DAYS
    if abs(day_of_cycle - ovulation_day) <= OVULATION_WINDOW_DAYS:
        return "ovulation"
    if day_of_cycle < ovulation_day:
        return "follicular"
    return "luteal"


def is_amenorrhea(day: "date_type", last_period_start: "date_type | None") -> bool:
    """Нет менструации 90+ дней. Клинический флаг для врача, не для тренера."""
    if last_period_start is None:
        return False
    return (day - last_period_start).days >= AMENORRHEA_DAYS


def average_cycle_length(period_starts: list["date_type"]) -> int | None:
    """Средняя длина по фактическим интервалам. Выбросы отбрасываем: пропущенная
    отметка даёт «цикл» в 60 дней и испортила бы среднее."""
    if len(period_starts) < 2:
        return None
    ordered = sorted(period_starts)
    gaps = [
        (later - earlier).days
        for earlier, later in zip(ordered, ordered[1:], strict=False)
        if CYCLE_LENGTH_MIN <= (later - earlier).days <= CYCLE_LENGTH_MAX
    ]
    if not gaps:
        return None
    return round(sum(gaps) / len(gaps))
