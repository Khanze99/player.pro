"""Юнит-тесты формул (раздел 6 ТЗ)."""

import pytest

from app.core import calculations as calc


def test_session_load():
    assert calc.session_load(6, 90) == 540  # пример из ТЗ


def test_ewma_first_day_equals_load():
    assert calc.ewma_next(300, None, calc.LAMBDA_ACUTE) == 300


def test_ewma_formula():
    assert calc.ewma_next(400, 200, 0.25) == pytest.approx(400 * 0.25 + 200 * 0.75)


def test_acwr_division_by_zero_protection():
    assert calc.acwr(100, 0) is None
    assert calc.load_zone(None) == "no_data"


@pytest.mark.parametrize(
    ("ratio", "zone"),
    [(0.5, "undertraining"), (1.0, "optimal"), (1.4, "overreaching"), (1.8, "high_risk")],
)
def test_load_zones(ratio, zone):
    assert calc.load_zone(ratio) == zone


def test_normalization():
    # Шкалы переведены на 1–10
    assert calc.normalize_positive(10) == 100
    assert calc.normalize_positive(1) == 0
    assert calc.normalize_positive(5.5) == pytest.approx(50.0)
    assert calc.normalize_negative(1) == 100
    assert calc.normalize_negative(10) == 0


def test_readiness_all_best_is_100_green():
    result = calc.readiness(calc.ReadinessInput(mood=10, energy=10, sleep_quality=10, stress=1, soreness=1))
    assert result.score == 100
    assert result.zone == "green"
    assert not result.hr_flag
    assert not result.unavailable_flag


def test_readiness_all_worst_is_0_red():
    result = calc.readiness(calc.ReadinessInput(mood=1, energy=1, sleep_quality=1, stress=10, soreness=10))
    assert result.score == 0
    assert result.zone == "red"


def test_readiness_hr_modifier_and_flag():
    base = calc.readiness(calc.ReadinessInput(mood=4, energy=4, sleep_quality=4, stress=2, soreness=2))
    elevated = calc.readiness(
        calc.ReadinessInput(
            mood=4, energy=4, sleep_quality=4, stress=2, soreness=2, resting_hr=60, baseline_resting_hr=50
        )
    )
    assert elevated.hr_flag
    assert elevated.score == base.score + calc.RESTING_HR_PENALTY


def test_readiness_injury_sets_unavailable_flag():
    result = calc.readiness(
        calc.ReadinessInput(mood=10, energy=10, sleep_quality=10, stress=1, soreness=1, injury=True)
    )
    assert result.unavailable_flag
    assert result.score == 100  # флаг жёсткий, но балл не обнуляется


def test_readiness_breakdown_matches_readiness():
    """readiness() — тонкая обёртка над readiness_breakdown(), поведение идентично."""
    data = calc.ReadinessInput(
        mood=4, energy=6, sleep_quality=3, stress=7, soreness=8, resting_hr=60, baseline_resting_hr=50
    )
    result = calc.readiness(data)
    breakdown = calc.readiness_breakdown(data)
    assert breakdown.score == result.score
    assert breakdown.zone == result.zone
    assert breakdown.hr_flag == result.hr_flag
    assert breakdown.unavailable_flag == result.unavailable_flag


def test_readiness_breakdown_deficits_sum_to_gap_from_perfect():
    """Веса суммируются в 1.0 → Σ deficit_i == 100 - base_score. Это и есть разложение
    просадки по критериям: сумма «недостающих» очков равна тому, чего балл недобрал."""
    data = calc.ReadinessInput(mood=3, energy=7, sleep_quality=2, stress=6, soreness=9)
    breakdown = calc.readiness_breakdown(data)
    assert sum(c.deficit for c in breakdown.components) == pytest.approx(100 - breakdown.base_score)
    assert {c.key for c in breakdown.components} == set(calc.READINESS_WEIGHTS)


def test_readiness_breakdown_sorted_by_deficit_desc():
    # sleep_quality=1 — худший критерий по вкладу веса (.25) и нормализации → largest deficit
    data = calc.ReadinessInput(mood=8, energy=8, sleep_quality=1, stress=2, soreness=2)
    breakdown = calc.readiness_breakdown(data)
    assert breakdown.components[0].key == "sleep_quality"
    deficits = [c.deficit for c in breakdown.components]
    assert deficits == sorted(deficits, reverse=True)


def test_readiness_breakdown_average_ignores_missing_days():
    """Пропущенный день — отсутствие данных, а не ноль (раздел 4.2): среднее считается
    только по дням, где был опрос."""
    good = calc.readiness_breakdown(
        calc.ReadinessInput(mood=10, energy=10, sleep_quality=10, stress=1, soreness=1)
    )
    bad = calc.readiness_breakdown(
        calc.ReadinessInput(mood=1, energy=1, sleep_quality=1, stress=10, soreness=10)
    )
    average = calc.readiness_breakdown_average([good, bad])
    assert average.days_with_data == 2
    assert average.avg_score == pytest.approx((good.score + bad.score) / 2)
    sleep_component = next(c for c in average.components if c.key == "sleep_quality")
    assert sleep_component.value == pytest.approx((10 + 1) / 2)


def test_readiness_breakdown_average_empty_is_no_data():
    average = calc.readiness_breakdown_average([])
    assert average.days_with_data == 0
    assert average.avg_score is None
    assert average.components == []


def test_availability_percent():
    assert calc.availability_percent(45, 90) == pytest.approx(50.0)
    assert calc.availability_percent(0, 0) is None
