"""Одинаковые границы доступа к профилю, истории и цели веса."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import delete, select

from app.models.consent import DataConsent
from app.models.enums import ConsentAudience, ConsentScope, TeamRole
from app.models.team import Team, TeamMembership
from app.services import consent_service
from tests.test_authz import WELLNESS, build_org


@pytest.mark.parametrize("consent_state", ["absent", "medic", "revoked", "outdated"])
async def test_weight_access_ignores_legacy_consent_but_preserves_team_boundary(client, db, consent_state):
    org = await build_org(client)
    # Создатель команды автоматически head_coach. Для admin-only снимаем именно
    # командную роль, сохраняя глобальную роль администратора организации.
    await db.execute(delete(TeamMembership).where(TeamMembership.user_id == org["admin"]["user_id"]))
    await db.commit()
    athlete_id = org["athlete1"]["user_id"]
    headers = org["athlete1"]["headers"]
    profile = await client.put(
        "/api/v1/users/me/profile", json={"height_cm": 190, "weight_kg": 85}, headers=headers
    )
    assert profile.status_code == 200, profile.text
    entry = await client.post("/api/v1/wellness", json={**WELLNESS, "weight_kg": 85}, headers=headers)
    assert entry.status_code == 201, entry.text
    goal = await client.put("/api/v1/users/me/weight-goal", json={"target_weight_kg": 80}, headers=headers)
    assert goal.status_code == 200, goal.text
    if consent_state != "absent":
        consent = await consent_service.grant(
            db, athlete_id, ConsentScope.body_metrics, ConsentAudience.medic
        )
        if consent_state == "revoked":
            await consent_service.revoke(db, athlete_id, ConsentScope.body_metrics)
        elif consent_state == "outdated":
            consent.policy_version = "obsolete"
            await db.commit()

    urls = [
        f"/api/v1/users/athletes/{athlete_id}/profile",
        f"/api/v1/wellness/athletes/{athlete_id}",
        f"/api/v1/users/athletes/{athlete_id}/weight-goal",
    ]
    for viewer in ("athlete1", "coach", "medic"):
        results = [await client.get(url, headers=org[viewer]["headers"]) for url in urls]
        assert [r.status_code for r in results] == [200, 200, 200]
        profile, history, goal = [r.json() for r in results]
        assert profile["height_cm"] == 190
        assert float(profile["weight_kg"]) == 85
        assert profile["bmi"] is not None
        assert profile["bmi_zone"] != "no_data"
        assert float(history[0]["weight_kg"]) == 85
        assert float(goal["target_weight_kg"]) == 80

    # Только роль администратора не даёт доступа к антропометрии.
    results = [await client.get(url, headers=org["admin"]["headers"]) for url in urls]
    assert [r.status_code for r in results] == [200, 200, 200]
    profile, history, goal = [r.json() for r in results]
    assert profile["height_cm"] is None
    assert profile["weight_kg"] is None
    assert profile["bmi"] is None
    assert profile["bmi_zone"] == "no_data"
    assert history[0]["weight_kg"] is None
    assert goal is None

    for viewer in ("athlete2", "outsider"):
        for url in urls:
            response = await client.get(url, headers=org[viewer]["headers"])
            assert response.status_code == 403, response.text

    # head_coach имеет те же права, что coach.
    membership = await db.scalar(
        select(TeamMembership).where(TeamMembership.user_id == org["coach"]["user_id"])
    )
    membership.team_role = TeamRole.head_coach
    await db.commit()
    for url in urls:
        response = await client.get(url, headers=org["coach"]["headers"])
        assert response.status_code == 200, response.text
        assert response.json() is not None

    # Admin с ролью врача/тренера читает как штаб, а не через admin-обход.
    db.add(
        TeamMembership(user_id=org["admin"]["user_id"], team_id=membership.team_id, team_role=TeamRole.medic)
    )
    await db.commit()
    admin_profile = await client.get(urls[0], headers=org["admin"]["headers"])
    assert float(admin_profile.json()["weight_kg"]) == 85
    admin_history = await client.get(urls[1], headers=org["admin"]["headers"])
    assert float(admin_history.json()[0]["weight_kg"]) == 85
    admin_goal = await client.get(urls[2], headers=org["admin"]["headers"])
    assert float(admin_goal.json()["target_weight_kg"]) == 80

    # После перевода тренера в другую команду той же организации доступ закрыт.
    team = await db.get(Team, membership.team_id)
    other_team = Team(org_id=team.org_id, name="Другая команда")
    db.add(other_team)
    await db.flush()
    membership.team_id = other_team.id
    await db.commit()
    for url in urls:
        response = await client.get(url, headers=org["coach"]["headers"])
        assert response.status_code == 403, response.text

    # Чтение не создаёт фиктивных согласий.
    consents = (await db.scalars(select(DataConsent))).all()
    assert len(consents) == (0 if consent_state == "absent" else 1)
    if consent_state == "revoked":
        assert consents[0].revoked_at <= datetime.now(UTC)


async def test_weight_is_not_visible_to_another_organization(client):
    first = await build_org(client)
    second = await build_org(client, suffix="other")
    athlete_id = first["athlete1"]["user_id"]
    for viewer in ("admin", "coach", "medic"):
        for url in (
            f"/api/v1/users/athletes/{athlete_id}/profile",
            f"/api/v1/wellness/athletes/{athlete_id}",
            f"/api/v1/users/athletes/{athlete_id}/weight-goal",
        ):
            response = await client.get(url, headers=second[viewer]["headers"])
            assert response.status_code == 403, response.text
