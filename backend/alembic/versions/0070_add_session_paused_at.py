"""Add learning_sessions.paused_at — 완료 판정에서 일시정지 실시간 차감(안티치트).

Revision ID: 0070
Revises: 0069
Create Date: 2026-07-24

변경 내용(순수 추가 — nullable 컬럼):
- ``learning_sessions.paused_at`` (timestamptz, nullable). is_paused=True 인 동안만
  세팅되고, 재개 시 (now - paused_at) 을 total_pause_seconds 에 누적한 뒤 NULL 로
  되돌린다. 서버 완료 판정이 '시작 이후 벽시계'가 아니라 '활성(비-일시정지) 실시간'
  을 상한으로 쓰게 해, 영상 길이 절반을 실시간 방치 후 100% 보고하던 우회를 막는다.

멱등: 컬럼 존재 시 건너뜀. 다운그레이드: 컬럼 제거. 기존 행은 NULL(=진행 중 일시정지
없음)로 시작하며 total_pause_seconds 기본 0 과 정합.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0070"
down_revision: Union[str, None] = "0069"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return table in insp.get_table_names()


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    try:
        return any(c["name"] == column for c in insp.get_columns(table))
    except Exception:  # noqa: BLE001 — 테이블이 없으면 컬럼도 없다고 본다.
        return False


def upgrade() -> None:
    if _has_table("learning_sessions") and not _has_column(
        "learning_sessions", "paused_at"
    ):
        op.add_column(
            "learning_sessions",
            sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    if _has_column("learning_sessions", "paused_at"):
        op.drop_column("learning_sessions", "paused_at")
