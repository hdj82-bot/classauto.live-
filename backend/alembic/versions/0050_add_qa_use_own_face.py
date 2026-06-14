"""Add users.qa_use_own_face (Q&A 본인 얼굴 옵트인).

Revision ID: 0050
Revises: 0049
Create Date: 2026-06-14

변경 내용:
- ``users.qa_use_own_face`` (Boolean, NOT NULL, default False): Q&A 답변 영상에
  교수자 본인 얼굴(Talking Photo)을 쓸지 여부. 기본은 표준 HeyGen 아바타.

목적: HeyGen "사진 아바타 3개 한도"는 계정 단위라 모든 교수자에게 본인 얼굴을
줄 수 없다(다수 사용자 시 막힘). 그래서 **표준 아바타를 기본**으로 두고, 본인
얼굴은 교수자가 명시적으로 켜는 옵션으로 전환한다. 기본 False 경로는 HeyGen
photo-avatar 슬롯을 전혀 쓰지 않아 사용자 수와 무관하게 막히지 않는다.

백필: 이미 본인 얼굴을 셋업한 교수자(photo_avatar_default_look_id 또는
photo_avatar_id 보유)는 종전 동작(본인 얼굴 사용)을 유지하도록 True 로 채운다.
신규 사용자는 default False(표준 아바타).

멱등: 컬럼 존재 여부를 확인해 있으면 add 를 건너뛴다.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0050"
down_revision: Union[str, None] = "0049"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if _has_column("users", "qa_use_own_face"):
        return
    op.add_column(
        "users",
        sa.Column(
            "qa_use_own_face",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    # 기존에 본인 얼굴을 셋업한 교수자는 종전 동작 유지(옵트인 True 로 백필).
    op.execute(
        "UPDATE users SET qa_use_own_face = true "
        "WHERE photo_avatar_default_look_id IS NOT NULL "
        "   OR photo_avatar_id IS NOT NULL"
    )


def downgrade() -> None:
    if _has_column("users", "qa_use_own_face"):
        op.drop_column("users", "qa_use_own_face")
