"""Auth-флоу (раздел 5 ТЗ): OTP → access + refresh, привязка к устройству."""

from tests.conftest import register_user


async def test_otp_register_and_me(client):
    user = await register_user(client, "player@example.com")
    me = await client.get("/api/v1/auth/me", headers=user["headers"])
    assert me.json()["email"] == "player@example.com"
    assert me.json()["status"] == "active"


async def test_is_new_user_only_on_first_login(client):
    """Онбординг клиент показывает по этому флагу: второй вход — не регистрация."""

    async def verify(identifier: str, device_id: str) -> dict:
        resp = await client.post("/api/v1/auth/otp/request", json={"identifier": identifier})
        code = resp.json()["debug_code"]
        resp = await client.post(
            "/api/v1/auth/otp/verify",
            json={"identifier": identifier, "code": code, "device_id": device_id},
        )
        assert resp.status_code == 200, resp.text
        return resp.json()

    assert (await verify("returning@example.com", "device-first-001"))["is_new_user"] is True
    # То же устройство и новое (потерянный телефон) — аккаунт уже существует
    assert (await verify("returning@example.com", "device-first-001"))["is_new_user"] is False
    assert (await verify("returning@example.com", "device-second-02"))["is_new_user"] is False


async def test_phone_identifier(client):
    resp = await client.post("/api/v1/auth/otp/request", json={"identifier": "+7 (912) 345-67-89"})
    assert resp.status_code == 200
    code = resp.json()["debug_code"]
    resp = await client.post(
        "/api/v1/auth/otp/verify",
        json={"identifier": "+79123456789", "code": code, "device_id": "device-abcdef01"},
    )
    assert resp.status_code == 200


async def test_wrong_otp_rejected(client):
    await client.post("/api/v1/auth/otp/request", json={"identifier": "x@example.com"})
    resp = await client.post(
        "/api/v1/auth/otp/verify",
        json={"identifier": "x@example.com", "code": "000000", "device_id": "device-abcdef01"},
    )
    assert resp.status_code == 400


async def test_otp_attempts_limit(client):
    await client.post("/api/v1/auth/otp/request", json={"identifier": "y@example.com"})
    for _ in range(5):
        await client.post(
            "/api/v1/auth/otp/verify",
            json={"identifier": "y@example.com", "code": "000000", "device_id": "device-abcdef01"},
        )
    # даже правильный код после исчерпания попыток не принимается — челлендж сожжён
    resp = await client.post(
        "/api/v1/auth/otp/verify",
        json={"identifier": "y@example.com", "code": "123456", "device_id": "device-abcdef01"},
    )
    assert resp.status_code == 400


async def test_otp_rate_limit(client):
    for _ in range(5):
        resp = await client.post("/api/v1/auth/otp/request", json={"identifier": "rl@example.com"})
        assert resp.status_code == 200
    resp = await client.post("/api/v1/auth/otp/request", json={"identifier": "rl@example.com"})
    assert resp.status_code == 429


async def test_refresh_bound_to_device(client):
    user = await register_user(client, "r@example.com", device_id="device-original-1")
    ok = await client.post(
        "/api/v1/auth/token/refresh",
        json={"refresh_token": user["refresh"], "device_id": "device-original-1"},
    )
    assert ok.status_code == 200
    assert ok.json()["access_token"]

    stolen = await client.post(
        "/api/v1/auth/token/refresh",
        json={"refresh_token": user["refresh"], "device_id": "device-attacker-9"},
    )
    assert stolen.status_code == 401


async def test_logout_revokes_refresh(client):
    user = await register_user(client, "l@example.com", device_id="device-original-1")
    resp = await client.post("/api/v1/auth/logout", json={"refresh_token": user["refresh"]})
    assert resp.status_code == 204
    resp = await client.post(
        "/api/v1/auth/token/refresh",
        json={"refresh_token": user["refresh"], "device_id": "device-original-1"},
    )
    assert resp.status_code == 401


async def test_protected_route_requires_token(client):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401
