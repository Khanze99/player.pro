"""wellness weight

Revision ID: a568787dcabf
Revises: 6a916580df0f
Create Date: 2026-10-23 18:07:12.694613

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a568787dcabf'
down_revision: str | None = '6a916580df0f'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('wellness_entries', sa.Column('weight_kg', sa.Numeric(precision=4, scale=1), nullable=True))
    # CHECK autogenerate не переносит — добавляем руками (границы см. в модели,
    # те же, что ck_athlete_weight_kg)
    op.create_check_constraint(
        'ck_wellness_weight_kg', 'wellness_entries', 'weight_kg BETWEEN 30 AND 250'
    )


def downgrade() -> None:
    op.drop_constraint('ck_wellness_weight_kg', 'wellness_entries', type_='check')
    op.drop_column('wellness_entries', 'weight_kg')
