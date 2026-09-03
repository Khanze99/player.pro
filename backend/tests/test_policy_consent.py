"""Юридический гейт согласий при регистрации (152-ФЗ ст. 9/10), docs/plan-onboarding-consent.md.

Другой примитив, чем DataConsent/test_consent.py: там — гранулярный sharing цикла/
питания тренеру/врачу, здесь — бинарное «принял/не принял» без которого пользователь
вообще не может пользоваться приложением. См. app/models/policy_consent.py.
"""

import types

from httpx import AsyncClient
from sqlalchemy import func, select

from app.api.deps import require_consented
from app.config import settings
from app.models.enums import GlobalRole, PolicyConsentKind, UserStatus
from app.models.policy_consent import PolicyConsent
from app.models.user import User
from app.services import policy_consent_service

# -------------------------------------------------------------- вспомогательное


async def _make_user(db, email: str) -> User:
    user = User(
        last_name="Тест",
        email=email,
        global_role=GlobalRole.player,
        status=UserStatus.active,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _register_without_consent(client: AsyncClient, identifier: str, device_id: str) -> dict:
    """OTP-флоу без гранта согласий — для проверки самого гейта. Не путать с
    tests.conftest.register_user, который согласия проставляет автоматически."""
    resp = await client.post("/api/v1/auth/otp/request", json={"identifier": identifier})
    assert resp.status_code == 200, resp.text
    code = resp.json()["debug_code"]
    resp = await client.post(
        "/api/v1/auth/otp/verify",
        json={"identifier": identifier, "code": code, "device_id": device_id},
    )
    assert resp.status_code == 200, resp.text
    tokens = resp.json()
    return {
        "headers": {"Authorization": f"Bearer {tokens['access_token']}"},
        "access": tokens["access_token"],
    }


# -------------------------------------------------------------- policy_consent_service


async def test_grant_creates_active_consent(db):
    user = await _make_user(db, "grant@example.com")

    consent = await policy_consent_service.grant(db, user.id, PolicyConsentKind.terms)

    assert consent.revoked_at is None
    assert consent.policy_version == settings.terms_policy_version
    active = await policy_consent_service.get_active(db, user.id, PolicyConsentKind.terms)
    assert active is not None
    assert active.id == consent.id


async def test_revoke_sets_revoked_at_and_keeps_row(db):
    """Отзыв — не удаление: история согласий обязана сохраняться (ст. 9/10 152-ФЗ)."""
    user = await _make_user(db, "revoke@example.com")
    await policy_consent_service.grant(db, user.id, PolicyConsentKind.health_data)
    await policy_consent_service.revoke(db, user.id, PolicyConsentKind.health_data)

    assert await policy_consent_service.get_active(db, user.id, PolicyConsentKind.health_data) is None

    rows = await db.execute(
        select(func.count())
        .select_from(PolicyConsent)
        .where(PolicyConsent.user_id == user.id, PolicyConsent.kind == PolicyConsentKind.health_data)
    )
    assert rows.scalar() == 1

    row = await db.execute(
        select(PolicyConsent).where(
            PolicyConsent.user_id == user.id, PolicyConsent.kind == PolicyConsentKind.health_data
        )
    )
    stored = row.scalar_one()
    assert stored.revoked_at is not None


async def test_revoke_without_prior_grant_is_a_noop(db):
    """Отозвать то, чего не давали, — не ошибка и не создаёт мусорную строку."""
    user = await _make_user(db, "revoke-noop@example.com")

    await policy_consent_service.revoke(db, user.id, PolicyConsentKind.terms)

    rows = await db.execute(
        select(func.count()).select_from(PolicyConsent).where(PolicyConsent.user_id == user.id)
    )
    assert rows.scalar() == 0


async def test_regrant_leaves_exactly_one_active_consent(db):
    user = await _make_user(db, "regrant@example.com")

    await policy_consent_service.grant(db, user.id, PolicyConsentKind.terms)
    await policy_consent_service.grant(db, user.id, PolicyConsentKind.terms)

    active_rows = await db.execute(
        select(func.count())
        .select_from(PolicyConsent)
        .where(
            PolicyConsent.user_id == user.id,
            PolicyConsent.kind == PolicyConsentKind.terms,
            PolicyConsent.revoked_at.is_(None),
        )
    )
    assert active_rows.scalar() == 1

    total_rows = await db.execute(
        select(func.count())
        .select_from(PolicyConsent)
        .where(PolicyConsent.user_id == user.id, PolicyConsent.kind == PolicyConsentKind.terms)
    )
    assert total_rows.scalar() == 2, "история не должна теряться при повторном согласии"


async def test_has_all_false_without_any_consent(db):
    user = await _make_user(db, "none@example.com")
    assert await policy_consent_service.has_all(db, user.id) is False


async def test_has_all_false_when_only_one_kind_granted(db):
    user = await _make_user(db, "half@example.com")
    await policy_consent_service.grant(db, user.id, PolicyConsentKind.terms)
    assert await policy_consent_service.has_all(db, user.id) is False


async def test_has_all_true_when_both_kinds_granted(db):
    user = await _make_user(db, "both@example.com")
    await policy_consent_service.grant(db, user.id, PolicyConsentKind.terms)
    await policy_consent_service.grant(db, user.id, PolicyConsentKind.health_data)
    assert await policy_consent_service.has_all(db, user.id) is True


async def test_stale_policy_version_does_not_count_as_consented(db, monkeypatch):
    """Согласие дано под старым текстом — при смене версии его нужно переспросить."""
    user = await _make_user(db, "stale@example.com")
    await policy_consent_service.grant(db, user.id, PolicyConsentKind.terms)
    await policy_consent_service.grant(db, user.id, PolicyConsentKind.health_data)
    assert await policy_consent_service.has_all(db, user.id) is True

    monkeypatch.setattr(settings, "terms_policy_version", "2099-01-01")

    assert await policy_consent_service.has_all(db, user.id) is False
    status = await policy_consent_service.status_for(db, user.id)
    assert status[PolicyConsentKind.terms].granted is False
    # health_data не задет сменой версии terms — независимость kind'ов
    assert status[PolicyConsentKind.health_data].granted is True


async def test_kinds_are_independent(db):
    """Грант одного kind не подтягивает другой."""
    user = await _make_user(db, "independent@example.com")
    await policy_consent_service.grant(db, user.id, PolicyConsentKind.terms)

    status = await policy_consent_service.status_for(db, user.id)
    assert status[PolicyConsentKind.terms].granted is True
    assert status[PolicyConsentKind.health_data].granted is False


# -------------------------------------------------------------- API GET/PUT /consents/policy


async def test_policy_consent_api_default_is_not_granted(client):
    user = await _register_without_consent(client, "policy-default@example.com", "dev-default-0001")

    resp = await client.get("/api/v1/consents/policy", headers=user["headers"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["terms"]["granted"] is False
    assert body["health_data"]["granted"] is False


async def test_policy_consent_api_grant_and_revoke_roundtrip(client):
    user = await _register_without_consent(client, "policy-roundtrip@example.com", "dev-rt-0001")

    resp = await client.put(
        "/api/v1/consents/policy", json={"kind": "terms", "granted": True}, headers=user["headers"]
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["terms"]["granted"] is True
    assert body["terms"]["policy_version"] == settings.terms_policy_version
    # health_data не тронут грантом terms — оба kind в ответе независимы
    assert body["health_data"]["granted"] is False

    resp = await client.put(
        "/api/v1/consents/policy", json={"kind": "health_data", "granted": True}, headers=user["headers"]
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["terms"]["granted"] is True
    assert body["health_data"]["granted"] is True

    resp = await client.put(
        "/api/v1/consents/policy", json={"kind": "terms", "granted": False}, headers=user["headers"]
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["terms"]["granted"] is False
    assert body["health_data"]["granted"] is True, "отзыв terms не должен трогать health_data"


# -------------------------------------------------------------- require_consented


async def test_gated_endpoint_returns_403_without_consent(client):
    user = await _register_without_consent(client, "gate-403@example.com", "dev-gate-0001")

    resp = await client.get("/api/v1/wellness/me", headers=user["headers"])
    assert resp.status_code == 403


async def test_gated_endpoint_returns_200_after_both_consents_granted(client):
    user = await _register_without_consent(client, "gate-200@example.com", "dev-gate-0002")

    for kind in ("terms", "health_data"):
        resp = await client.put(
            "/api/v1/consents/policy", json={"kind": kind, "granted": True}, headers=user["headers"]
        )
        assert resp.status_code == 200, resp.text

    resp = await client.get("/api/v1/wellness/me", headers=user["headers"])
    assert resp.status_code == 200, resp.text


async def test_gated_endpoint_still_403_with_only_one_consent(client):
    user = await _register_without_consent(client, "gate-partial@example.com", "dev-gate-0003")

    resp = await client.put(
        "/api/v1/consents/policy", json={"kind": "terms", "granted": True}, headers=user["headers"]
    )
    assert resp.status_code == 200, resp.text

    resp = await client.get("/api/v1/wellness/me", headers=user["headers"])
    assert resp.status_code == 403


async def test_revoking_consent_closes_gate_again(client):
    user = await _register_without_consent(client, "gate-revoke@example.com", "dev-gate-0004")
    for kind in ("terms", "health_data"):
        resp = await client.put(
            "/api/v1/consents/policy", json={"kind": kind, "granted": True}, headers=user["headers"]
        )
        assert resp.status_code == 200

    resp = await client.get("/api/v1/wellness/me", headers=user["headers"])
    assert resp.status_code == 200

    resp = await client.put(
        "/api/v1/consents/policy", json={"kind": "health_data", "granted": False}, headers=user["headers"]
    )
    assert resp.status_code == 200

    resp = await client.get("/api/v1/wellness/me", headers=user["headers"])
    assert resp.status_code == 403


async def test_auth_endpoints_work_without_any_consent(client):
    """/auth/* обязан работать до онбординга (refresh/logout/me) — иначе
    пользователь не может даже узнать, чего ему не хватает."""
    identifier = "auth-no-consent@example.com"
    resp = await client.post("/api/v1/auth/otp/request", json={"identifier": identifier})
    assert resp.status_code == 200
    code = resp.json()["debug_code"]
    resp = await client.post(
        "/api/v1/auth/otp/verify",
        json={"identifier": identifier, "code": code, "device_id": "dev-auth-0001"},
    )
    assert resp.status_code == 200
    tokens = resp.json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    resp = await client.get("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["terms_accepted"] is False

    resp = await client.post(
        "/api/v1/auth/token/refresh",
        json={"refresh_token": tokens["refresh_token"], "device_id": "dev-auth-0001"},
    )
    assert resp.status_code == 200

    resp = await client.post("/api/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    assert resp.status_code in (200, 204)


async def test_consent_endpoints_work_without_any_consent(client):
    """Ключевой инвариант: /consents/policy не должен сам себя блокировать —
    иначе пользователю без согласий некуда его дать."""
    user = await _register_without_consent(client, "consent-self-unlock@example.com", "dev-self-0001")

    resp = await client.get("/api/v1/consents/policy", headers=user["headers"])
    assert resp.status_code == 200

    resp = await client.get("/api/v1/consents/me", headers=user["headers"])
    assert resp.status_code == 200

    resp = await client.put(
        "/api/v1/consents/policy", json={"kind": "terms", "granted": True}, headers=user["headers"]
    )
    assert resp.status_code == 200


# -------------------------------------------------------------- регресс: каждый роутер гейтится


def _v1_submodules():
    """Модули, импортированные в app.api.v1.router и подключённые через
    router.include_router(...) — источник для регресс-теста ниже."""
    from app.api.v1 import router as router_module

    for name, value in vars(router_module).items():
        if isinstance(value, types.ModuleType) and value.__name__.startswith("app.api.v1."):
            yield name, value


def test_every_v1_router_is_gated_or_explicitly_allowlisted():
    """Каждый роутер, подключённый в router.py, обязан либо нести
    require_consented, либо быть в жёстком allowlist (auth, consent).

    Смысл: новый роутер, добавленный без гейта, должен ронять этот тест,
    а не проходить незамеченным.
    """
    from app.api.v1 import router as router_module

    allowlist = {"auth", "consent"}
    v1_routes = router_module.router.routes
    submodules = list(_v1_submodules())
    assert submodules, "не нашли ни одного подключённого роутера — тест сломан"

    checked_any = False
    for name, module in submodules:
        sub_router = module.router
        prefix = sub_router.prefix
        matching = [r for r in v1_routes if getattr(r, "path", "").startswith(f"/api/v1{prefix}")]
        assert matching, f"роутер {name!r} (prefix={prefix!r}) не найден среди подключённых маршрутов"
        checked_any = True

        if name in allowlist:
            continue

        for route in matching:
            deps = [getattr(d, "dependency", d) for d in getattr(route, "dependencies", [])]
            assert require_consented in deps, (
                f"роутер {name!r}: маршрут {route.path} не гейтится require_consented "
                f"и не в allowlist {allowlist}"
            )

    assert checked_any


async def test_allowlisted_routers_are_not_accidentally_gated():
    """Обратная сторона регресса: auth/consent не должны внезапно обрасти
    гейтом — иначе онбординг сломается тихо, без явной правки allowlist."""
    from app.api.v1 import router as router_module

    v1_routes = router_module.router.routes
    for name in ("auth", "consent"):
        module = vars(router_module)[name]
        prefix = module.router.prefix
        matching = [r for r in v1_routes if getattr(r, "path", "").startswith(f"/api/v1{prefix}")]
        assert matching
        for route in matching:
            deps = [getattr(d, "dependency", d) for d in getattr(route, "dependencies", [])]
            assert require_consented not in deps, (
                f"{name}: {route.path} внезапно гейтится — обнови allowlist осознанно, "
                "если это правда нужно"
            )


# -------------------------------------------------------------- MeOut / PATCH users/me


async def test_me_out_reflects_each_consent_independently(client):
    user = await _register_without_consent(client, "meout@example.com", "dev-meout-0001")

    resp = await client.get("/api/v1/auth/me", headers=user["headers"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["terms_accepted"] is False
    assert body["health_consent_accepted"] is False

    resp = await client.put(
        "/api/v1/consents/policy", json={"kind": "terms", "granted": True}, headers=user["headers"]
    )
    assert resp.status_code == 200

    resp = await client.get("/api/v1/auth/me", headers=user["headers"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["terms_accepted"] is True
    assert body["health_consent_accepted"] is False, "грант terms не должен подтягивать health_data"

    resp = await client.put(
        "/api/v1/consents/policy", json={"kind": "health_data", "granted": True}, headers=user["headers"]
    )
    assert resp.status_code == 200

    resp = await client.get("/api/v1/auth/me", headers=user["headers"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["terms_accepted"] is True
    assert body["health_consent_accepted"] is True


async def test_patch_users_me_response_reflects_partial_consent(client):
    """PATCH /users/me тоже отдаёт MeOut — гейтится require_consented, поэтому
    для проверки нужен пользователь с обоими согласиями, но с частично
    отозванным health_data уже после первого запроса."""
    from tests.conftest import register_user

    user = await register_user(client, "patchme@example.com", "dev-patch-0001")

    resp = await client.patch("/api/v1/users/me", json={"first_name": "Игрок"}, headers=user["headers"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["terms_accepted"] is True
    assert body["health_consent_accepted"] is True

    resp = await client.put(
        "/api/v1/consents/policy", json={"kind": "health_data", "granted": False}, headers=user["headers"]
    )
    assert resp.status_code == 200

    # Гейт теперь закрыт — PATCH /users/me должен вернуть 403, а не устаревший MeOut
    resp = await client.patch("/api/v1/users/me", json={"first_name": "Игрок2"}, headers=user["headers"])
    assert resp.status_code == 403
