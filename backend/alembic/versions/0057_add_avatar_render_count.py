"""Add lectures.avatar_render_count (C-2: 강의당 아바타 재렌더 상한).

Revision ID: 0057
Revises: 0056
Create Date: 2026-06-18

변경 내용 (스펙 13 · C-2):
- ``lectures.avatar_render_count INT NOT NULL DEFAULT 0`` 추가.
    교수자가 트리거한 Q&A 아바타 제작/재제작 패스가 성공 제출될 때 +1 되며
    (app/tasks/qa_batch.py::_render_seed_questions), settings.AVATAR_RERENDER_MAX_PER_LECTURE
    (기본 5 = 첫 제작 1 + 재제작 4)를 넘으면 재제작이 차단된다
    (app/services/pipeline/budget.py::assert_avatar_rerender_quota).
    월 한도(QA_AVATAR_MONTHLY_…)는 '배포된 강의 수'만 세어 같은 강의의 재제작 비용을
    막지 못하고, 특히 VisionStory(본인 얼굴)는 전역 $ 서킷 브레이커가 없어 이 횟수
    상한이 유일한 방어선이다.

멱등: 컬럼 존재 여부를 확인해 있으면 추가를 건너뛴다.
다운그레이드: 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0057"
down_revision: Union[str, None] = "0056"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "lectures"
_COLUMN = "avatar_render_count"


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column(_TABLE, _COLUMN):
        op.add_column(
            _TABLE,
            sa.Column(
                _COLUMN,
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
        )


def downgrade() -> None:
    if _has_column(_TABLE, _COLUMN):
        op.drop_column(_TABLE, _COLUMN)
