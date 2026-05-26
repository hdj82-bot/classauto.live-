"""Add reveal_answer to questions (interstitial quiz answer-reveal mode).

Revision ID: 0027
Revises: 0026
Create Date: 2026-05-27

변경 내용:
- ``questions.reveal_answer`` (BOOLEAN, NOT NULL, default false): 인터랙티브 퀴즈를
    학생이 영상에서 푼 직후 정답·해설을 영상에서 공개할지 여부. true 면 제출 직후
    정답·해설을 보여주고, false 면 정/오답·정답을 숨긴 채 응답만 기록한다(완전 비공개
    → 교수자가 정·오답 현황을 분석 대시보드에서 보고 대면 수업에 활용). 기존 행과
    일괄 자동 생성 문제는 false(노출 안 함)로 백필.

다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0027"
down_revision: Union[str, None] = "0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "questions",
        sa.Column(
            "reveal_answer",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("questions", "reveal_answer")
