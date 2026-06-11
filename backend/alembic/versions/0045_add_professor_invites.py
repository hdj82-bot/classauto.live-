"""Add professor_invites table (베타 교수자 가입 초대 게이트).

Revision ID: 0045
Revises: 0044
Create Date: 2026-06-11

변경 내용:
- ``professor_invites`` — 계정주가 이메일 지정으로 발급하는 단일 사용 교수자
    가입 초대. (token UNIQUE, email, role, created_by FK→users SET NULL,
    used_by FK→users SET NULL, used_at, expires_at, created_at).
    베타 동안 신규 교수자 가입은 이 초대 링크로만 가능하게 하는 게이트.

다운그레이드: 테이블 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0045"
down_revision: Union[str, None] = "0044"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "professor_invites",
        sa.Column("id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column(
            "role", sa.String(length=20), nullable=False, server_default="professor"
        ),
        sa.Column("created_by", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("used_by", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["used_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_professor_invites_token"),
        "professor_invites",
        ["token"],
        unique=True,
    )
    op.create_index(
        op.f("ix_professor_invites_email"),
        "professor_invites",
        ["email"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_professor_invites_email"), table_name="professor_invites")
    op.drop_index(op.f("ix_professor_invites_token"), table_name="professor_invites")
    op.drop_table("professor_invites")
