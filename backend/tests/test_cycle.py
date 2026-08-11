"""Цикл: формулы фаз, разграничение витрин тренер/врач, аменорея.

Главное здесь — не «работает ли календарь», а что тренер никогда не получает
клиническую детализацию, даже имея полное согласие.
"""

import uuid
from datetime import date, timedelta

import pytest
from fastapi import HTTPException

from app.core import authz
from app.core import calculations as calc
from app.models.enums import (
    ConsentAudience,
    ConsentScope,
    Contraception,
    CyclePhase,
    CycleSymptom,
    GlobalRole,
    TeamRole,
    UserStatus,
)
from app.models.organization import Organization
from app.models.team import Team, TeamMembership
from app.models.user import User
from app.schemas.cycle import CycleLogIn, CycleSettingsIn, SymptomIn
from app.services import consent_service, cycle_service
from tests.conftest import register_user

# ------------------------------------------------------------------ формулы


@pytest.mark.parametrize(
    ("day_of_cycle", "expected"),
    [
        (None, "unknown"),
        (1, "menstrual"),
        (5, "menstrual"),
        (6, "follicular"),
        (12, "follicular"),
        (13, "ovulation"),  # окно ±1 вокруг дня 14
        (14, "ovulation"),  # 28 − 14 = 14
        (15, "ovulation"),
        (16, "luteal"),
        (28, "luteal"),
        (60, "unknown"),  # неправдоподобно длинный цикл — вероятно, пропущена отметка
    ],
)
def test_cycle_phase_boundaries(day_of_cycle, expected):
    assert calc.cycle_phase(day_of_cycle, 28, 5) == expected


def test_ovulation_anchored_to_cycle_end_not_start():
    """Лютеиновая фаза стабильна ~14 дней: при цикле 35 овуляция на 21-й день, не на 14-й."""
    assert calc.cycle_phase(21, 35, 5) == "ovulation"
    assert calc.cycle_phase(14, 35, 5) == "follicular"


def test_hormonal_contraception_suppresses_phases():
    """Подавленная овуляция — фаз в привычном смысле нет, и врать об этом нельзя."""
    assert calc.cycle_phase(14, 28, 5, suppressed=True) == "suppressed"


def test_cycle_day_counts_from_one():
    start = date(2026, 8, 1)
    assert calc.cycle_day(start, start) == 1
    assert calc.cycle_day(start + timedelta(days=5), start) == 6
    assert calc.cycle_day(start - timedelta(days=1), start) is None
    assert calc.cycle_day(start, None) is None


def test_amenorrhea_flag_at_90_days():
    start = date(2026, 5, 1)
    assert not calc.is_amenorrhea(start + timedelta(days=89), start)
    assert calc.is_amenorrhea(start + timedelta(days=90), start)
    assert not calc.is_amenorrhea(start, None)


def test_average_cycle_length_drops_implausible_gaps():
    """Пропущенная отметка даёт «цикл» в 60 дней — он не должен портить среднее."""
    starts = [date(2026, 1, 1), date(2026, 1, 29), date(2026, 3, 30), date(2026, 4, 27)]
    # Интервалы: 28, 60 (выброс), 28 → остаётся 28
    assert calc.average_cycle_length(starts) == 28
    assert calc.average_cycle_length([date(2026, 1, 1)]) is None


# ------------------------------------------------------------------ фикстуры


async def _team_with_female_athlete(db) -> dict:
    org = Organization(name="Клуб")
    db.add(org)
    await db.flush()
    team = Team(org_id=org.id, name="Основа")
    db.add(team)
    await db.flush()

    def make(name: str, role: GlobalRole) -> User:
        user = User(
            org_id=org.id,
            last_name=name,
            email=f"{name}-{uuid.uuid4().hex[:8]}@test.com",
            global_role=role,
            status=UserStatus.active,
        )
        db.add(user)
        return user

    athlete = make("athlete", GlobalRole.player)
    coach = make("coach", GlobalRole.staff)
    medic = make("medic", GlobalRole.staff)
    await db.flush()
    for user, role in [
        (athlete, TeamRole.athlete),
        (coach, TeamRole.coach),
        (medic, TeamRole.medic),
    ]:
        db.add(TeamMembership(user_id=user.id, team_id=team.id, team_role=role))
    await db.commit()
    return {"athlete": athlete, "coach": coach, "medic": medic}


# ------------------------------------------------------------------ состояние


async def test_state_uses_observed_cycle_length_over_declared(db):
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    today = date(2026, 8, 8)

    await cycle_service.upsert_settings(
        db, athlete_id, CycleSettingsIn(tracking_enabled=True, average_cycle_length=28)
    )
    # Фактические циклы по 31 дню
    for start in (date(2026, 5, 8), date(2026, 6, 8), date(2026, 7, 9), date(2026, 8, 9 - 1)):
        await cycle_service.upsert_log(db, athlete_id, CycleLogIn(date=start, period_start=True))

    state = await cycle_service.current_state(db, athlete_id, today)
    assert state.observed_cycle_length == 31
    assert state.average_cycle_length == 31  # наблюдение важнее заявленного


async def test_state_flags_amenorrhea(db):
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    today = date(2026, 8, 8)
    await cycle_service.upsert_log(
        db, athlete_id, CycleLogIn(date=today - timedelta(days=100), period_start=True)
    )

    state = await cycle_service.current_state(db, athlete_id, today)
    assert state.amenorrhea_flag is True
    assert state.days_since_last_period == 100


async def test_no_prediction_when_contraception_suppresses(db):
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    today = date(2026, 8, 8)
    await cycle_service.upsert_settings(
        db, athlete_id, CycleSettingsIn(tracking_enabled=True, contraception=Contraception.combined_oc)
    )
    await cycle_service.upsert_log(
        db, athlete_id, CycleLogIn(date=today - timedelta(days=10), period_start=True)
    )

    state = await cycle_service.current_state(db, athlete_id, today)
    assert state.phase == CyclePhase.suppressed
    assert state.next_period_predicted is None


# ------------------------------------------------------------------ витрины


async def test_coach_view_hides_clinical_detail(db):
    """Центральное правило этапа: тренер получает фазу и один флаг, и ничего больше."""
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    today = date(2026, 8, 8)

    await cycle_service.upsert_log(
        db,
        athlete_id,
        CycleLogIn(
            date=today,
            period_start=True,
            symptoms=[SymptomIn(symptom=CycleSymptom.cramps, severity=8)],
        ),
    )

    coach_view = await cycle_service.staff_view_for_coach(db, athlete_id, today)
    fields = coach_view.model_dump()
    assert set(fields) == {"athlete_id", "date", "phase", "has_training_affecting_symptoms"}
    assert coach_view.has_training_affecting_symptoms is True
    # Ни симптомов, ни дат менструации, ни прогноза
    assert "recent_symptoms" not in fields
    assert "last_period_start" not in fields

    medic_view = await cycle_service.staff_view_for_medic(db, athlete_id, today)
    assert medic_view.state.last_period_start == today
    assert medic_view.recent_symptoms[0]["symptom"] == CycleSymptom.cramps


async def test_mild_symptom_does_not_raise_coach_flag(db):
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    today = date(2026, 8, 8)
    await cycle_service.upsert_log(
        db,
        athlete_id,
        CycleLogIn(date=today, symptoms=[SymptomIn(symptom=CycleSymptom.cramps, severity=2)]),
    )

    view = await cycle_service.staff_view_for_coach(db, athlete_id, today)
    assert view.has_training_affecting_symptoms is False


async def test_non_training_symptom_does_not_raise_flag(db):
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    today = date(2026, 8, 8)
    await cycle_service.upsert_log(
        db,
        athlete_id,
        CycleLogIn(date=today, symptoms=[SymptomIn(symptom=CycleSymptom.bloating, severity=10)]),
    )

    view = await cycle_service.staff_view_for_coach(db, athlete_id, today)
    assert view.has_training_affecting_symptoms is False


# ------------------------------------------------------------------ доступ


async def test_cycle_data_closed_without_consent(db):
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    for role in ("coach", "medic"):
        with pytest.raises(HTTPException):
            await authz.ensure_can_view_sensitive(db, world[role], athlete_id, ConsentScope.cycle)


async def test_medic_consent_opens_cycle_to_medic_only(db):
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    await consent_service.grant(db, athlete_id, ConsentScope.cycle, ConsentAudience.medic)

    await authz.ensure_can_view_sensitive(db, world["medic"], athlete_id, ConsentScope.cycle)
    with pytest.raises(HTTPException):
        await authz.ensure_can_view_sensitive(db, world["coach"], athlete_id, ConsentScope.cycle)


# ------------------------------------------------------------------ записи и API


async def test_upsert_log_replaces_not_duplicates(db):
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    today = date(2026, 8, 8)

    await cycle_service.upsert_log(
        db, athlete_id, CycleLogIn(date=today, symptoms=[SymptomIn(symptom=CycleSymptom.cramps, severity=5)])
    )
    await cycle_service.upsert_log(
        db,
        athlete_id,
        CycleLogIn(date=today, symptoms=[SymptomIn(symptom=CycleSymptom.fatigue, severity=7)]),
    )

    logs = await cycle_service.get_logs(db, athlete_id, today, today)
    assert len(logs) == 1
    assert len(logs[0].symptoms) == 1
    assert logs[0].symptoms[0].symptom == CycleSymptom.fatigue


async def test_insights_need_enough_cycles(db):
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    today = date(2026, 8, 8)
    await cycle_service.upsert_log(
        db, athlete_id, CycleLogIn(date=today - timedelta(days=10), period_start=True)
    )

    result = await cycle_service.insights(db, athlete_id, today)
    assert result.enough_data is False  # один цикл — паттерн показывать рано


async def test_cycle_api_is_self_only(client):
    """Эндпоинта «записать цикл за игрока» не существует и не должно появиться."""
    user = await register_user(client, "cycle@example.com")
    other = uuid.uuid4()
    for path in (f"/api/v1/cycle/athletes/{other}/logs", f"/api/v1/cycle/athletes/{other}/settings"):
        resp = await client.put(path, json={"date": "2026-08-08"}, headers=user["headers"])
        assert resp.status_code in (404, 405), f"{path}: {resp.status_code}"


async def test_cycle_api_roundtrip(client):
    user = await register_user(client, "cycle2@example.com")
    today = date.today().isoformat()

    resp = await client.put(
        "/api/v1/cycle/me/settings",
        json={"tracking_enabled": True, "contraception": "none"},
        headers=user["headers"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["tracking_enabled"] is True

    resp = await client.put(
        "/api/v1/cycle/me/logs",
        json={
            "date": today,
            "period_start": True,
            "flow": "medium",
            "symptoms": [{"symptom": "cramps", "severity": 7}],
        },
        headers=user["headers"],
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["symptoms"][0]["severity"] == 7

    resp = await client.get("/api/v1/cycle/me/state", headers=user["headers"])
    assert resp.status_code == 200
    assert resp.json()["cycle_day"] == 1
    assert resp.json()["phase"] == "menstrual"

    resp = await client.delete(f"/api/v1/cycle/me/logs/{today}", headers=user["headers"])
    assert resp.status_code == 204


async def test_athlete_state_endpoint_shape_depends_on_role(client, db):
    """Один URL, две витрины: тренер и врач не могут перепутаться местами."""
    world = await _team_with_female_athlete(db)
    athlete_id = world["athlete"].id
    await consent_service.grant(db, athlete_id, ConsentScope.cycle, ConsentAudience.coach)
    await cycle_service.upsert_log(
        db,
        athlete_id,
        CycleLogIn(
            date=date.today(),
            period_start=True,
            symptoms=[SymptomIn(symptom=CycleSymptom.cramps, severity=9)],
        ),
    )

    # Логинимся под уже существующими тренером и врачом
    coach = await register_user(client, world["coach"].email, "coach-device-01")
    medic = await register_user(client, world["medic"].email, "medic-device-01")

    resp = await client.get(f"/api/v1/cycle/athletes/{athlete_id}/state", headers=coach["headers"])
    assert resp.status_code == 200, resp.text
    assert set(resp.json()) == {"athlete_id", "date", "phase", "has_training_affecting_symptoms"}

    resp = await client.get(f"/api/v1/cycle/athletes/{athlete_id}/state", headers=medic["headers"])
    assert resp.status_code == 200, resp.text
    assert "state" in resp.json()
    assert "recent_symptoms" in resp.json()
