"""Add lectures.avatar_preview_url / avatar_preview_video_url.

Revision ID: 0051
Revises: 0050
Create Date: 2026-06-15

변경 내용:
- ``lectures.avatar_preview_url`` (VARCHAR(1024), nullable): 강의에 지정된 아바타의
  미리보기 썸네일 이미지 URL.
- ``lectures.avatar_preview_video_url`` (VARCHAR(1024), nullable): 동 아바타의
  미리보기 루프 영상 URL(클릭 시 재생).

목적: 강의에는 ``avatar_id``/``avatar_name`` 만 저장돼 있어, studio 우측 패널과
아바타 페이지 "현재 지정된 아바타"에서 썸네일을 보여 주려면 avatar_id 를 다시
미리보기로 해석해야 한다. 적용 아바타가 표준·저장조합 등 출처가 다양해 단일
목록만으론 못 찾는 경우가 있어, 아바타 적용 시점에 알던 미리보기 URL 을 강의에
비정규화해 둔다. 영상 생성 로직과는 무관한 표시 전용 필드.

멱등: 컬럼 존재 여부를 확인해 있으면 add 를 건너뛴다.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0051"
down_revision: Union[str, None] = "0050"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("lectures", "avatar_preview_url"):
        op.add_column(
            "lectures",
            sa.Column("avatar_preview_url", sa.String(length=1024), nullable=True),
        )
    if not _has_column("lectures", "avatar_preview_video_url"):
        op.add_column(
            "lectures",
            sa.Column(
                "avatar_preview_video_url", sa.String(length=1024), nullable=True
            ),
        )


def downgrade() -> None:
    if _has_column("lectures", "avatar_preview_video_url"):
        op.drop_column("lectures", "avatar_preview_video_url")
    if _has_column("lectures", "avatar_preview_url"):
        op.drop_column("lectures", "avatar_preview_url")
