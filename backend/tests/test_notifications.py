"""Колокольчик (docs/plan-notifications.md): триггеры, дедуп, получатели, доступ к ленте."""

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, func, select

from app.models.enums import AttendanceStatus, EventType, NotificationType
from app.models.event import Attendance, Event
from app.models.notification import Notification
from app.models.team import TeamMembership
from app.services import notifications_service
from tests.test_authz import WELLNESS, build_org

GOOD_WELLNESS = WELLNESS | {"mood": 9, "energy": 9, "sleep_quality": 9, "stress": 2, "soreness": 2}


async def _count(db, **filters) -> int:
    stmt = select(func.count()).select_from(Notification)
    for name, value in filters.items():
        stmt = stmt.where(getattr(Notification, name) == value)
    return await db.scalar(stmt)


async def _feed(client, who) -> list[dict]:
    resp = await client.get("/api/v1/notifications", headers=who["headers"])
    assert resp.status_code == 200, resp.text
    return resp.json()["items"]


async def _unread(client, who) -> int:
    resp = await client.get("/api/v1/notifications/unread-count", headers=who["headers"])
    assert resp.status_code == 200, resp.text
    return resp.json()["count"]


# ------------------------------------------------------------------ штабу: травма, болезнь, боль


async def test_injury_illness_pain_reach_coach_and_medic_not_admin_or_athlete(client, db):
    org = await build_org(client)
    # Создатель команды становится её head_coach; здесь проверяем admin без командной роли.
    await db.execute(
        delete(TeamMembership).where(TeamMembership.user_id == uuid.UUID(org["admin"]["user_id"]))
    )
    await db.commit()
    payload = GOOD_WELLNESS | {
        "injury": True,
        "injury_details": "потянул заднюю",
        "symptom": True,
        "pain_points": [{"region": "knee", "side": "left", "severity": 7, "note": "секрет"}],
    }
    resp = await client.post("/api/v1/wellness", json=payload, headers=org["athlete1"]["headers"])
    assert resp.status_code == 201, resp.text

    for who in ("coach", "medic"):
        items = await _feed(client, org[who])
        types = {i["type"] for i in items}
        assert {"athlete_injury", "athlete_illness", "athlete_pain"} <= types, who
        injury = next(i for i in items if i["type"] == "athlete_injury")
        assert injury["athlete"]["id"] == org["athlete1"]["user_id"]
        assert injury["team_id"] == org["team_id"]
        # Медицинские подробности в уведомление не попадают.
        assert "потянул" not in str(items) and "секрет" not in str(items) and "knee" not in str(items)

    # Admin организации без командной роли и сам игрок: не получают.
    assert await _feed(client, org["admin"]) == []
    assert await _feed(client, org["athlete1"]) == []
    assert await _feed(client, org["athlete2"]) == []


async def test_weak_pain_does_not_notify(client, db):
    org = await build_org(client)
    payload = GOOD_WELLNESS | {"pain_points": [{"region": "knee", "severity": 4}]}
    resp = await client.post("/api/v1/wellness", json=payload, headers=org["athlete1"]["headers"])
    assert resp.status_code == 201, resp.text
    assert await _count(db, type=NotificationType.athlete_pain.value) == 0


# ------------------------------------------------------------------ штабу: риск после пересчёта


async def test_red_readiness_notifies_once_with_reason(client, db):
    org = await build_org(client)
    bad = WELLNESS | {"mood": 2, "energy": 2, "sleep_quality": 1, "stress": 9, "soreness": 8}
    resp = await client.post("/api/v1/wellness", json=bad, headers=org["athlete1"]["headers"])
    assert resp.status_code == 201, resp.text

    items = [i for i in await _feed(client, org["coach"]) if i["type"] == "athlete_risk"]
    assert len(items) == 1
    assert items[0]["reasons"] and items[0]["reasons"][0].startswith(("low_", "high_"))

    # Повтор пересчёта (ретрай задачи, второй сабмит RPE) дубля не создаёт.
    athlete_id = uuid.UUID(org["athlete1"]["user_id"])
    await notifications_service.notify_risk(db, athlete_id, date.today())
    await notifications_service.notify_risk(db, athlete_id, date.today())
    await db.commit()
    coach_id = uuid.UUID(org["coach"]["user_id"])
    assert await _count(db, user_id=coach_id, type=NotificationType.athlete_risk.value) == 1


async def test_injury_suppresses_duplicate_readiness_risk(client, db):
    org = await build_org(client)
    bad = WELLNESS | {"mood": 2, "energy": 2, "sleep_quality": 1, "stress": 9, "soreness": 8, "injury": True}
    resp = await client.post("/api/v1/wellness", json=bad, headers=org["athlete1"]["headers"])
    assert resp.status_code == 201, resp.text
    coach_id = uuid.UUID(org["coach"]["user_id"])
    assert await _count(db, user_id=coach_id, type=NotificationType.athlete_injury.value) == 1
    assert await _count(db, user_id=coach_id, type=NotificationType.athlete_risk.value) == 0


async def test_nightly_recalc_does_not_notify(client, db):
    """recalc_all идёт без notify: игрок в красной зоне не будит штаб каждую ночь."""
    from app.services import analytics_service

    org = await build_org(client)
    bad = WELLNESS | {"mood": 2, "energy": 2, "sleep_quality": 1, "stress": 9, "soreness": 8}
    await client.post("/api/v1/wellness", json=bad, headers=org["athlete1"]["headers"])
    await db.execute(delete(Notification))
    await db.commit()

    await analytics_service.recalc_all(db)
    await db.commit()
    assert await _count(db) == 0


# ------------------------------------------------------------------ игроку: события


async def _create_event(client, who, team_id, start: datetime, title="Тренировка"):
    resp = await client.post(
        "/api/v1/events",
        json={
            "team_id": team_id,
            "type": "training",
            "title": title,
            "planned_start": start.isoformat(),
            "planned_duration_min": 90,
        },
        headers=who["headers"],
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_event_created_updated_cancelled_reach_athletes(client, db):
    org = await build_org(client)
    start = datetime.now(UTC) + timedelta(days=1)
    event = await _create_event(client, org["coach"], org["team_id"], start)

    for who in ("athlete1", "athlete2"):
        items = await _feed(client, org[who])
        assert [i["type"] for i in items] == ["event_created"]
        assert items[0]["event"]["id"] == event["id"]
    # Штаб и автор о событии не уведомляются.
    assert await _feed(client, org["coach"]) == []
    assert await _feed(client, org["medic"]) == []

    # Правка только названия: тишина.
    resp = await client.patch(
        f"/api/v1/events/{event['id']}", json={"title": "Опечатка"}, headers=org["coach"]["headers"]
    )
    assert resp.status_code == 200
    assert await _count(db, type=NotificationType.event_updated.value) == 0

    # Перенос времени: уведомление.
    new_start = (start + timedelta(hours=2)).isoformat()
    resp = await client.patch(
        f"/api/v1/events/{event['id']}", json={"planned_start": new_start}, headers=org["coach"]["headers"]
    )
    assert resp.status_code == 200
    assert await _count(db, type=NotificationType.event_updated.value) == 2

    # Отмена: снимок события остаётся в ленте, хотя самого события уже нет.
    resp = await client.delete(f"/api/v1/events/{event['id']}", headers=org["coach"]["headers"])
    assert resp.status_code == 204
    items = await _feed(client, org["athlete1"])
    cancelled = next(i for i in items if i["type"] == "event_cancelled")
    assert cancelled["event"]["id"] is None
    assert cancelled["event"]["title"] == "Опечатка"
    # Ссылки на удалённое событие у старых уведомлений обнулились, снимок показывается.
    created = next(i for i in items if i["type"] == "event_created")
    assert created["event"]["id"] is None and created["event"]["planned_start"]


async def test_past_event_does_not_notify(client, db):
    org = await build_org(client)
    await _create_event(client, org["coach"], org["team_id"], datetime.now(UTC) - timedelta(days=1))
    assert await _count(db) == 0


# ------------------------------------------------------------------ игроку: статус доступности


async def test_availability_change_notifies_athlete(client):
    org = await build_org(client)
    resp = await client.put(
        "/api/v1/availability",
        json={"athlete_id": org["athlete1"]["user_id"], "date": str(date.today()), "status": "unavailable"},
        headers=org["medic"]["headers"],
    )
    assert resp.status_code == 200, resp.text
    items = await _feed(client, org["athlete1"])
    assert [(i["type"], i["status"]) for i in items] == [("availability_changed", "unavailable")]


# ------------------------------------------------------------------ напоминания (Beat)


async def test_rpe_reminder_window_attendance_and_idempotency(client, db):
    org = await build_org(client)
    now = datetime.now(UTC)
    team_id = uuid.UUID(org["team_id"])
    a1, a2 = uuid.UUID(org["athlete1"]["user_id"]), uuid.UUID(org["athlete2"]["user_id"])

    # Закончилось 40 мин назад: в окне. a2 отмечен отсутствующим.
    ended = Event(
        team_id=team_id,
        type=EventType.training,
        planned_start=now - timedelta(minutes=100),
        planned_duration_min=60,
        created_by=uuid.UUID(org["coach"]["user_id"]),
    )
    # Закончилось 10 мин назад (рано) и 8 ч назад (поздно): вне окна.
    too_early = Event(
        team_id=team_id,
        type=EventType.training,
        planned_start=now - timedelta(minutes=70),
        planned_duration_min=60,
        created_by=ended.created_by,
    )
    too_late = Event(
        team_id=team_id,
        type=EventType.training,
        planned_start=now - timedelta(hours=9),
        planned_duration_min=60,
        created_by=ended.created_by,
    )
    db.add_all([ended, too_early, too_late])
    await db.flush()
    db.add(Attendance(event_id=ended.id, user_id=a2, status=AttendanceStatus.absent))
    await db.commit()

    await notifications_service.send_rpe_reminders(db, now)
    await notifications_service.send_rpe_reminders(db, now)
    await db.commit()

    rows = (await db.execute(select(Notification).where(Notification.type == "rpe_reminder"))).scalars().all()
    assert [(r.user_id, r.event_id) for r in rows] == [(a1, ended.id)]


async def test_rpe_reminder_skips_already_rated(client, db):
    org = await build_org(client)
    now = datetime.now(UTC)
    event = Event(
        team_id=uuid.UUID(org["team_id"]),
        type=EventType.training,
        planned_start=now - timedelta(minutes=100),
        planned_duration_min=60,
        created_by=uuid.UUID(org["coach"]["user_id"]),
    )
    db.add(event)
    await db.commit()
    resp = await client.post(
        "/api/v1/rpe",
        json={
            "date": str(event.planned_start.date()),
            "exertion": 6,
            "performance": 6,
            "duration_min": 60,
            "event_id": str(event.id),
        },
        headers=org["athlete1"]["headers"],
    )
    assert resp.status_code == 201, resp.text

    await notifications_service.send_rpe_reminders(db, now)
    await db.commit()
    a1, a2 = uuid.UUID(org["athlete1"]["user_id"]), uuid.UUID(org["athlete2"]["user_id"])
    assert await _count(db, user_id=a1, type="rpe_reminder") == 0
    assert await _count(db, user_id=a2, type="rpe_reminder") == 1


async def test_wellness_reminder_by_org_timezone(client, db):
    org = await build_org(client)
    a1, a2 = uuid.UUID(org["athlete1"]["user_id"]), uuid.UUID(org["athlete2"]["user_id"])
    coach = uuid.UUID(org["coach"]["user_id"])
    today = datetime.now(UTC).date()
    resp = await client.post("/api/v1/wellness", json=GOOD_WELLNESS, headers=org["athlete1"]["headers"])
    assert resp.status_code == 201

    # Организация в UTC: в 07:30 ещё рано.
    early = datetime.combine(today, datetime.min.time(), UTC) + timedelta(hours=7, minutes=30)
    await notifications_service.send_wellness_reminders(db, early)
    await db.commit()
    assert await _count(db, user_id=a2, type="wellness_reminder") == 0

    at_nine = early + timedelta(hours=1, minutes=30)
    await notifications_service.send_wellness_reminders(db, at_nine)
    await notifications_service.send_wellness_reminders(db, at_nine + timedelta(minutes=15))
    await db.commit()
    assert await _count(db, user_id=a2, type="wellness_reminder") == 1
    # Уже заполнил: не напоминаем. Штабу опрос не нужен.
    assert await _count(db, user_id=a1, type="wellness_reminder") == 0
    assert await _count(db, user_id=coach, type="wellness_reminder") == 0


# ------------------------------------------------------------------ лента и доступ


async def test_mark_read_and_foreign_id_is_404(client):
    org = await build_org(client)
    await _create_event(client, org["coach"], org["team_id"], datetime.now(UTC) + timedelta(days=1))
    await _create_event(client, org["coach"], org["team_id"], datetime.now(UTC) + timedelta(days=2))
    assert await _unread(client, org["athlete1"]) == 2

    nid = (await _feed(client, org["athlete1"]))[0]["id"]
    # Чужое уведомление: 404, не 403.
    resp = await client.post(f"/api/v1/notifications/{nid}/read", headers=org["athlete2"]["headers"])
    assert resp.status_code == 404
    assert await _unread(client, org["athlete1"]) == 2

    resp = await client.post(f"/api/v1/notifications/{nid}/read", headers=org["athlete1"]["headers"])
    assert resp.status_code == 204
    assert await _unread(client, org["athlete1"]) == 1

    resp = await client.post("/api/v1/notifications/read-all", headers=org["athlete1"]["headers"])
    assert resp.status_code == 204
    assert await _unread(client, org["athlete1"]) == 0
    assert await _unread(client, org["athlete2"]) == 2


async def test_cursor_pagination(client):
    org = await build_org(client)
    for day in range(1, 6):
        await _create_event(client, org["coach"], org["team_id"], datetime.now(UTC) + timedelta(days=day))
    headers = org["athlete1"]["headers"]
    resp = await client.get("/api/v1/notifications?limit=2", headers=headers)
    page = resp.json()
    seen = [i["id"] for i in page["items"]]
    while page["next_cursor"]:
        resp = await client.get(
            f"/api/v1/notifications?limit=2&cursor={page['next_cursor']}", headers=headers
        )
        assert resp.status_code == 200
        page = resp.json()
        seen += [i["id"] for i in page["items"]]
    assert len(seen) == 5 == len(set(seen))

    resp = await client.get("/api/v1/notifications?cursor=мусор", headers=headers)
    assert resp.status_code == 422


async def test_leaving_team_hides_team_notifications(client, db):
    org = await build_org(client)
    resp = await client.post(
        "/api/v1/wellness", json=GOOD_WELLNESS | {"injury": True}, headers=org["athlete1"]["headers"]
    )
    assert resp.status_code == 201
    assert await _unread(client, org["coach"]) == 1

    coach_id = uuid.UUID(org["coach"]["user_id"])
    await db.execute(delete(TeamMembership).where(TeamMembership.user_id == coach_id))
    await db.commit()
    assert await _unread(client, org["coach"]) == 0
    assert await _feed(client, org["coach"]) == []


async def test_account_deletion_removes_notifications_about_athlete(client, db):
    org = await build_org(client)
    resp = await client.post(
        "/api/v1/wellness", json=GOOD_WELLNESS | {"injury": True}, headers=org["athlete1"]["headers"]
    )
    assert resp.status_code == 201
    athlete_id = uuid.UUID(org["athlete1"]["user_id"])
    assert await _count(db, athlete_id=athlete_id) == 3  # admin (head_coach) + coach + medic

    resp = await client.delete("/api/v1/account", headers=org["athlete1"]["headers"])
    assert resp.status_code in (200, 204), resp.text
    assert await _count(db, athlete_id=athlete_id) == 0
