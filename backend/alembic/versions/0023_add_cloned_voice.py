"""Add cloned-voice fields to users.

Revision ID: 0023
Revises: 0022
Create Date: 2026-05-26

변경 내용 (교수자 본인 음성 클로닝 — ElevenLabs Instant Voice Cloning):
- ``users.cloned_voice_id`` (VARCHAR(255), nullable): mp3 등 음성 샘플로 만든
    ElevenLabs cloned voice_id. 채워지면 GET /api/voices 계정 보이스로 자동
    노출돼 음성 패널·미리보기·강의 렌더에 본인 목소리로 쓸 수 있다.
- ``users.cloned_voice_name`` (VARCHAR(100), nullable): 표시 이름.
- ``users.cloned_voice_sample_url`` (VARCHAR(1024), nullable): 업로드한 원본
    음성 샘플의 영구 S3 https URL(참조·재생성용).

다운그레이드: 3개 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0023"
down_revision: Union[str, None] = "0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("cloned_voice_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("cloned_voice_name", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("cloned_voice_sample_url", sa.String(length=1024), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "cloned_voice_sample_url")
    op.drop_column("users", "cloned_voice_name")
    op.drop_column("users", "cloned_voice_id")
