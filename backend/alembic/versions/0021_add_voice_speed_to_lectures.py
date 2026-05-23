"""Add voice_speed to lectures.

Revision ID: 0021
Revises: 0020
Create Date: 2026-05-23

변경 내용:
- ``lectures.voice_speed`` (DOUBLE PRECISION, NOT NULL, default 1.0): 영상 발화
    속도 배율. 1.0 이 기본. render.py 가 TTS 합성 시 ElevenLabs voice_settings.speed
    (유효범위 0.7~1.2 로 클램프) / Google speaking_rate 로 전달한다.

다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0021"
down_revision: Union[str, None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lectures",
        sa.Column(
            "voice_speed",
            sa.Float(),
            nullable=False,
            server_default="1.0",
        ),
    )


def downgrade() -> None:
    op.drop_column("lectures", "voice_speed")
