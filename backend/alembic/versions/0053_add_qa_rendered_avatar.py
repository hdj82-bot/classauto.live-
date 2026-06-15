"""Add lectures.qa_rendered_avatar_id / qa_rendered_voice_id.

Revision ID: 0053
Revises: 0052
Create Date: 2026-06-15

변경 내용 (Q&A 사전질문 클립의 '렌더 출처' 기록 — '다시 제작' 점검 정확도):
- ``lectures.qa_rendered_avatar_id`` (VARCHAR(255), nullable): 이 강의의 Q&A 사전질문
  클립을 **마지막으로 렌더할 때 쓴 아바타 id**.
- ``lectures.qa_rendered_voice_id`` (VARCHAR(255), nullable): 그때 쓴 음성 id.

목적: 강의에 적용한 현재 avatar_id/voice_id 와 위 값을 비교해, 아바타·음성이 바뀌었는데도
이미 렌더된(ready) 클립이 남아 있는 '낡은(stale)' 상태를 감지한다. 그래야 '다시 제작'
점검이 "변경 없음"으로 잘못 건너뛰지 않고, 새 아바타로 다시 렌더한다(2026-06-15 사용자 보고).

멱등: 컬럼 존재 여부를 확인해 있으면 add 를 건너뛴다.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0053"
down_revision: Union[str, None] = "0052"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("lectures", "qa_rendered_avatar_id"):
        op.add_column(
            "lectures",
            sa.Column("qa_rendered_avatar_id", sa.String(length=255), nullable=True),
        )
    if not _has_column("lectures", "qa_rendered_voice_id"):
        op.add_column(
            "lectures",
            sa.Column("qa_rendered_voice_id", sa.String(length=255), nullable=True),
        )


def downgrade() -> None:
    if _has_column("lectures", "qa_rendered_voice_id"):
        op.drop_column("lectures", "qa_rendered_voice_id")
    if _has_column("lectures", "qa_rendered_avatar_id"):
        op.drop_column("lectures", "qa_rendered_avatar_id")
