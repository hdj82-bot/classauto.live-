"""add courses table and update lectures schema

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-26 00:02:00.000000

변경 내용:
- courses 테이블 생성
- lectures 테이블:
    추가: course_id (FK → courses), slug (unique), order, expires_at
    제거: instructor_id (강좌를 통해 간접 참조)
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. courses 테이블 생성 ────────────────────────────────────────────────
    op.create_table(
        "courses",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("instructor_id", sa.UUID(), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["instructor_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_courses_instructor_id", "courses", ["instructor_id"])

    # ── 2. lectures: 기존 instructor_id 제거 ──────────────────────────────────
    op.drop_index("ix_lectures_instructor_id", table_name="lectures")
    op.drop_constraint("lectures_instructor_id_fkey", "lectures", type_="foreignkey")
    op.drop_column("lectures", "instructor_id")

    # ── 3. lectures: 새 컬럼 추가 ────────────────────────────────────────────
    op.add_column("lectures", sa.Column("course_id", sa.UUID(), nullable=True))
    op.add_column("lectures", sa.Column(
        "slug", sa.String(300), nullable=True,
    ))
    op.add_column("lectures", sa.Column(
        "order", sa.Integer(), nullable=False, server_default="0",
    ))
    op.add_column("lectures", sa.Column(
        "expires_at", sa.DateTime(timezone=True), nullable=True,
    ))

    # FK 및 인덱스 생성
    op.create_foreign_key(
        "fk_lectures_course_id",
        "lectures", "courses",
        ["course_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_lectures_course_id", "lectures", ["course_id"])
    op.create_index("ix_lectures_slug", "lectures", ["slug"], unique=True)

    # ── 4. course_id / slug NOT NULL 적용 (기존 데이터 없으므로 즉시 가능) ──
    op.alter_column("lectures", "course_id", nullable=False)
    op.alter_column("lectures", "slug", nullable=False)


def downgrade() -> None:
    # lectures 원복
    op.drop_index("ix_lectures_slug", table_name="lectures")
    op.drop_index("ix_lectures_course_id", table_name="lectures")
    op.drop_constraint("fk_lectures_course_id", "lectures", type_="foreignkey")
    op.drop_column("lectures", "expires_at")
    op.drop_column("lectures", "order")
    op.drop_column("lectures", "slug")
    op.drop_column("lectures", "course_id")

    # instructor_id 복구
    op.add_column("lectures", sa.Column("instructor_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "lectures_instructor_id_fkey",
        "lectures", "users",
        ["instructor_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_lectures_instructor_id", "lectures", ["instructor_id"])

    # courses 테이블 삭제
    op.drop_index("ix_courses_instructor_id", table_name="courses")
    op.drop_table("courses")
