"""Add voice/subtitle language fields to lectures and subtitle_segments to scripts.

Revision ID: 0020
Revises: 0019
Create Date: 2026-05-22

변경 내용:
- ``lectures.voice_lang`` (VARCHAR(10), NOT NULL, default 'ko'): 영상 음성(TTS)
    언어. ISO 639-1 (ko/zh/en/ja/de/fr/ru).
- ``lectures.subtitle_lang`` (VARCHAR(10), nullable): 영상 자막 언어.
    NULL = 음성과 동일(별도 번역 없음).
- ``lectures.voice_id`` (VARCHAR(255), nullable): 교수자가 선택한 ElevenLabs
    보이스 ID. NULL = voice_gender 기준 기본 보이스.
- ``video_scripts.subtitle_segments`` (JSONB, nullable): 자막 세그먼트
    (자막 언어가 음성과 다를 때만 채워짐). [{"slide_index", "text"}, ...].

다운그레이드: 4개 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lectures",
        sa.Column(
            "voice_lang",
            sa.String(length=10),
            nullable=False,
            server_default="ko",
        ),
    )
    op.add_column(
        "lectures",
        sa.Column("subtitle_lang", sa.String(length=10), nullable=True),
    )
    op.add_column(
        "lectures",
        sa.Column("voice_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "video_scripts",
        sa.Column("subtitle_segments", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("video_scripts", "subtitle_segments")
    op.drop_column("lectures", "voice_id")
    op.drop_column("lectures", "subtitle_lang")
    op.drop_column("lectures", "voice_lang")
