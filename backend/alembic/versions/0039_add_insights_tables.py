"""Add insights tables (watch_events, slide_engagement, class_briefings).

Revision ID: 0039
Revises: 0038
Create Date: 2026-06-05

변경 내용 (docs/planning/10-research-data-model.md G1·G8, 11-analytics-dashboard.md §F·§H):
- ``watch_events`` (G1, §3.1): 세그먼트 단위 재생 이벤트 append-only 로그.
    슬라이드쇼 플레이어가 배치 전송 → 재생 히트맵·이탈 분석·완주(RQ1/RQ3 1차 자료).
- ``slide_engagement`` (G1, §3.2): watch_events 롤업(재생 히트맵을 싸게 그림).
- ``class_briefings`` (G8, §3.10): AI 대면 수업 브리핑(요약·권고·학급/개별 신호)
    JSONB 저장. source_window 로 재현성, model 로 생성 모델 버전 기록.

연구 스키마(09 §3)는 소급 수집 불가 — 컬럼명을 데이터 모델 문서와 1:1로 맞췄다.
``watcheventtype`` enum 은 ORM(WatchEventType)과 동일 값.

다운그레이드: 3개 테이블 + enum drop.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0039"
down_revision: Union[str, None] = "0038"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# SAEnum(WatchEventType) 와 동일한 값. create_type=False 로 두고 명시적으로 create
# 하여 다운그레이드에서 drop 까지 대칭으로 관리한다.
_WATCH_EVENT_TYPE = postgresql.ENUM(
    "play",
    "pause",
    "seek",
    "segment_enter",
    "segment_complete",
    "rewatch",
    "speed_change",
    "ended",
    name="watcheventtype",
    create_type=False,
)


def upgrade() -> None:
    _WATCH_EVENT_TYPE.create(op.get_bind(), checkfirst=True)

    # ── watch_events (G1, §3.1) ────────────────────────────────────────────
    op.create_table(
        "watch_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("session_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("lecture_id", sa.UUID(), nullable=False),
        sa.Column("event_type", _WATCH_EVENT_TYPE, nullable=False),
        sa.Column("slide_index", sa.Integer(), nullable=True),
        sa.Column("position_seconds", sa.Float(), nullable=False, server_default="0"),
        sa.Column("from_position_seconds", sa.Float(), nullable=True),
        sa.Column("playback_rate", sa.Float(), nullable=True),
        sa.Column("client_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "server_ts", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["learning_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lecture_id"], ["lectures.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_watch_events_session_id"), "watch_events", ["session_id"], unique=False)
    op.create_index(op.f("ix_watch_events_user_id"), "watch_events", ["user_id"], unique=False)
    op.create_index(op.f("ix_watch_events_lecture_id"), "watch_events", ["lecture_id"], unique=False)
    op.create_index("ix_watch_events_session_ts", "watch_events", ["session_id", "server_ts"], unique=False)
    op.create_index("ix_watch_events_lecture_slide", "watch_events", ["lecture_id", "slide_index"], unique=False)

    # ── slide_engagement (G1, §3.2) ────────────────────────────────────────
    op.create_table(
        "slide_engagement",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("lecture_id", sa.UUID(), nullable=False),
        sa.Column("slide_index", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.UUID(), nullable=True),
        sa.Column("dwell_seconds", sa.Float(), nullable=False, server_default="0"),
        sa.Column("rewatch_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("drop_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("avg_completion_pct", sa.Float(), nullable=False, server_default="0"),
        sa.Column(
            "rolled_up_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.ForeignKeyConstraint(["lecture_id"], ["lectures.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["learning_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "lecture_id", "slide_index", "session_id", name="uq_slide_engagement_scope"
        ),
    )
    op.create_index(op.f("ix_slide_engagement_lecture_id"), "slide_engagement", ["lecture_id"], unique=False)

    # ── class_briefings (G8, §3.10) ────────────────────────────────────────
    op.create_table(
        "class_briefings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("lecture_id", sa.UUID(), nullable=False),
        sa.Column("course_id", sa.UUID(), nullable=True),
        sa.Column("week_no", sa.Integer(), nullable=True),
        sa.Column(
            "generated_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("model", sa.String(length=40), nullable=False),
        sa.Column("source_window", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["lecture_id"], ["lectures.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_class_briefings_lecture_id"), "class_briefings", ["lecture_id"], unique=False)
    op.create_index(
        "ix_class_briefings_lecture_generated", "class_briefings", ["lecture_id", "generated_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_class_briefings_lecture_generated", table_name="class_briefings")
    op.drop_index(op.f("ix_class_briefings_lecture_id"), table_name="class_briefings")
    op.drop_table("class_briefings")

    op.drop_index(op.f("ix_slide_engagement_lecture_id"), table_name="slide_engagement")
    op.drop_table("slide_engagement")

    op.drop_index("ix_watch_events_lecture_slide", table_name="watch_events")
    op.drop_index("ix_watch_events_session_ts", table_name="watch_events")
    op.drop_index(op.f("ix_watch_events_lecture_id"), table_name="watch_events")
    op.drop_index(op.f("ix_watch_events_user_id"), table_name="watch_events")
    op.drop_index(op.f("ix_watch_events_session_id"), table_name="watch_events")
    op.drop_table("watch_events")

    _WATCH_EVENT_TYPE.drop(op.get_bind(), checkfirst=True)
