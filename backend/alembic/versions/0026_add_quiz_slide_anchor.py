"""Add insert_after_slide_index to questions (interactive quiz slide anchor).

Revision ID: 0026
Revises: 0025
Create Date: 2026-05-27

변경 내용:
- ``questions.insert_after_slide_index`` (INTEGER, NULLABLE): 소크라테스식 대화로
    저작한 인터랙티브 퀴즈가 "슬라이드 N과 N+1 사이"에 삽입됨을 0-based index N 으로
    기록한다. 이 값이 NOT NULL 인 행 = 새 인터랙티브 형성평가 문제이며, 기존 일괄
    자동 생성(generate_questions)이 만든 문제는 NULL 이라 자연스럽게 분리된다.
    학생 재생 시 노출 트리거(``timestamp_seconds``)는 확정 시점에 VideoScript
    세그먼트 경계에서 파생해 함께 저장한다(없으면 NULL).

다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0026"
down_revision: Union[str, None] = "0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "questions",
        sa.Column("insert_after_slide_index", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("questions", "insert_after_slide_index")
