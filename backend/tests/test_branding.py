"""Тема организации (docs/plan-org-branding.md).

Проверяется не «отдаётся ли что-то», а три свойства: ответ всегда одной формы,
организации не видят чужих тем, и светофор состояний темой не переопределяется.
"""

import uuid

import pytest
from pydantic import ValidationError

from app.models.organization import Organization
from app.models.user import User
from app.schemas.branding import DEFAULT_TOKENS, ThemeTokens
from app.services import branding_service
from tests.conftest import register_user

pytestmark = pytest.mark.asyncio


async def _org(db, name: str) -> Organization:
    org = Organization(name=name)
    db.add(org)
    await db.commit()
    await db.refresh(org)
    return org


async def _attach(db, user_id: str, org_id: uuid.UUID) -> None:
    user = await db.get(User, uuid.UUID(user_id))
    user.org_id = org_id
    await db.commit()


RUBIN = {"brand": "#8E1537", "brand_dark": "#6E0F29", "brand_on": "#D9476E", "brand_2": "#00953B"}


async def test_user_without_org_gets_default_theme(client):
    """Личный режим: тема продукта, версия 0, форма ответа та же."""
    user = await register_user(client, "solo@test.com")
    resp = await client.get("/api/v1/branding", headers=user["headers"])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["version"] == 0
    assert body["org_id"] is None
    assert body["tokens"]["brand"] == DEFAULT_TOKENS.brand


async def test_org_without_branding_gets_default_theme(client, db):
    """Организация есть, темы нет — те же дефолтные цвета, но с названием клуба."""
    org = await _org(db, "Клуб без темы")
    user = await register_user(client, "noTheme@test.com")
    await _attach(db, user["user_id"], org.id)

    body = (await client.get("/api/v1/branding", headers=user["headers"])).json()
    assert body["version"] == 0
    assert body["org_name"] == "Клуб без темы"
    assert body["tokens"] == DEFAULT_TOKENS.model_dump(mode="json")


async def test_org_theme_is_returned_in_full(client, db):
    """Клиент получает полный набор цветов: заданные клубом и дефолтные остальные."""
    org = await _org(db, "ФК Рубин")
    await branding_service.set_branding(db, org.id, ThemeTokens(**RUBIN), logo_url="/static/rubin.png")
    user = await register_user(client, "rubin@test.com")
    await _attach(db, user["user_id"], org.id)

    body = (await client.get("/api/v1/branding", headers=user["headers"])).json()
    assert body["version"] == 1
    assert body["logo_url"] == "/static/rubin.png"
    assert body["tokens"]["brand"] == "#8E1537"
    assert body["tokens"]["brand_2"] == "#00953B"
    # незаданное клубом осталось продуктовым
    assert body["tokens"]["bg"] == DEFAULT_TOKENS.bg
    assert body["tokens"]["text"] == DEFAULT_TOKENS.text


async def test_version_grows_on_every_change(client, db):
    """По версии клиент понимает, что тему пора перечитать."""
    org = await _org(db, "Клуб с правками")
    # версию снимаем сразу: identity map вернёт тот же объект, и «первая» ссылка
    # после второй записи показывала бы уже новое значение
    first = (await branding_service.set_branding(db, org.id, ThemeTokens(**RUBIN))).version
    second = (await branding_service.set_branding(db, org.id, ThemeTokens(brand="#123456"))).version
    assert (first, second) == (1, 2)

    user = await register_user(client, "versioned@test.com")
    await _attach(db, user["user_id"], org.id)
    body = (await client.get("/api/v1/branding", headers=user["headers"])).json()
    assert body["version"] == 2
    assert body["tokens"]["brand"] == "#123456"


async def test_other_org_theme_is_not_visible(client, db):
    """Тема всегда своя: чужую нельзя получить, потому что её нечем запросить."""
    theirs = await _org(db, "Чужой клуб")
    await branding_service.set_branding(db, theirs.id, ThemeTokens(brand="#8E1537"))
    mine = await _org(db, "Мой клуб")
    user = await register_user(client, "mine@test.com")
    await _attach(db, user["user_id"], mine.id)

    body = (await client.get("/api/v1/branding", headers=user["headers"])).json()
    assert body["org_name"] == "Мой клуб"
    assert body["tokens"]["brand"] == DEFAULT_TOKENS.brand


async def test_branding_requires_auth(client):
    assert (await client.get("/api/v1/branding")).status_code == 401


async def test_status_colors_cannot_be_themed():
    """Светофор в теме отсутствует физически — переопределить его нечем."""
    with pytest.raises(ValidationError):
        ThemeTokens(good="#000000")
    assert not {"good", "caution", "risk", "low"} & set(ThemeTokens.model_fields)


async def test_malformed_color_is_rejected():
    with pytest.raises(ValidationError):
        ThemeTokens(brand="8E1537")
    with pytest.raises(ValidationError):
        ThemeTokens(brand="#XYZ123")
