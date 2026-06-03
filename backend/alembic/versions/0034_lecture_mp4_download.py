"""강의 mp4 on-demand 다운로드 — lectures.mp4_url / mp4_status 추가.

Revision ID: 0034
Revises: 0033
Create Date: 2026-06-03

변경 내용 (docs/planning/08-cost-optimization.md):
- 본문은 클라이언트 슬라이드쇼(이미지+구간 음성)로 재생하므로 평소엔 mp4 를 굽지
  않는다. 다만 "mp4 다운로드" 약속(01-pricing-policy)은 **요청 시 on-demand ffmpeg
  합성**으로 처리한다. 그 산출물 URL·상태를 강의에 저장한다.
- ``lectures.mp4_url`` (VARCHAR(1024), NULL): 합성된 다운로드용 mp4 의 S3 URL.
  학생에게 노출되는 ``video_url`` 과 분리(다운로드는 교수자 편의 기능).
- ``lectures.mp4_status`` (VARCHAR(16), NULL): none|building|ready|failed.

다운그레이드: 두 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0034"
down_revision: Union[str, None] = "0033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lectures",
        sa.Column("mp4_url", sa.String(length=1024), nullable=True),
    )
    op.add_column(
        "lectures",
        sa.Column("mp4_status", sa.String(length=16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("lectures", "mp4_status")
    op.drop_column("lectures", "mp4_url")
