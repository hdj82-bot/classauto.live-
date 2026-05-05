"""Lecture/render cleanup: video_renders.cancelled_at + RenderStatus.CANCELLED.

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-05

변경 내용:
- ``video_renders.cancelled_at`` TIMESTAMP WITH TZ NULL 추가 — Lecture 삭제 시
  in-flight 상태 (PENDING/TTS_PROCESSING/RENDERING/UPLOADING) 인 render 를
  HeyGen 측에서 best-effort cancel 한 뒤 DB 상태를 ``CANCELLED`` 로 마킹할 때 기록.
- PostgreSQL ENUM ``renderstatus`` 에 ``CANCELLED`` 값 추가.
- 자체 색인은 추가하지 않는다 (status 컬럼에 이미 index 존재).

창 3 가 본 마이그레이션에 추가 색인을 요청한 사항은 없음.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── PostgreSQL ENUM 에 CANCELLED 값 추가 ────────────────────────────────
    # ALTER TYPE ... ADD VALUE 는 트랜잭션 내에서 commit 즉시 가시화되지 않을 수
    # 있으므로 autocommit_block 으로 감싼다.
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE renderstatus ADD VALUE IF NOT EXISTS 'CANCELLED'")

    # ── video_renders.cancelled_at ──────────────────────────────────────────
    op.add_column(
        "video_renders",
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("video_renders", "cancelled_at")
    # ENUM 값 제거는 PostgreSQL 이 직접 지원하지 않으므로 다운그레이드에서 생략.
    # 필요 시 ENUM 재생성 + USING 절을 통한 컬럼 cast 로 수동 처리.
