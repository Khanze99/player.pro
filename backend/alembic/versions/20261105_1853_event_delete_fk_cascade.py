"""event_delete_fk_cascade

Revision ID: 799e70ecd6ba
Revises: 763657f1771d
Create Date: 2026-11-05 18:53:28.195307

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '799e70ecd6ba'
down_revision: str | None = '763657f1771d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Баг: FK без ondelete на событие с хоть одной отметкой/RPE-оценкой кидал
    # IntegrityError на DELETE /events/{id} — 500 без обработки, для пользователя
    # «не удаляется» (app/models/event.py, app/models/rpe.py — комментарии там же).
    op.drop_constraint('attendances_event_id_fkey', 'attendances', type_='foreignkey')
    op.create_foreign_key(
        'attendances_event_id_fkey', 'attendances', 'events', ['event_id'], ['id'], ondelete='CASCADE'
    )
    op.drop_constraint('rpe_entries_event_id_fkey', 'rpe_entries', type_='foreignkey')
    op.create_foreign_key(
        'rpe_entries_event_id_fkey', 'rpe_entries', 'events', ['event_id'], ['id'], ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('rpe_entries_event_id_fkey', 'rpe_entries', type_='foreignkey')
    op.create_foreign_key('rpe_entries_event_id_fkey', 'rpe_entries', 'events', ['event_id'], ['id'])
    op.drop_constraint('attendances_event_id_fkey', 'attendances', type_='foreignkey')
    op.create_foreign_key('attendances_event_id_fkey', 'attendances', 'events', ['event_id'], ['id'])
