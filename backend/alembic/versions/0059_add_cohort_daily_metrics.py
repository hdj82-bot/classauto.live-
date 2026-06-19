"""Add cohort_daily_metrics (성취율 추이 스냅샷 — 스펙 11 §C / 10번 G7).

Revision ID: 0059
Revises: 0058
Create Date: 2026-06-19

변경 내용:
- ``cohort_daily_metrics`` — 강의×일자별 누적 지표 1행을 저장하는 시계열
    스냅샷. 일배치(`app.tasks.cohort.snapshot_cohort_daily_metrics`)가 매일
    upsert 한다. (lecture_id FK→lectures CASCADE, metric_date,
    completion_rate/attendance_rate/avg_accuracy(0~100), qa_count,
    active_learners, created_at/updated_at, unique(lecture_id, metric_date)).

멱등: 테이블 존재 여부를 확인해 있으면 생성을 건너뛴다.
다운그레이드: 테이블 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0059"
down_revision: Union[str, None] = "0058"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return table in insp.get_table_names()


def upgrade() -> None:
    if _has_table("cohort_daily_metrics"):
        return
    op.create_table(
        "cohort_daily_metrics",
        sa.Column("id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("lecture_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("metric_date", sa.Date(), nullable=False),
        sa.Column("completion_rate", sa.Float(), server_default="0", nullable=False),
        sa.Column("attendance_rate", sa.Float(), server_default="0", nullable=False),
        sa.Column("avg_accuracy", sa.Float(), server_default="0", nullable=False),
        sa.Column("qa_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("active_learners", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["lecture_id"], ["lectures.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "lecture_id", "metric_date", name="uq_cohort_metric_lecture_date"
        ),
    )
    op.create_index(
        op.f("ix_cohort_daily_metrics_lecture_id"),
        "cohort_daily_metrics",
        ["lecture_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_cohort_daily_metrics_metric_date"),
        "cohort_daily_metrics",
        ["metric_date"],
        unique=False,
    )


def downgrade() -> None:
    if not _has_table("cohort_daily_metrics"):
        return
    op.drop_index(
        op.f("ix_cohort_daily_metrics_metric_date"), table_name="cohort_daily_metrics"
    )
    op.drop_index(
        op.f("ix_cohort_daily_metrics_lecture_id"), table_name="cohort_daily_metrics"
    )
    op.drop_table("cohort_daily_metrics")
