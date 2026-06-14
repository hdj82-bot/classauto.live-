"""Add subtitle_cues to video_renders (precise subtitle sync).

Revision ID: 0047
Revises: 0046
Create Date: 2026-06-14

변경 내용:
- ``video_renders.subtitle_cues`` (JSONB, nullable): 자막 정밀 싱크용 cue.
    Forced Alignment(ElevenLabs)로 산출한 슬라이드 음성의 실제 발성 시각.
    형식: [{"start": float, "end": float, "text": "문장"}, ...] — 시각은 해당
    슬라이드 음성(audio_url)의 자체 타임라인(0-base, 속도 후처리 반영).
    NULL = 정렬 미수행/실패 → 플레이어가 글자수 균등분배로 폴백.

다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0047"
down_revision: Union[str, None] = "0046"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "video_renders",
        sa.Column("subtitle_cues", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("video_renders", "subtitle_cues")
