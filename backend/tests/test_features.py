"""Фича-флаги: все фичи по умолчанию выключены."""

import pytest

from app.config import Settings, settings
from tests.conftest import register_user

FLAGS = ("feature_cycle_enabled", "feature_nutrition_enabled", "feature_workouts_enabled")


@pytest.fixture(autouse=True)
def _flags_off(monkeypatch):
    """Локальный .env разработчика может включать фичи: тесты от него не зависят."""
    for flag in FLAGS:
        monkeypatch.setattr(settings, flag, False)


def test_flags_default_off_in_code():
    assert all(Settings.model_fields[flag].default is False for flag in FLAGS)


async def test_features_all_off(client):
    user = await register_user(client, "flags@example.com")
    resp = await client.get("/api/v1/features", headers=user["headers"])
    assert resp.status_code == 200
    assert resp.json() == {"cycle": False, "nutrition": False, "workouts": False}


async def test_features_reflect_config(client, monkeypatch):
    monkeypatch.setattr(settings, "feature_nutrition_enabled", True)
    user = await register_user(client, "flags2@example.com")
    resp = await client.get("/api/v1/features", headers=user["headers"])
    assert resp.json()["nutrition"] is True
    assert resp.json()["cycle"] is False
    assert resp.json()["workouts"] is False


async def test_features_workouts_flag(client, monkeypatch):
    monkeypatch.setattr(settings, "feature_workouts_enabled", True)
    user = await register_user(client, "flags3@example.com")
    resp = await client.get("/api/v1/features", headers=user["headers"])
    assert resp.json()["workouts"] is True


async def test_features_require_auth(client):
    resp = await client.get("/api/v1/features")
    assert resp.status_code == 401
