"""Add professor_invites table (베타 교수자 가입 초대 게이트).

Revision ID: 0046
Revises: 0045
Create Date: 2026-06-11

NOTE(0046 재배치): #399(0045_add_user_onboarded_at)와 #400(본 파일)이 병렬로
각각 revision "0045"/down "0044" 를 만들어 alembic head 가 충돌(동일 id 중복 →
`alembic upgrade head` 로드 실패)했다. user_onboarded_at 이 먼저 머지·배포될 수
있어 그쪽을 0045 로 두고, 본 마이그레이션을 0045 위 0046 으로 선형화한다.

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

revision: str = "0046"
down_revision: Union[str, None] = "0045"
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
