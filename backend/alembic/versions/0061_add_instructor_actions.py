"""Add instructor_actions (교수자 개입 행동 로그 — 스펙 11 §H-4 / 10번 G3, RQ2).

Revision ID: 0061
Revises: 0060
Create Date: 2026-06-19

변경 내용:
- ``instructor_actions`` — 격려 발송·권고 채택·메모 등 교수자 개입 행동(RQ2 계측).
    lecture_id FK→lectures CASCADE, instructor_id FK→users CASCADE, target_user_id
    FK→users SET NULL, action_type, message, status(default recorded), created_at idx.

멱등: 테이블 존재 시 생성 건너뜀. 다운그레이드: 테이블 제거.
주의: 0060(learning_goals) 다음 — 본 PR 은 #525(§H-3) 이후 머지.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0061"
down_revision: Union[str, None] = "0060"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return table in insp.get_table_names()


def upgrade() -> None:
    if _has_table("instructor_actions"):
        return
    op.create_table(
        "instructor_actions",
        sa.Column("id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("lecture_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("instructor_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("action_type", sa.String(length=40), nullable=False),
        sa.Column("target_user_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="recorded", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["lecture_id"], ["lectures.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["instructor_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_instructor_actions_lecture_id"),
        "instructor_actions",
        ["lecture_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_instructor_actions_instructor_id"),
        "instructor_actions",
        ["instructor_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_instructor_actions_target_user_id"),
        "instructor_actions",
        ["target_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_instructor_actions_created_at"),
        "instructor_actions",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    if not _has_table("instructor_actions"):
        return
    for idx in (
        "ix_instructor_actions_created_at",
        "ix_instructor_actions_target_user_id",
        "ix_instructor_actions_instructor_id",
        "ix_instructor_actions_lecture_id",
    ):
        op.drop_index(op.f(idx), table_name="instructor_actions")
    op.drop_table("instructor_actions")
