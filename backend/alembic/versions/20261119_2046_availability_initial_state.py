"""Start availability on the migration date; preserve legacy restrictions explicitly.

Revision ID: a166d0a82820
Revises: 848241ea1485
Create Date: 2026-11-19 20:46:33.082461

Legacy directions must be confirmed, never inferred from an author's current role:
  alembic -x 'availability_legacy_directions={"record-uuid":"medical"}' upgrade head
A failed preflight rolls back the transaction and prints technical IDs only.
"""

import json
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import sqlalchemy as sa

from alembic import context, op

revision: str = "a166d0a82820"
down_revision: str | None = "848241ea1485"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _candidates(connection):
    athletes = connection.execute(
        sa.text("""
        SELECT DISTINCT u.id, u.org_id, o.timezone FROM users u
        JOIN organizations o ON o.id = u.org_id
        JOIN team_memberships tm ON tm.user_id = u.id AND tm.team_role = 'athlete'
        JOIN teams t ON t.id = tm.team_id AND t.org_id = u.org_id
        WHERE u.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM availability_baselines b WHERE b.athlete_id = u.id)
    """)
    ).mappings()
    now = datetime.now(UTC)
    result = []
    for athlete in athletes:
        day = now.astimezone(ZoneInfo(athlete["timezone"] or "UTC")).date()
        records = list(
            connection.execute(
                sa.text("""
            SELECT * FROM availability_records WHERE athlete_id = :id ORDER BY date
        """),
                {"id": athlete["id"]},
            ).mappings()
        )
        current = next((row for row in reversed(records) if row["date"] <= day), None)
        required = [current] if current and current["status"] != "full" else []
        required += [row for row in records if row["date"] > day]
        result.append((athlete, day, required))
    return result


def upgrade() -> None:
    connection = op.get_bind()
    raw = context.get_x_argument(as_dictionary=True).get("availability_legacy_directions", "{}")
    mapping = json.loads(raw)
    if not isinstance(mapping, dict) or any(v not in {"medical", "coaching"} for v in mapping.values()):
        raise RuntimeError("availability_legacy_directions must map record UUIDs to medical/coaching")
    candidates = _candidates(connection)
    unclassified = sorted(
        str(row["id"]) for _, _, records in candidates for row in records if str(row["id"]) not in mapping
    )
    if unclassified:
        raise RuntimeError(
            "Confirm legacy availability directions for record IDs: " + ", ".join(unclassified)
        )
    for athlete, day, records in candidates:
        connection.execute(
            sa.text("""
            INSERT INTO availability_baselines (athlete_id, org_id, start_date, source, version)
            VALUES (:id, :org_id, :day, 'migration', :version)
        """),
            {"id": athlete["id"], "org_id": athlete["org_id"], "day": day, "version": len(records)},
        )
        for version, row in enumerate(records, 1):
            direction = mapping[str(row["id"])]
            connection.execute(
                sa.text("""
                INSERT INTO availability_changes
                (id, athlete_id, org_id, direction, date, status, actor_id, actor_role,
                 source, version, request_id, legacy_record_id)
                VALUES (:id, :athlete, :org, :direction, :day, :status, :actor, :role,
                        'legacy', :version, :request, :legacy)
            """),
                {
                    "id": uuid.uuid4(),
                    "athlete": athlete["id"],
                    "org": athlete["org_id"],
                    "direction": direction,
                    "day": max(day, row["date"]),
                    "status": row["status"],
                    "actor": row["set_by"],
                    "role": "medic" if direction == "medical" else "coach",
                    "version": version,
                    "request": uuid.uuid4(),
                    "legacy": row["id"],
                },
            )


def downgrade() -> None:
    connection = op.get_bind()
    if connection.scalar(sa.text("SELECT count(*) FROM availability_changes WHERE source = 'manual'")):
        raise RuntimeError(
            "Manual availability decisions exist; export/preserve them before a destructive rollback"
        )
    connection.execute(sa.text("DELETE FROM availability_changes WHERE source = 'legacy'"))
    connection.execute(sa.text("DELETE FROM availability_baselines WHERE source = 'migration'"))
