"""Тесты бьют в реальную PostgreSQL (playerpro_test), БД не мокируется."""

import os

os.environ["OTP_STORE"] = "memory"
os.environ["NIGHTLY_RECALC_ENABLED"] = "false"
os.environ["DEBUG"] = "true"
# Фича-флаги фиксируем: иначе локальный .env протекал бы в тесты и они
# начинали бы зависеть от того, что разработчик включил у себя
os.environ["FEATURE_CYCLE_ENABLED"] = "false"
os.environ["FEATURE_NUTRITION_ENABLED"] = "false"
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://playerpro:playerpro@localhost:5433/playerpro_test"
)

import asyncio  # noqa: E402

import asyncpg  # noqa: E402
import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

import app.core.otp as otp_module  # noqa: E402
import app.models  # noqa: E402, F401 — регистрация моделей в metadata
from app.database import AsyncSessionLocal, Base, engine  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402


def _admin_dsn() -> str:
    return os.environ["DATABASE_URL"].replace("+asyncpg", "").rsplit("/", 1)[0] + "/postgres"


def pytest_configure(config):
    async def ensure_test_db() -> None:
        conn = await asyncpg.connect(_admin_dsn())
        try:
            exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = 'playerpro_test'")
            if not exists:
                await conn.execute("CREATE DATABASE playerpro_test")
        finally:
            await conn.close()

    asyncio.run(ensure_test_db())


@pytest.fixture(autouse=True)
async def _fresh_state():
    otp_module._store = None  # сброс in-memory OTP и rate-limit между тестами
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()  # пул соединений не должен пережить event loop теста


@pytest.fixture
async def client():
    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
async def db():
    async with AsyncSessionLocal() as session:
        yield session


async def register_user(client: AsyncClient, identifier: str, device_id: str = "test-device-0001") -> dict:
    """OTP-флоу целиком; возвращает {"access", "refresh", "user_id", "headers"}."""
    resp = await client.post("/api/v1/auth/otp/request", json={"identifier": identifier})
    assert resp.status_code == 200, resp.text
    code = resp.json()["debug_code"]
    resp = await client.post(
        "/api/v1/auth/otp/verify",
        json={"identifier": identifier, "code": code, "device_id": device_id},
    )
    assert resp.status_code == 200, resp.text
    tokens = resp.json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    me = await client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200, me.text
    return {
        "access": tokens["access_token"],
        "refresh": tokens["refresh_token"],
        "user_id": me.json()["id"],
        "headers": headers,
    }
