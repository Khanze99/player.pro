"""Фича-флаги: обе фичи по умолчанию выключены."""

from app.config import settings
from tests.conftest import register_user


async def test_features_default_off(client):
    user = await register_user(client, "flags@example.com")
    resp = await client.get("/api/v1/features", headers=user["headers"])
    assert resp.status_code == 200
    assert resp.json() == {"cycle": False, "nutrition": False}


async def test_features_reflect_config(client, monkeypatch):
    monkeypatch.setattr(settings, "feature_nutrition_enabled", True)
    user = await register_user(client, "flags2@example.com")
    resp = await client.get("/api/v1/features", headers=user["headers"])
    assert resp.json()["nutrition"] is True
    assert resp.json()["cycle"] is False


async def test_features_require_auth(client):
    resp = await client.get("/api/v1/features")
    assert resp.status_code == 401
