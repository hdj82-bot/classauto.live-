"""Add folders table and lectures.folder_id (옵션 외래키).

Revision ID: 0017
Revises: 0016
Create Date: 2026-05-20

변경 내용:
- 신규 ``folders`` 테이블: 교수자가 강의를 묶어 관리하는 컬렉션.
- ``lectures.folder_id`` (UUID, nullable, FK→folders.id, ondelete=SET NULL):
    NULL = 미분류. 폴더 삭제 시 강의는 보존하되 폴더 연결만 해제.
- ``folders.instructor_id`` (FK→users.id, ondelete=CASCADE): 사용자 탈퇴 시 폴더도 함께 삭제.

다운그레이드: lectures.folder_id 컬럼 제거 후 folders 테이블 드롭.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "folders",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "instructor_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_folders_instructor_id", "folders", ["instructor_id"], unique=False
    )

    op.add_column(
        "lectures",
        sa.Column(
            "folder_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("folders.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_lectures_folder_id", "lectures", ["folder_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_lectures_folder_id", table_name="lectures")
    op.drop_column("lectures", "folder_id")
    op.drop_index("ix_folders_instructor_id", table_name="folders")
    op.drop_table("folders")
