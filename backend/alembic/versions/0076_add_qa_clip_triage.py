"""qa_answer_cache.triaged_at + triage_note — Q&A 클립 실패를 이슈 인박스에 합류 (스펙 14 §C-2).

Revision ID: 0076
Revises: 0075
Create Date: 2026-07-26

C-1 은 `video_renders`(본문 렌더)만 본다. 그런데 교수자가 8월에 **실제로 겪을** 실패는
본인 얼굴 아바타 온보딩이고, 그건 Q&A 답변 클립(`qa_answer_cache`)에서 난다
(프로토타입 08 e2: `VisionStory: source portrait rejected — face not detected`).
그 실패가 인박스에 안 뜨면 "버그를 눈으로 확인"이라는 §C 의 목적이 반쪽이 된다.

**테이블이 달라도 운영자가 보는 화면은 하나여야 한다.** 그래서 목록을 합치는데,
triage 대상이 두 테이블로 갈리므로 이쪽에도 같은 컬럼을 둔다.

- ``qa_answer_cache.triaged_at``  TIMESTAMPTZ NULL — 운영자가 확인한 시각
- ``qa_answer_cache.triage_note`` TEXT NULL        — 운영자 메모(선택)
- ``ix_qa_answer_cache_status_created`` (status, created_at DESC) — 실패 목록 핫패스

`resolved` 컬럼은 C-1 과 동일하게 두지 않는다. 상태는 파생 3분기다 —
`triaged_at IS NULL` → 미확인 / 이후 같은 `cluster_key` 의 ready 행 존재 → 해결 /
그 외 → 확인함. 재렌더가 성공하면 아무도 손대지 않아도 해결로 넘어간다.

**triage 를 별도 테이블로 뽑지 않은 이유**: C-1 과 대칭이고 조인이 늘지 않는다(스펙 §C-2).

멱등: 컬럼/인덱스 존재 시 건너뜀. 다운그레이드는 역순.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0076"
down_revision: Union[str, None] = "0075"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ⚠️ 테이블명은 **단수** `qa_answer_cache` 다(모델 클래스는 QAAnswerCache).
# 스펙 문서가 `qa_answer_caches` 로 적은 곳이 있으나 실제 __tablename__ 은 단수다.
_TABLE = "qa_answer_cache"
_INDEX = "ix_qa_answer_cache_status_created"


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

    if not _has_column(_TABLE, "triaged_at"):
        op.add_column(
            _TABLE, sa.Column("triaged_at", sa.DateTime(timezone=True), nullable=True)
        )
    if not _has_column(_TABLE, "triage_note"):
        op.add_column(_TABLE, sa.Column("triage_note", sa.Text(), nullable=True))

    if not _has_index(_TABLE, _INDEX):
        op.create_index(
            _INDEX,
            _TABLE,
            ["status", sa.text("created_at DESC")],
        )


def downgrade() -> None:
    if _has_index(_TABLE, _INDEX):
        op.drop_index(_INDEX, table_name=_TABLE)
    if _has_column(_TABLE, "triage_note"):
        op.drop_column(_TABLE, "triage_note")
    if _has_column(_TABLE, "triaged_at"):
        op.drop_column(_TABLE, "triaged_at")
