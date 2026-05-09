"""Add voice_gender enum column to lectures table.

Revision ID: 0016
Revises: 0015
Create Date: 2026-05-09

변경 내용:
- VoiceGender enum 타입 신설 ('male' | 'female') — PG 한정 네이티브 enum, SQLite 는 VARCHAR + CHECK.
- lectures.voice_gender (NOT NULL, DEFAULT 'male'):
    강의별 HeyGen 아바타 / ElevenLabs 보이스 성별 분기 키.
    services/pipeline/heygen.py:pick_avatar_id 및 elevenlabs_client.py:pick_voice_id 가 참조.
- 기존 row 는 server_default 로 'male' 가 자동 채워짐 (1단계 단일 ID 운영과 동일 동작).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# ── revision identifiers, used by Alembic ────────────────────────────────────
revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_VOICE_GENDER_VALUES = ("male", "female")


def upgrade() -> None:
    bind = op.get_bind()

    # PG 는 컬럼 추가 전에 enum 타입을 명시 생성해야 server_default 가 안전하게 적용됨.
    # SAEnum(create_type=True, ...) 의 자동 생성에 의존하지 않고 직접 만들어 멱등성 확보.
    if bind.dialect.name == "postgresql":
        op.execute(
            "DO $$ BEGIN "
            "CREATE TYPE voice_gender AS ENUM ('male', 'female'); "
            "EXCEPTION WHEN duplicate_object THEN null; END $$;"
        )
        voice_gender_type = sa.Enum(
            *_VOICE_GENDER_VALUES,
            name="voice_gender",
            create_type=False,
        )
    else:
        # SQLite (테스트용) — VARCHAR + CHECK constraint 로 구현.
        voice_gender_type = sa.Enum(
            *_VOICE_GENDER_VALUES,
            name="voice_gender",
        )

    op.add_column(
        "lectures",
        sa.Column(
            "voice_gender",
            voice_gender_type,
            nullable=False,
            server_default="male",
        ),
    )


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_column("lectures", "voice_gender")
    if bind.dialect.name == "postgresql":
        op.execute("DROP TYPE IF EXISTS voice_gender")
