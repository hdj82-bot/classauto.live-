"""Add beta_applications table (대문 '베타 신청하기' 수신함).

Revision ID: 0068
Revises: 0067
Create Date: 2026-06-27

변경 내용:
- ``beta_applications`` — 비로그인 방문자가 대문 베타 신청 폼으로 제출한 신청.
    운영자 콘솔(/admin)에서 검토·상태 변경한다. 신청자는 아직 가입 전이라 user
    FK 없이 입력값 스냅샷만 저장(name, school, department, professor_title, email,
    subject, student_count, start_timing, channel, message, status(default new),
    created_at index, email index).

멱등: 테이블 존재 여부를 확인해 있으면 생성을 건너뛴다.
다운그레이드: 테이블 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0068"
down_revision: Union[str, None] = "0067"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return table in insp.get_table_names()


def upgrade() -> None:
    if _has_table("beta_applications"):
        return
    op.create_table(
        "beta_applications",
        sa.Column("id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("school", sa.String(length=200), nullable=False),
        sa.Column("department", sa.String(length=200), nullable=False),
        sa.Column("professor_title", sa.String(length=80), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("student_count", sa.String(length=40), nullable=True),
        sa.Column("start_timing", sa.String(length=20), nullable=False),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column(
            "status", sa.String(length=20), server_default="new", nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_beta_applications_created_at"),
        "beta_applications",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_beta_applications_email"),
        "beta_applications",
        ["email"],
        unique=False,
    )


def downgrade() -> None:
    if not _has_table("beta_applications"):
        return
    op.drop_index(op.f("ix_beta_applications_email"), table_name="beta_applications")
    op.drop_index(
        op.f("ix_beta_applications_created_at"), table_name="beta_applications"
    )
    op.drop_table("beta_applications")
