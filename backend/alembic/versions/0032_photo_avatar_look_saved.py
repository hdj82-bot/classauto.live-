"""Photo Avatar — photo_avatar_looks.saved_to_library 추가.

Revision ID: 0032
Revises: 0031
Create Date: 2026-06-02

변경 내용:
- ``photo_avatar_looks.saved_to_library`` (BOOLEAN, NOT NULL, default false):
    온보딩에서 생성한 룩은 "후보"이고, 사용자가 ⋮ 메뉴로 '라이브러리에 저장'하거나
    기본 룩으로 지정(확정)한 룩만 라이브러리에 노출한다. 종전엔 생성된 모든 ready
    룩이 라이브러리에 자동 노출돼 "기본 룩 선택" 그리드와 라이브러리가 동일했다.
- 백필: 기존에 기본 룩으로 확정된 룩(users.photo_avatar_default_look_id 가 가리키는
    행)은 이미 확정된 것이므로 saved_to_library=true 로 채운다.

다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0032"
down_revision: Union[str, None] = "0031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "photo_avatar_looks",
        sa.Column(
            "saved_to_library",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    # 백필: 이미 기본 룩으로 확정된 룩은 라이브러리에 남아야 한다.
    # default_look_id 는 gpt 경로=내부 uuid 문자열, 레거시=heygen_look_id 둘 다 가능.
    op.execute(
        """
        UPDATE photo_avatar_looks l
        SET saved_to_library = true
        FROM users u
        WHERE u.photo_avatar_default_look_id IS NOT NULL
          AND (
            l.id::text = u.photo_avatar_default_look_id
            OR l.heygen_look_id = u.photo_avatar_default_look_id
          )
        """
    )


def downgrade() -> None:
    op.drop_column("photo_avatar_looks", "saved_to_library")
