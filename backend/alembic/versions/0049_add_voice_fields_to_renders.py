"""Add voice_id/voice_speed to video_renders (다시 제작 음성 변경 감지).

Revision ID: 0049
Revises: 0048
Create Date: 2026-06-14

변경 내용:
- ``video_renders.voice_id`` (VARCHAR(255), nullable): 이 음원을 합성할 때 쓴 보이스.
- ``video_renders.voice_speed`` (Float, nullable): 그때의 발화 속도 배율.

목적: "다시 제작"(rerender) 이 발화 텍스트뿐 아니라 **음성/속도 변경**도 감지해
해당 슬라이드만 재합성하도록 한다(종전엔 텍스트만 비교해 음성/속도 변경이 무시됨).
NULL = 구버전 렌더 → 텍스트 기준으로만 비교(무회귀).

멱등: 컬럼 존재 여부를 확인해 있으면 add 를 건너뛴다.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0049"
down_revision: Union[str, None] = "0048"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("video_renders", "voice_id"):
        op.add_column(
            "video_renders", sa.Column("voice_id", sa.String(length=255), nullable=True)
        )
    if not _has_column("video_renders", "voice_speed"):
        op.add_column(
            "video_renders", sa.Column("voice_speed", sa.Float(), nullable=True)
        )


def downgrade() -> None:
    if _has_column("video_renders", "voice_speed"):
        op.drop_column("video_renders", "voice_speed")
    if _has_column("video_renders", "voice_id"):
        op.drop_column("video_renders", "voice_id")
