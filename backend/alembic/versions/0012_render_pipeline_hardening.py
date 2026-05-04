"""Render pipeline hardening: webhook_event_log + idempotency / hot-path indexes.

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-04

변경 내용:
- ``webhook_event_log`` 테이블 신규 — HeyGen 등 외부 웹훅 idempotent 처리용.
  ``(heygen_job_id, event_type)`` UNIQUE 로 중복 이벤트 차단.
  (창2의 webhook idempotency 작업과 공유되는 의존성)
- ``render_cost_logs`` 에 ``(video_render_id, operation)`` UNIQUE 인덱스 추가 —
  Celery 재시도 시 ``cost_log.record_once`` 가 O(1) 로 중복 검사하도록 백킹.
- ``learning_sessions`` 에 ``(user_id, lecture_id, status)`` 복합 인덱스 추가 —
  ``get_or_create_session`` 의 핫 패스 쿼리 최적화.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── webhook_event_log ────────────────────────────────────────────────
    # 외부 웹훅(HeyGen 등) 중복 수신 시 idempotent 처리를 위한 로그 테이블.
    # (heygen_job_id, event_type) UNIQUE 가 INSERT 충돌로 중복 처리를 차단.
    op.create_table(
        "webhook_event_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("provider", sa.String(50), nullable=False, server_default="heygen"),
        sa.Column("heygen_job_id", sa.String(255), nullable=False, index=True),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("payload_hash", sa.String(64)),
        sa.Column("status", sa.String(50), nullable=False, server_default="received"),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint(
            "heygen_job_id", "event_type", name="uq_webhook_event_log_job_event"
        ),
    )
    op.create_index(
        "ix_webhook_event_log_received_at",
        "webhook_event_log",
        ["received_at"],
    )

    # ── render_cost_logs idempotency 인덱스 ──────────────────────────────
    # cost_log.record_once 가 (video_render_id, operation) 으로 존재 여부 조회.
    # UNIQUE 제약은 Celery 재시도 race condition 까지 방어 (DB 레벨).
    op.create_index(
        "uq_render_cost_logs_render_operation",
        "render_cost_logs",
        ["video_render_id", "operation"],
        unique=True,
    )

    # ── learning_sessions 복합 인덱스 ────────────────────────────────────
    # get_or_create_session 의 (user_id, lecture_id, status) 핫 패스 — 매 평가 호출마다 실행.
    op.create_index(
        "ix_learning_sessions_user_lecture_status",
        "learning_sessions",
        ["user_id", "lecture_id", "status"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_learning_sessions_user_lecture_status",
        table_name="learning_sessions",
    )
    op.drop_index(
        "uq_render_cost_logs_render_operation",
        table_name="render_cost_logs",
    )
    op.drop_index(
        "ix_webhook_event_log_received_at",
        table_name="webhook_event_log",
    )
    op.drop_table("webhook_event_log")
