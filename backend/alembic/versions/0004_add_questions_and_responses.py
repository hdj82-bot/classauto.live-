"""add questions and responses tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-03-26 00:04:00.000000

변경 내용:
- questions 테이블 생성 (assessmenttype, questiontype, difficulty enum 포함)
- responses 테이블 생성 (타임스탬프 검증 필드 포함)
"""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── enum 타입 생성 (idempotent — 이전 실패 잔재 안전 처리) ──────────────────
    # PG 의 CREATE TYPE 은 트랜잭션 ROLLBACK 으로 되돌려지지 않는 알려진 함정.
    # 마이그레이션이 중간에 실패하면 enum 만 살아남아 다음 시도에서 already
    # exists 로 무한 굴레. DO $$ ... EXCEPTION 으로 감싸서 안전 통과.
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE assessmenttype AS ENUM ('formative', 'summative');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE questiontype AS ENUM ('multiple_choice', 'short_answer');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE difficulty AS ENUM ('easy', 'medium', 'hard');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$;
    """)

    # ── questions / responses 테이블 ───────────────────────────────────────────
    # SQLAlchemy 2.x 의 sa.Enum 은 op.create_table 안에서 create_type=False 가
    # 무시되고 자동으로 CREATE TYPE 을 시도해 위에서 만든 enum 과 충돌한다.
    # raw SQL 로 테이블을 만들어 자동 동작을 완전 우회.
    op.execute("""
        CREATE TABLE IF NOT EXISTS questions (
            id UUID PRIMARY KEY,
            lecture_id UUID NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
            assessment_type assessmenttype NOT NULL,
            question_type questiontype NOT NULL,
            difficulty difficulty NOT NULL DEFAULT 'medium',
            content TEXT NOT NULL,
            options JSONB,
            correct_answer TEXT,
            explanation TEXT,
            timestamp_seconds INTEGER,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_questions_lecture_id ON questions (lecture_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_questions_assessment_type ON questions (assessment_type);")

    op.execute("""
        CREATE TABLE IF NOT EXISTS responses (
            id UUID PRIMARY KEY,
            session_id UUID NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
            question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
            user_answer TEXT NOT NULL,
            is_correct BOOLEAN,
            video_timestamp_seconds INTEGER NOT NULL,
            timestamp_valid BOOLEAN NOT NULL DEFAULT TRUE,
            responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_responses_session_id ON responses (session_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_responses_question_id ON responses (question_id);")


def downgrade() -> None:
    op.drop_table("responses")
    op.drop_table("questions")
    op.execute("DROP TYPE IF EXISTS difficulty")
    op.execute("DROP TYPE IF EXISTS questiontype")
    op.execute("DROP TYPE IF EXISTS assessmenttype")
