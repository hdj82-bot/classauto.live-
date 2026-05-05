"""DB indexes & stats hot-path: questions/responses/render_cost_logs.

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-05

변경 내용 (T5 — 핵심 인덱스 추가):
- ``ix_questions_lecture_assessment`` (lecture_id, assessment_type)
  · ``get_questions_for_session`` 의 핫 패스. 단일 컬럼 인덱스만으론 강의별
    formative/summative 분리가 인덱스 only 로 풀리지 않는다.
- ``uq_responses_session_question`` UNIQUE (session_id, question_id)
  · 같은 세션에서 동일 문제 중복 응답 방지. 응답 결과 조회 시 인덱스 only 스캔.
- ``ix_render_cost_logs_created_at`` (created_at)
  · ``admin.get_costs`` 가 최근 12개월 GROUP BY ``EXTRACT(year/month FROM created_at)``
    + ORDER BY DESC. created_at 인덱스가 없으면 풀 스캔이 강제된다.

회피 (이미 존재):
- ``learning_sessions(user_id, lecture_id, status)`` — 0012 가 추가
  (``ix_learning_sessions_user_lecture_status``). 본 마이그레이션에서 추가하지 않음.
- ``responses.question_id`` 단일 인덱스 — 0011 가 추가. 추가하지 않음.

PostgreSQL 한정:
- ``UniqueConstraint`` 가 적용되는 환경에서 같은 (session_id, question_id) 가
  이미 중복 존재한다면 마이그레이션이 실패한다. 운영 DB 에 중복이 있을 가능성이
  있으면 미리 정리 쿼리로 제거 후 적용해야 한다.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── questions(lecture_id, assessment_type) ────────────────────────────
    op.create_index(
        "ix_questions_lecture_assessment",
        "questions",
        ["lecture_id", "assessment_type"],
    )

    # ── responses(session_id, question_id) UNIQUE ─────────────────────────
    # 같은 세션에서 동일 문제에 대한 중복 응답 row 를 DB 레벨에서 차단.
    op.create_unique_constraint(
        "uq_responses_session_question",
        "responses",
        ["session_id", "question_id"],
    )

    # ── render_cost_logs(created_at) ──────────────────────────────────────
    op.create_index(
        "ix_render_cost_logs_created_at",
        "render_cost_logs",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_render_cost_logs_created_at",
        table_name="render_cost_logs",
    )
    op.drop_constraint(
        "uq_responses_session_question",
        "responses",
        type_="unique",
    )
    op.drop_index(
        "ix_questions_lecture_assessment",
        table_name="questions",
    )
