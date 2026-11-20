"""Exercise the data migration against real PostgreSQL, without mocking the database."""

import importlib.util
import json
import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import delete, func, select

from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.models.availability import AvailabilityBaseline, AvailabilityChange, AvailabilityRecord
from app.models.organization import Organization
from app.services.availability_service import current_status, summary_90d
from tests.test_authz import build_org
from tests.test_availability import submit


def _module():
    path = Path(__file__).parents[1] / "alembic/versions/20261119_2046_availability_initial_state.py"
    spec = importlib.util.spec_from_file_location("availability_data_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def _run(db, monkeypatch, direction_map=None, action="upgrade"):
    module = _module()
    monkeypatch.setattr(
        module.context,
        "get_x_argument",
        lambda **_: {
            "availability_legacy_directions": json.dumps(direction_map or {}),
        },
    )
    connection = await db.connection()

    def execute(sync_connection):
        with Operations.context(MigrationContext.configure(sync_connection)):
            getattr(module, action)()

    await connection.run_sync(execute)
    db.expire_all()


async def test_migration_starts_today_in_org_timezone_and_is_repeatable(client, db, monkeypatch):
    org = await build_org(client)
    athlete_id = uuid.UUID(org["athlete1"]["user_id"])
    baseline = await db.get(AvailabilityBaseline, athlete_id)
    organization = await db.get(Organization, baseline.org_id)
    organization.timezone = "Pacific/Kiritimati"
    await db.execute(delete(AvailabilityBaseline))
    await db.commit()
    await _run(db, monkeypatch)
    expected_day = datetime.now(UTC).astimezone(ZoneInfo("Pacific/Kiritimati")).date()
    baseline = await db.get(AvailabilityBaseline, athlete_id)
    assert baseline.start_date == expected_day
    assert (await summary_90d(db, athlete_id, expected_day)).tracked_days == 1
    await _run(db, monkeypatch)
    assert await db.scalar(select(func.count()).select_from(AvailabilityBaseline)) == 2
    await _run(db, monkeypatch, action="downgrade")
    assert await db.scalar(select(func.count()).select_from(AvailabilityBaseline)) == 0


async def test_migration_requires_explicit_legacy_direction_and_keeps_history(client, db, monkeypatch):
    org = await build_org(client)
    athlete_id = uuid.UUID(org["athlete1"]["user_id"])
    actor_id = uuid.UUID(org["medic"]["user_id"])
    await db.execute(delete(AvailabilityBaseline))
    first_id, current_id, future_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    for record_id, offset, status in [
        (first_id, -89, "full"),
        (current_id, -44, "modified"),
        (future_id, 2, "full"),
    ]:
        db.add(
            AvailabilityRecord(
                id=record_id,
                athlete_id=athlete_id,
                set_by=actor_id,
                date=date.today() + timedelta(days=offset),
                status=status,
            )
        )
    await db.commit()
    before = await summary_90d(db, athlete_id, date.today() - timedelta(days=1))
    with pytest.raises(RuntimeError, match="Confirm legacy"):
        await _run(db, monkeypatch)
    assert await db.scalar(select(func.count()).select_from(AvailabilityBaseline)) == 0
    mapping = {str(current_id): "medical", str(future_id): "medical"}
    await _run(db, monkeypatch, mapping)
    assert await current_status(db, athlete_id, date.today()) == "modified"
    assert await current_status(db, athlete_id, date.today() + timedelta(days=2)) == "full"
    assert await summary_90d(db, athlete_id, date.today() - timedelta(days=1)) == before
    assert await db.scalar(select(func.count()).select_from(AvailabilityRecord)) == 3
    await _run(db, monkeypatch, mapping)
    assert await db.scalar(select(func.count()).select_from(AvailabilityChange)) == 2


async def test_data_downgrade_refuses_to_erase_new_decisions(client, db, monkeypatch):
    org = await build_org(client)
    response = await submit(client, org, "medic", "medical", "modified")
    assert response.status_code == 201
    with pytest.raises(RuntimeError, match="Manual availability decisions exist"):
        await _run(db, monkeypatch, action="downgrade")
    assert await db.scalar(select(func.count()).select_from(AvailabilityChange)) == 1
