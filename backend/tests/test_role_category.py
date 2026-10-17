"""Аккаунт — либо игрок, либо штаб, не разом (teams_service.ensure_single_role_category).

Категория роли (athlete vs head_coach/coach/medic) одна на пользователя на всю
организацию: он может быть athlete в двух командах, или head_coach в одной и
coach в другой (обе штаб) — но не athlete в одной команде и штабной ролью в
другой. Проверяем все входные точки, где команда/роль назначается:
PUT /teams/{id}/members, перевод, создание инвайта и его консюминг на verify.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models.invitation import Invitation
from app.models.organization import Organization
from app.models.team import TeamMembership
from tests.conftest import register_user


async def _org_with_two_teams(client, admin_email: str) -> tuple[dict, str, str]:
    admin = await register_user(client, admin_email, device_id=f"device-{admin_email}")
    resp = await client.post(
        "/api/v1/organizations", json={"name": f"Org {admin_email}"}, headers=admin["headers"]
    )
    assert resp.status_code == 201
    team_a_resp = await client.post("/api/v1/teams", json={"name": "Team A"}, headers=admin["headers"])
    team_b_resp = await client.post("/api/v1/teams", json={"name": "Team B"}, headers=admin["headers"])
    return admin, team_a_resp.json()["id"], team_b_resp.json()["id"]


async def _invite_and_register(client, admin: dict, identifier: str, team_id: str, team_role: str) -> dict:
    resp = await client.post(
        "/api/v1/organizations/invites",
        json={"identifier": identifier, "global_role": "player", "team_id": team_id, "team_role": team_role},
        headers=admin["headers"],
    )
    assert resp.status_code == 201, resp.text
    return await register_user(client, identifier, device_id=f"device-{identifier}")


async def test_upsert_member_rejects_mixed_category(client):
    admin, team_a, team_b = await _org_with_two_teams(client, "admin-cat-1@org.com")
    player = await _invite_and_register(client, admin, "athlete-cat-1@org.com", team_a, "athlete")

    resp = await client.put(
        f"/api/v1/teams/{team_b}/members",
        json={"user_id": player["user_id"], "team_role": "coach"},
        headers=admin["headers"],
    )
    assert resp.status_code == 409


async def test_upsert_member_allows_same_category_in_another_team(client, db):
    admin, team_a, team_b = await _org_with_two_teams(client, "admin-cat-2@org.com")
    player = await _invite_and_register(client, admin, "athlete-cat-2@org.com", team_a, "athlete")

    resp = await client.put(
        f"/api/v1/teams/{team_b}/members",
        json={"user_id": player["user_id"], "team_role": "athlete"},
        headers=admin["headers"],
    )
    assert resp.status_code == 204

    rows = (
        (await db.execute(select(TeamMembership).where(TeamMembership.user_id == player["user_id"])))
        .scalars()
        .all()
    )
    assert {str(tm.team_id) for tm in rows} == {team_a, team_b}


async def test_transfer_rejects_role_override_creating_mixed_category(client):
    """Игрок athlete и в team_a, и в team_c (третья команда) разом; перевод
    team_a → team_b с явной сменой роли на coach должен упасть — в team_c он
    всё ещё athlete, смешивать категории нельзя."""
    admin, team_a, team_b = await _org_with_two_teams(client, "admin-cat-3@org.com")
    team_c_resp = await client.post("/api/v1/teams", json={"name": "Team C"}, headers=admin["headers"])
    team_c = team_c_resp.json()["id"]
    player = await _invite_and_register(client, admin, "athlete-cat-3@org.com", team_a, "athlete")

    resp = await client.put(
        f"/api/v1/teams/{team_c}/members",
        json={"user_id": player["user_id"], "team_role": "athlete"},
        headers=admin["headers"],
    )
    assert resp.status_code == 204

    resp = await client.post(
        f"/api/v1/teams/{team_a}/members/{player['user_id']}/transfer",
        json={"to_team_id": team_b, "team_role": "coach"},
        headers=admin["headers"],
    )
    assert resp.status_code == 409


async def test_create_invitation_rejects_mixed_category_for_existing_user(client):
    admin, team_a, team_b = await _org_with_two_teams(client, "admin-cat-4@org.com")
    await _invite_and_register(client, admin, "athlete-cat-4@org.com", team_a, "athlete")

    resp = await client.post(
        "/api/v1/organizations/invites",
        json={
            "identifier": "athlete-cat-4@org.com",
            "global_role": "staff",
            "team_id": team_b,
            "team_role": "coach",
        },
        headers=admin["headers"],
    )
    assert resp.status_code == 409


async def test_consume_invite_skips_team_assignment_on_conflict(client, db):
    """Инвайт создан раньше, чем конфликт возник (race) — проверяем защиту на
    стороне consume_for_user напрямую через БД, не только create_invitation."""
    admin, team_a, team_b = await _org_with_two_teams(client, "admin-cat-5@org.com")
    player = await _invite_and_register(client, admin, "athlete-cat-5@org.com", team_a, "athlete")

    # Инвайт на coach в team_b вставлен напрямую в обход create_invitation —
    # имитирует ситуацию, когда на момент создания инвайта конфликта ещё не было
    # (игрок стал athlete в team_a позже, пока инвайт на team_b ждал в pending).
    org = (
        await db.execute(select(Organization).where(Organization.name == "Org admin-cat-5@org.com"))
    ).scalar_one()
    invitation = Invitation(
        identifier="athlete-cat-5@org.com",
        org_id=org.id,
        global_role="staff",
        team_id=team_b,
        team_role="coach",
        invited_by=admin["user_id"],
        expires_at=datetime.now(UTC) + timedelta(days=7),
    )
    db.add(invitation)
    await db.commit()

    # Повторный вход тем же identifier — verify_otp консюмит pending-инвайты
    await register_user(client, "athlete-cat-5@org.com", device_id="device-athlete-cat-5-second")

    await db.refresh(invitation)
    assert invitation.status == "pending"  # не применился — конфликт категорий

    rows = (
        (await db.execute(select(TeamMembership).where(TeamMembership.user_id == player["user_id"])))
        .scalars()
        .all()
    )
    assert {(str(tm.team_id), tm.team_role) for tm in rows} == {(team_a, "athlete")}
