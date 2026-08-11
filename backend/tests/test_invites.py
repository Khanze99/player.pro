"""Инвайты: lifecycle (one-time, TTL, преднастроенная роль) + авто-head_coach при create_team."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models.enums import InvitationStatus, TeamRole
from app.models.invitation import Invitation
from app.models.team import TeamMembership
from tests.conftest import register_user


async def _make_admin_with_team(client):
    admin = await register_user(client, "admin@example.com")
    org = await client.post("/api/v1/organizations", json={"name": "FC Test"}, headers=admin["headers"])
    assert org.status_code == 201, org.text
    team = await client.post("/api/v1/teams", json={"name": "Team A"}, headers=admin["headers"])
    assert team.status_code == 201, team.text
    return admin, org.json(), team.json()


async def test_create_team_makes_creator_head_coach(client, db):
    admin, _org, team = await _make_admin_with_team(client)
    membership = (
        await db.execute(
            select(TeamMembership).where(
                TeamMembership.user_id == admin["user_id"], TeamMembership.team_id == team["id"]
            )
        )
    ).scalar_one()
    assert membership.team_role == TeamRole.head_coach


async def test_invite_consumed_on_verify_attaches_user(client, db):
    admin, org, team = await _make_admin_with_team(client)
    inv = await client.post(
        "/api/v1/organizations/invites",
        json={
            "identifier": "athlete@example.com",
            "name": "Иванов Иван Петрович",
            "global_role": "player",
            "team_id": team["id"],
            "team_role": "athlete",
        },
        headers=admin["headers"],
    )
    assert inv.status_code == 201, inv.text
    assert inv.json()["status"] == "pending"

    # Обычный вход по OTP — на verify приглашение консюмится
    athlete = await register_user(client, "athlete@example.com", device_id="dev-athlete")
    me = await client.get("/api/v1/auth/me", headers=athlete["headers"])
    assert me.status_code == 200
    assert me.json()["org_id"] == org["id"]
    # ФИО из приглашения раскладывается по полям
    assert me.json()["last_name"] == "Иванов"
    assert me.json()["first_name"] == "Иван"
    assert me.json()["middle_name"] == "Петрович"

    membership = (
        await db.execute(
            select(TeamMembership).where(
                TeamMembership.user_id == athlete["user_id"], TeamMembership.team_id == team["id"]
            )
        )
    ).scalar_one()
    assert membership.team_role == TeamRole.athlete

    invitation = (await db.execute(select(Invitation))).scalar_one()
    assert invitation.status == InvitationStatus.accepted


async def test_non_admin_cannot_invite(client):
    user = await register_user(client, "plain@example.com")
    resp = await client.post(
        "/api/v1/organizations/invites",
        json={"identifier": "x@example.com"},
        headers=user["headers"],
    )
    assert resp.status_code == 403


async def test_team_role_required_when_team_given(client):
    admin, _org, team = await _make_admin_with_team(client)
    resp = await client.post(
        "/api/v1/organizations/invites",
        json={"identifier": "y@example.com", "team_id": team["id"]},
        headers=admin["headers"],
    )
    assert resp.status_code == 422


async def test_expired_invite_not_consumed(client, db):
    admin, _org, team = await _make_admin_with_team(client)
    await client.post(
        "/api/v1/organizations/invites",
        json={
            "identifier": "late@example.com",
            "global_role": "player",
            "team_id": team["id"],
            "team_role": "athlete",
        },
        headers=admin["headers"],
    )
    invitation = (await db.execute(select(Invitation))).scalar_one()
    invitation.expires_at = datetime.now(UTC) - timedelta(days=1)
    await db.commit()

    athlete = await register_user(client, "late@example.com", device_id="dev-late")
    me = await client.get("/api/v1/auth/me", headers=athlete["headers"])
    assert me.json()["org_id"] is None  # к организации не привязан

    await db.refresh(invitation)
    assert invitation.status == InvitationStatus.expired
