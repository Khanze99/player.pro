"""profile avatar height weight

Revision ID: 43cc15d7f2c0
Revises: 69f0c8d7ffb8
Create Date: 2026-09-07 19:17:39.499299

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '43cc15d7f2c0'
down_revision: str | None = '69f0c8d7ffb8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('athlete_profiles', sa.Column('height_cm', sa.SmallInteger(), nullable=True))
    op.add_column('athlete_profiles', sa.Column('weight_kg', sa.Numeric(precision=4, scale=1), nullable=True))
    op.add_column('users', sa.Column('avatar_path', sa.String(length=256), nullable=True))
    # CHECK-и autogenerate не переносит — добавляем руками (границы см. в модели)
    op.create_check_constraint(
        'ck_athlete_height_cm', 'athlete_profiles', 'height_cm BETWEEN 100 AND 250'
    )
    op.create_check_constraint(
        'ck_athlete_weight_kg', 'athlete_profiles', 'weight_kg BETWEEN 30 AND 250'
    )


def downgrade() -> None:
    op.drop_constraint('ck_athlete_weight_kg', 'athlete_profiles', type_='check')
    op.drop_constraint('ck_athlete_height_cm', 'athlete_profiles', type_='check')
    op.drop_column('users', 'avatar_path')
    op.drop_column('athlete_profiles', 'weight_kg')
    op.drop_column('athlete_profiles', 'height_cm')
