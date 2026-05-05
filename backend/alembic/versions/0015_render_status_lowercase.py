"""RenderStatus enum value 를 historical UPPER → lowercase 통일.

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-06

배경:
- ``SessionStatus`` / ``PlanType`` 등 다른 enum 은 모두 lowercase value 를 쓰는데
  ``RenderStatus`` 만 멤버 이름은 lowercase, value 는 UPPERCASE("PENDING" 등) 인
  비대칭 상태. 코드 가독성·일관성을 위해 통일.

대상 값 (7개):
- PENDING → pending
- TTS_PROCESSING → tts_processing
- RENDERING → rendering
- UPLOADING → uploading
- READY → ready
- FAILED → failed
- CANCELLED → cancelled

PostgreSQL:
- 13+ 의 ``ALTER TYPE ... RENAME VALUE`` 로 동일 enum 타입 안에서 라벨만 변경.
- 트랜잭션 외부에서만 동작하므로 ``op.execute`` 직접 사용.
- 기존 row 의 status 컬럼은 자동으로 새 라벨을 따라간다 (PG ENUM 의 OID 기반 저장).

SQLite (테스트용):
- SAEnum 이 VARCHAR + CHECK 로 구현되므로 단순 ``UPDATE`` 로 row 값 교체.

prod DB 가 아직 존재하지 않는 1단계 상태에서 안전하게 적용 가능.
"""
from alembic import op


# ── revision identifiers, used by Alembic ────────────────────────────────────
revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


_RENAMES = [
    ("PENDING", "pending"),
    ("TTS_PROCESSING", "tts_processing"),
    ("RENDERING", "rendering"),
    ("UPLOADING", "uploading"),
    ("READY", "ready"),
    ("FAILED", "failed"),
    ("CANCELLED", "cancelled"),
]


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for old, new in _RENAMES:
            op.execute(f"ALTER TYPE renderstatus RENAME VALUE '{old}' TO '{new}'")
    else:
        # SQLite 등: VARCHAR 컬럼 직접 UPDATE.
        for old, new in _RENAMES:
            op.execute(
                f"UPDATE video_renders SET status = '{new}' WHERE status = '{old}'"
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for old, new in _RENAMES:
            op.execute(f"ALTER TYPE renderstatus RENAME VALUE '{new}' TO '{old}'")
    else:
        for old, new in _RENAMES:
            op.execute(
                f"UPDATE video_renders SET status = '{old}' WHERE status = '{new}'"
            )
