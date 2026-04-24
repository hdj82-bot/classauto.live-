"""Add index on responses.question_id.

Revision ID: 0011
Revises: 0010
Create Date: 2026-04-23

변경 내용:
- responses.question_id 컬럼에 인덱스 추가
    question_id 기준 응답 조회(대시보드 정답률 집계 등)의 성능 개선용.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_responses_question_id", "responses", ["question_id"])


def downgrade() -> None:
    op.drop_index("ix_responses_question_id", table_name="responses")
