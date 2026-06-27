"""Add feedbacks table (인앱 피드백 수집 — 교수/학생 공통).

Revision ID: 0054
Revises: 0053
Create Date: 2026-06-18

변경 내용 (스펙 13 · F):
- ``feedbacks`` — 로그인 유저(교수/학생)가 제출한 피드백. 운영자 콘솔에서
    카테고리·상태로 분류한다. (user_id FK→users SET NULL, user_email 스냅샷,
    role, category, message, lecture_id FK→lectures SET NULL, page,
    status(default open), created_at index).

멱등: 테이블 존재 여부를 확인해 있으면 생성을 건너뛴다.
다운그레이드: 테이블 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0054"
down_revision: Union[str, None] = "0053"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return table in insp.get_table_names()


def upgrade() -> None:
    if _has_table("feedbacks"):
        return
    op.create_table(
        "feedbacks",
        sa.Column("id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("user_email", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("lecture_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("page", sa.String(length=255), nullable=True),
        sa.Column(
            "status", sa.String(length=20), server_default="open", nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["lecture_id"], ["lectures.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_feedbacks_created_at"), "feedbacks", ["created_at"], unique=False
    )


def downgrade() -> None:
    if not _has_table("feedbacks"):
        return
    op.drop_index(op.f("ix_feedbacks_created_at"), table_name="feedbacks")
    op.drop_table("feedbacks")
