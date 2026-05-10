"""통합 마이그레이션: pipeline + NestJS 모델 추가

Revision ID: 0006
Revises: 0005
Create Date: 2026-03-31 00:00:00.000000

변경 내용:
- pgvector 확장 생성 (IF NOT EXISTS)
- slide_embeddings 테이블 (pgvector)
- video_renders 테이블 (HeyGen 렌더링 추적)
- render_cost_logs 테이블 (렌더링 비용)
- qa_logs 테이블 (RAG Q&A 로그)
- platform_cost_logs 테이블 (플랫폼 비용)
- subscriptions 테이블 (구독 플랜)
- script_translations 테이블 (번역)
- assessment_results 테이블 (평가 결과)
- learning_sessions 테이블 확장 (집중도 + 상태머신 필드)
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # pgvector 확장
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ── SessionStatus enum 확장 ──────────────────────────────
    op.execute("ALTER TYPE sessionstatus ADD VALUE IF NOT EXISTS 'not_started'")
    op.execute("ALTER TYPE sessionstatus ADD VALUE IF NOT EXISTS 'qa_mode'")
    op.execute("ALTER TYPE sessionstatus ADD VALUE IF NOT EXISTS 'assessment'")

    # ── learning_sessions 테이블 확장 ────────────────────────
    op.add_column("learning_sessions", sa.Column("warning_level", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("learning_sessions", sa.Column("no_response_cnt", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("learning_sessions", sa.Column("is_paused", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("learning_sessions", sa.Column("is_network_unstable", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("learning_sessions", sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("learning_sessions", sa.Column("total_pause_seconds", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("learning_sessions", sa.Column("pause_reason", sa.String(100), nullable=True))
    op.add_column("learning_sessions", sa.Column("watched_sec", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("learning_sessions", sa.Column("total_sec", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("learning_sessions", sa.Column("progress_pct", sa.Float(), nullable=False, server_default="0"))
    op.add_column("learning_sessions", sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("learning_sessions", sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.add_column("learning_sessions", sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))

    # started_at을 nullable로 변경
    op.alter_column("learning_sessions", "started_at", nullable=True, server_default=None)

    # ── slide_embeddings ─────────────────────────────────────
    # vector 컬럼은 op.create_table 에서 표현 불가 (sa.Column 안에 sa.Column
    # 들어간 원본 코드는 SQLAlchemy 가 거부). 테이블 먼저 만들고 ALTER TABLE
    # 로 pgvector 네이티브 타입 직접 추가.
    op.create_table(
        "slide_embeddings",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("task_id", sa.String(64), nullable=False, index=True),
        sa.Column("slide_number", sa.Integer(), nullable=False),
        sa.Column("text_content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.execute("ALTER TABLE slide_embeddings ADD COLUMN embedding vector(1536) NOT NULL;")

    # ── RenderStatus enum + video_renders 테이블 (raw SQL) ──────────────────
    # SQLAlchemy 2.x sa.Enum 자동 CREATE TYPE 함정 우회. enum 미리 안전 생성 후
    # 테이블도 raw SQL 로 만들어 SQLAlchemy 자동 동작 완전 우회.
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE renderstatus AS ENUM
                ('PENDING', 'TTS_PROCESSING', 'RENDERING', 'UPLOADING', 'READY', 'FAILED');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS video_renders (
            id UUID PRIMARY KEY,
            lecture_id UUID NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
            instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
            heygen_job_id VARCHAR(255) UNIQUE,
            avatar_id VARCHAR(255) NOT NULL,
            tts_provider VARCHAR(50) NOT NULL DEFAULT 'elevenlabs',
            audio_url VARCHAR(1024),
            script_text TEXT,
            slide_number INTEGER,
            status renderstatus NOT NULL DEFAULT 'PENDING',
            heygen_video_url VARCHAR(1024),
            s3_video_url VARCHAR(1024),
            error_message TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            completed_at TIMESTAMPTZ
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_video_renders_lecture_id ON video_renders (lecture_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_video_renders_instructor_id ON video_renders (instructor_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_video_renders_heygen_job_id ON video_renders (heygen_job_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_video_renders_status ON video_renders (status);")

    # ── render_cost_logs ─────────────────────────────────────
    op.create_table(
        "render_cost_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("video_render_id", UUID(as_uuid=True), sa.ForeignKey("video_renders.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("service", sa.String(50), nullable=False),
        sa.Column("operation", sa.String(100), nullable=False),
        sa.Column("cost_usd", sa.Float(), server_default="0"),
        sa.Column("duration_seconds", sa.Float()),
        sa.Column("metadata_json", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── qa_logs ──────────────────────────────────────────────
    op.create_table(
        "qa_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("learning_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("lecture_id", UUID(as_uuid=True), sa.ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("task_id", sa.String(64), index=True),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text()),
        sa.Column("in_scope", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("responded", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("timestamp", sa.Float(), server_default="0"),
        sa.Column("top_slide_numbers", sa.String(64)),
        sa.Column("top_similarity", sa.Float()),
        sa.Column("input_tokens", sa.Integer(), server_default="0"),
        sa.Column("output_tokens", sa.Integer(), server_default="0"),
        sa.Column("cost_usd", sa.Float(), server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── CostCategory enum + platform_cost_logs (raw SQL, sa.Enum 우회) ──────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE costcategory AS ENUM
                ('LLM_QA', 'LLM_ASSESSMENT', 'LLM_SUMMARY', 'STT', 'TTS', 'OTHER');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS platform_cost_logs (
            id UUID PRIMARY KEY,
            lecture_id UUID NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
            category costcategory NOT NULL,
            model VARCHAR(100),
            input_tokens INTEGER DEFAULT 0,
            output_tokens INTEGER DEFAULT 0,
            cost_usd DOUBLE PRECISION DEFAULT 0,
            memo TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_platform_cost_logs_lecture_id ON platform_cost_logs (lecture_id);")

    # ── PlanType enum + subscriptions (raw SQL, sa.Enum 우회) ───────────────
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE plantype AS ENUM ('FREE', 'BASIC', 'PRO');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS subscriptions (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            plan plantype NOT NULL DEFAULT 'FREE',
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_subscriptions_user_id ON subscriptions (user_id);")

    # ── script_translations ──────────────────────────────────
    op.create_table(
        "script_translations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("video_id", UUID(as_uuid=True), sa.ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("language", sa.String(10), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("video_id", "language", name="uq_script_translations_video_lang"),
    )

    # ── assessment_results ───────────────────────────────────
    op.create_table(
        "assessment_results",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("lecture_id", UUID(as_uuid=True), sa.ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("learning_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("question_type", sa.String(50), nullable=False),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("correct_answer", sa.Text(), nullable=False),
        sa.Column("user_answer", sa.Text(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("category", sa.String(100)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("assessment_results")
    op.drop_table("script_translations")
    op.drop_table("subscriptions")
    op.drop_table("platform_cost_logs")
    op.drop_table("qa_logs")
    op.drop_table("render_cost_logs")
    op.drop_table("video_renders")
    op.drop_table("slide_embeddings")

    # learning_sessions 확장 컬럼 제거
    for col in ["warning_level", "no_response_cnt", "is_paused", "is_network_unstable",
                 "last_heartbeat_at", "total_pause_seconds", "pause_reason",
                 "watched_sec", "total_sec", "progress_pct", "last_active_at",
                 "created_at", "updated_at"]:
        op.drop_column("learning_sessions", col)

    op.execute("DROP TYPE IF EXISTS renderstatus")
    op.execute("DROP TYPE IF EXISTS costcategory")
    op.execute("DROP TYPE IF EXISTS plantype")
