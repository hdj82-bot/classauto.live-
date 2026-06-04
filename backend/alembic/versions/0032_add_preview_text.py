"""Add users.photo_avatar_preview_text (미리보기 렌더 대본 캐시 키).

Revision ID: 0032_preview_text
Revises: 0031
Create Date: 2026-06-04

변경 내용:
- ``users.photo_avatar_preview_text`` (VARCHAR(2000), nullable): 본인 아바타
    "움직이는 미리보기"를 렌더할 때 읽힌 대본. "룩과 목소리 아바타 제작" 빌더의
    스크립트 테스트가 임의 문장을 렌더하므로, 같은 (음성·대본) 조합은 캐시
    적중시키고 대본이 바뀌면 다시 렌더하도록 캐시 키로 쓴다. NULL = 기본 샘플
    문장으로 렌더된 과거 캐시(호환).

참고: 커밋된 head(0031) 위에 올린다. 병렬 작업 브랜치의 다른 0032 마이그레이션과
나중에 main 에서 만나면 alembic 멀티헤드가 되므로, 둘 중 나중 머지본을 rebase
(down_revision 갱신)하거나 ``alembic merge`` 로 합친다. 그래서 revision id 는
충돌을 피하려 ``0032_preview_text`` 로 둔다(파일명은 관례상 0032 유지).

다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0032_preview_text"
down_revision: Union[str, None] = "0031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("photo_avatar_preview_text", sa.String(length=2000), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "photo_avatar_preview_text")
