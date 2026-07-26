"""video_renders 운영자 triage + 실패 목록 핫패스 색인 (스펙 14 §C).

Revision ID: 0075
Revises: 0074
Create Date: 2026-07-26

이슈 인박스가 실패 렌더를 열어 보고 "확인했다"는 표시를 남기기 위한 최소 컬럼.

- ``video_renders.triaged_at``  TIMESTAMPTZ NULL — 운영자가 확인한 시각
- ``video_renders.triage_note`` TEXT NULL        — 운영자 메모(선택)
- ``ix_video_renders_status_created`` (status, created_at DESC) — 실패 목록 핫패스

**``resolved`` 컬럼을 따로 두지 않는다.** 상태는 3분기로 파생한다 —
``triaged_at IS NULL`` → 미확인 / ``triaged_at`` 이후 같은 강의의 성공 렌더 존재 → 해결 /
그 외 → 확인함. 컬럼을 늘리는 대신 파생으로 두는 편이 상태 동기화 버그를 줄인다(§C).

색인이 ``(status, created_at DESC)`` 인 이유: 인박스의 유일한 핫 쿼리가
"status=failed 를 최신순으로"다. ``status`` 단독 색인은 이미 있지만(모델 ``index=True``)
정렬이 남아 실패 행이 늘수록 sort 비용이 붙는다.

멱등: 컬럼·색인 존재 시 각각 건너뜀.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0075"
down_revision: Union[str, None] = "0074"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "video_renders"
_COL_TRIAGED_AT = "triaged_at"
_COL_TRIAGE_NOTE = "triage_note"
_INDEX = "ix_video_renders_status_created"


def _has_table(table: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return table in insp.get_table_names()


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    try:
        return any(c["name"] == column for c in insp.get_columns(table))
    except Exception:  # noqa: BLE001 — 테이블이 없으면 컬럼도 없다고 본다.
        return False


def _has_index(table: str, name: str) -> bool:
    insp = sa.inspect(op.get_bind())
    try:
        return any(ix["name"] == name for ix in insp.get_indexes(table))
    except Exception:  # noqa: BLE001
        return False


def upgrade() -> None:
    if not _has_table(_TABLE):
        return

    if not _has_column(_TABLE, _COL_TRIAGED_AT):
        op.add_column(
            _TABLE, sa.Column(_COL_TRIAGED_AT, sa.DateTime(timezone=True), nullable=True)
        )

    if not _has_column(_TABLE, _COL_TRIAGE_NOTE):
        op.add_column(_TABLE, sa.Column(_COL_TRIAGE_NOTE, sa.Text(), nullable=True))

    if not _has_index(_TABLE, _INDEX):
        # created_at DESC — 목록이 항상 최신순이라 정렬까지 색인이 받아 준다.
        op.create_index(_INDEX, _TABLE, ["status", sa.text("created_at DESC")])


def downgrade() -> None:
    if _has_index(_TABLE, _INDEX):
        op.drop_index(_INDEX, table_name=_TABLE)
    if _has_column(_TABLE, _COL_TRIAGE_NOTE):
        op.drop_column(_TABLE, _COL_TRIAGE_NOTE)
    if _has_column(_TABLE, _COL_TRIAGED_AT):
        op.drop_column(_TABLE, _COL_TRIAGED_AT)
