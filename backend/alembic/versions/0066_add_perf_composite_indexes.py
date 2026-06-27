"""Add composite indexes for hot read paths (성능 — 대시보드/슬라이드쇼).

Revision ID: 0066
Revises: 0065
Create Date: 2026-06-27

변경 내용(순수 추가 — 동작 변화 없음, 읽기 지연만 감소):
- ``qa_logs (lecture_id, created_at)`` — 강의별 최신순 Q&A 조회(대시보드 요약 루프·
    Q&A 목록·내보내기)가 lecture_id 단일 인덱스로 필터 후 메모리 정렬하던 것을 제거.
- ``slide_embeddings (task_id, slide_number)`` — 슬라이드쇼/스튜디오의 task_id 필터 +
    slide_number 정렬/단일조회를 인덱스로 커버.

멱등: 인덱스 존재 시 생성 건너뜀. 다운그레이드: 두 인덱스 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0066"
down_revision: Union[str, None] = "0065"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_index(table: str, name: str) -> bool:
    insp = sa.inspect(op.get_bind())
    try:
        return any(ix["name"] == name for ix in insp.get_indexes(table))
    except Exception:  # noqa: BLE001 — 테이블이 없으면(레이스) 인덱스도 없다고 본다
        return False


def _has_table(table: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return table in insp.get_table_names()


def upgrade() -> None:
    if _has_table("qa_logs") and not _has_index("qa_logs", "ix_qa_logs_lecture_created"):
        op.create_index(
            "ix_qa_logs_lecture_created",
            "qa_logs",
            ["lecture_id", "created_at"],
            unique=False,
        )
    if _has_table("slide_embeddings") and not _has_index(
        "slide_embeddings", "ix_slide_embeddings_task_slide"
    ):
        op.create_index(
            "ix_slide_embeddings_task_slide",
            "slide_embeddings",
            ["task_id", "slide_number"],
            unique=False,
        )


def downgrade() -> None:
    if _has_index("slide_embeddings", "ix_slide_embeddings_task_slide"):
        op.drop_index("ix_slide_embeddings_task_slide", table_name="slide_embeddings")
    if _has_index("qa_logs", "ix_qa_logs_lecture_created"):
        op.drop_index("ix_qa_logs_lecture_created", table_name="qa_logs")
