"""users.tts_quota_reset_at — 운영자의 TTS 쿼터 개별 상향 (스펙 13 §C-3 b).

Revision ID: 0074
Revises: 0073
Create Date: 2026-07-26

교수자 월 TTS 문자 쿼터는 **카운터 컬럼이 아니라 비용 로그에서 계산**된다
(`render_cost_logs.cost_usd` 역산 — §C-4). 그래서 `reset-avatar-rerender` 처럼 정수를
0 으로 되돌릴 대상이 없다.

대신 **집계 시작점**을 옮긴다. 이 컬럼이 세팅되면 그 시각 이후의 사용량만 센다
(달 시작과 이 값 중 **더 늦은 쪽**부터). 결과적으로 "이번 달 쿼터를 리셋"과 같은 효과다.

- ``users.tts_quota_reset_at`` TIMESTAMPTZ NULL — NULL = 리셋 이력 없음(달 시작부터 집계)

**8월 베타 기본 쿼터가 30,000자(강의 약 3편)로 좁다**(§C-3). 좁게 시작해 필요한 사람만
풀어 주는 편이 ElevenLabs 계정 한도를 지키므로, 이 오버라이드가 실제로 자주 쓰인다.

멱등: 컬럼 존재 시 건너뜀.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0074"
down_revision: Union[str, None] = "0073"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "users"
_COLUMN = "tts_quota_reset_at"


def _has_table(table: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return table in insp.get_table_names()


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    try:
        return any(c["name"] == column for c in insp.get_columns(table))
    except Exception:  # noqa: BLE001
        return False


def upgrade() -> None:
    if _has_table(_TABLE) and not _has_column(_TABLE, _COLUMN):
        op.add_column(
            _TABLE, sa.Column(_COLUMN, sa.DateTime(timezone=True), nullable=True)
        )


def downgrade() -> None:
    if _has_column(_TABLE, _COLUMN):
        op.drop_column(_TABLE, _COLUMN)
