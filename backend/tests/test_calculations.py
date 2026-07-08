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


def test_availability_percent():
    assert calc.availability_percent(45, 90) == pytest.approx(50.0)
    assert calc.availability_percent(0, 0) is None
