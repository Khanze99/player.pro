"""Формулы аналитики — раздел 6 ТЗ. Чистые функции, покрыты юнит-тестами."""

from dataclasses import dataclass

LAMBDA_ACUTE = 2 / (7 + 1)  # 0.25
LAMBDA_CHRONIC = 2 / (28 + 1)  # ≈ 0.0690

# Зоны ACWR (пороги конфигурируемы на уровне команды — пост-MVP, пока дефолты)
ACWR_UNDER = 0.8
ACWR_UPPER_NORMAL = 1.3
ACWR_UPPER_WARNING = 1.5

READINESS_GREEN = 75
READINESS_YELLOW = 55

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


def readiness(data: ReadinessInput) -> ReadinessResult:
    norms = {
        "sleep_quality": normalize_positive(data.sleep_quality),
        "energy": normalize_positive(data.energy),
        "mood": normalize_positive(data.mood),
        "soreness": normalize_negative(data.soreness),
        "stress": normalize_negative(data.stress),
    }
    base = sum(norms[k] * w for k, w in READINESS_WEIGHTS.items())

    hr_flag = (
        data.resting_hr is not None
        and data.baseline_resting_hr is not None
        and data.resting_hr >= data.baseline_resting_hr + RESTING_HR_THRESHOLD_BPM
    )
    score = base + (RESTING_HR_PENALTY if hr_flag else 0)
    score = max(0, min(100, round(score)))

    if score >= READINESS_GREEN:
        zone = "green"
    elif score >= READINESS_YELLOW:
        zone = "yellow"
    else:
        zone = "red"

    return ReadinessResult(
        score=score,
        zone=zone,
        hr_flag=hr_flag,
        unavailable_flag=data.injury or data.symptom,
    )


def availability_percent(full_days: int, total_status_days: int) -> float | None:
    """% дней 'full' от дней с любым статусом за окно (90 дн). None — нет данных."""
    if total_status_days == 0:
        return None
    return full_days / total_status_days * 100
