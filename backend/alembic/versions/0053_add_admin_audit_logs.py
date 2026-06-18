"""Add admin_audit_logs table (운영자 god-mode 행위 추적 불변 로그).

Revision ID: 0053
Revises: 0052
Create Date: 2026-06-18

변경 내용 (스펙 13 · E):
- ``admin_audit_logs`` — 운영자가 다른 계정에 영향을 주는 행위를 1행씩 남기는
    불변 감사 로그. (actor_id FK→users SET NULL, actor_email 스냅샷, action,
    target_type, target_id, detail JSONB, created_at index).
    역할 변경(user.update_role)·유저 삭제(user.delete)·초대 생성/삭제
    (invite.create/invite.delete)를 추적한다. actor 가 삭제돼도 actor_email
    스냅샷으로 누가 했는지 보존한다.

멱등: 테이블 존재 여부를 확인해 있으면 생성을 건너뛴다.
다운그레이드: 테이블 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "0053"
down_revision: Union[str, None] = "0052"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return table in insp.get_table_names()


def upgrade() -> None:
    if _has_table("admin_audit_logs"):
        return
    op.create_table(
        "admin_audit_logs",
        sa.Column("id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_email", sa.String(length=255), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=32), nullable=True),
        sa.Column("target_id", sa.String(length=64), nullable=True),
        sa.Column("detail", JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_admin_audit_logs_action"), "admin_audit_logs", ["action"], unique=False
    )
    op.create_index(
        op.f("ix_admin_audit_logs_created_at"),
        "admin_audit_logs",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    if not _has_table("admin_audit_logs"):
        return
    op.drop_index(op.f("ix_admin_audit_logs_created_at"), table_name="admin_audit_logs")
    op.drop_index(op.f("ix_admin_audit_logs_action"), table_name="admin_audit_logs")
    op.drop_table("admin_audit_logs")
