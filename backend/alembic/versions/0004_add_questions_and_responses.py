"""add questions and responses tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-26 00:04:00.000000

변경 내용:
- questions 테이블 생성 (assessmenttype, questiontype, difficulty enum 포함)
- responses 테이블 생성 (타임스탬프 검증 필드 포함)
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── enum 타입 생성 ────────────────────────────────────────────────────────
    op.execute("CREATE TYPE assessmenttype AS ENUM ('formative', 'summative')")
    op.execute("CREATE TYPE questiontype AS ENUM ('multiple_choice', 'short_answer')")
    op.execute("CREATE TYPE difficulty AS ENUM ('easy', 'medium', 'hard')")

    # ── questions 테이블 ──────────────────────────────────────────────────────
    op.create_table(
        "questions",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "lecture_id",
            sa.UUID(),
            sa.ForeignKey("lectures.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "assessment_type",
            sa.Enum("formative", "summative", name="assessmenttype", create_type=False),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "question_type",
            sa.Enum("multiple_choice", "short_answer", name="questiontype", create_type=False),
            nullable=False,
        ),
        sa.Column(
            "difficulty",
            sa.Enum("easy", "medium", "hard", name="difficulty", create_type=False),
            nullable=False,
            server_default="medium",
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("options", JSONB(), nullable=True),
        sa.Column("correct_answer", sa.Text(), nullable=True),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("timestamp_seconds", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # ── responses 테이블 ──────────────────────────────────────────────────────
    op.create_table(
        "responses",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "session_id",
            sa.UUID(),
            sa.ForeignKey("learning_sessions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "question_id",
            sa.UUID(),
            sa.ForeignKey("questions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("user_answer", sa.Text(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=True),
        sa.Column("video_timestamp_seconds", sa.Integer(), nullable=False),
        sa.Column("timestamp_valid", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "responded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("responses")
    op.drop_table("questions")
    op.execute("DROP TYPE IF EXISTS difficulty")
    op.execute("DROP TYPE IF EXISTS questiontype")
    op.execute("DROP TYPE IF EXISTS assessmenttype")
