"""add videos and video_scripts tables

Revision ID: 0005
Revises: 0004
Create Date: 2026-03-26 00:05:00.000000

변경 내용:
- videostatus enum 생성 (draft / pending_review / rendering / done / archived)
- videos 테이블 생성
- video_scripts 테이블 생성 (segments JSONB, ai_segments JSONB)
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── enum 타입 ──────────────────────────────────────────────────────────────
    op.execute(
        "CREATE TYPE videostatus AS ENUM "
        "('draft', 'pending_review', 'rendering', 'done', 'archived')"
    )

    # ── videos 테이블 ──────────────────────────────────────────────────────────
    op.create_table(
        "videos",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "lecture_id",
            sa.UUID(),
            sa.ForeignKey("lectures.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "draft", "pending_review", "rendering", "done", "archived",
                name="videostatus",
                create_type=False,
            ),
            nullable=False,
            server_default="draft",
            index=True,
        ),
        sa.Column("heygen_video_id", sa.String(255), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("video_url", sa.String(1024), nullable=True),
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
    )

    # ── video_scripts 테이블 ───────────────────────────────────────────────────
    op.create_table(
        "video_scripts",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "video_id",
            sa.UUID(),
            sa.ForeignKey("videos.id", ondelete="CASCADE"),
            unique=True,
            nullable=False,
        ),
        # AI 최초 생성 원본 (불변)
        sa.Column("ai_segments", JSONB(), nullable=True),
        # 교수자가 편집 중인 세그먼트
        sa.Column("segments", JSONB(), nullable=False, server_default="'[]'::jsonb"),
        sa.Column(
            "approved_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "approved_by_id",
            sa.UUID(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("video_scripts")
    op.drop_table("videos")
    op.execute("DROP TYPE IF EXISTS videostatus")
