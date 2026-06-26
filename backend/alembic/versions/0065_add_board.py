"""Add board_posts / board_comments (자유게시판 — 베타 테스터 커뮤니티).

Revision ID: 0065
Revises: 0064
Create Date: 2026-06-27

변경 내용:
- ``board_posts`` — 공개 게시글. author_id FK→users SET NULL(탈퇴해도 글 보존),
    author_name 스냅샷, title, body, pinned(공지 고정), created_at idx.
- ``board_comments`` — 글 댓글. post_id FK→board_posts CASCADE,
    author_id FK→users SET NULL, author_name, body, created_at idx.

멱등: 테이블 존재 시 생성 건너뜀. 다운그레이드: 두 테이블 제거(댓글 먼저).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0065"
down_revision: Union[str, None] = "0064"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return table in insp.get_table_names()


def upgrade() -> None:
    if not _has_table("board_posts"):
        op.create_table(
            "board_posts",
            sa.Column("id", sa.UUID(as_uuid=True), nullable=False),
            sa.Column("author_id", sa.UUID(as_uuid=True), nullable=True),
            sa.Column("author_name", sa.String(length=120), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column(
                "pinned",
                sa.Boolean(),
                server_default=sa.text("false"),
                nullable=False,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_board_posts_author_id"), "board_posts", ["author_id"], unique=False
        )
        op.create_index(
            op.f("ix_board_posts_created_at"),
            "board_posts",
            ["created_at"],
            unique=False,
        )

    if not _has_table("board_comments"):
        op.create_table(
            "board_comments",
            sa.Column("id", sa.UUID(as_uuid=True), nullable=False),
            sa.Column("post_id", sa.UUID(as_uuid=True), nullable=False),
            sa.Column("author_id", sa.UUID(as_uuid=True), nullable=True),
            sa.Column("author_name", sa.String(length=120), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(
                ["post_id"], ["board_posts.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_board_comments_post_id"),
            "board_comments",
            ["post_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_board_comments_author_id"),
            "board_comments",
            ["author_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_board_comments_created_at"),
            "board_comments",
            ["created_at"],
            unique=False,
        )


def downgrade() -> None:
    if _has_table("board_comments"):
        for idx in (
            "ix_board_comments_created_at",
            "ix_board_comments_author_id",
            "ix_board_comments_post_id",
        ):
            op.drop_index(op.f(idx), table_name="board_comments")
        op.drop_table("board_comments")
    if _has_table("board_posts"):
        for idx in (
            "ix_board_posts_created_at",
            "ix_board_posts_author_id",
        ):
            op.drop_index(op.f(idx), table_name="board_posts")
        op.drop_table("board_posts")
