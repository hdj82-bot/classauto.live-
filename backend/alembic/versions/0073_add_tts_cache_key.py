"""video_renders.tts_cache_key — 재제작 시 TTS 음원 재사용 (스펙 13 §C-5).

Revision ID: 0073
Revises: 0072
Create Date: 2026-07-26

배경: "아무것도 안 바꾸고 다시 제작"해도 **전 슬라이드 TTS 가 다시 과금**됐다.

TTS idempotency 자체는 있었다 — `tasks/render.py` 가 ``render.audio_url`` 과 S3 객체
존재를 확인해 이미 합성됐으면 건너뛴다. 그런데 그 키가 ``render_id`` 였다.
``services/video.py::approve_video`` 는 승인할 때마다 세그먼트별 ``VideoRender`` 행을
**무조건 새로 만든다** → 새 id → 새 S3 키 → idempotency 무력 → 전량 재합성.

이 컬럼은 **음원의 내용 기반 키**다. 같은 (강의, 슬라이드, 발화 텍스트, 보이스, 속도)면
이전 렌더의 음원을 그대로 재사용한다. 아바타만 바꾸는 재제작은 **TTS 비용이 0** 이 된다.

- ``video_renders.tts_cache_key`` VARCHAR(64) NULL (SHA-256 hex)
- ``ix_video_renders_tts_cache_key`` — 재사용 후보 조회 핫패스

**기존 행은 NULL 이다.** 그래서 배포 직후 첫 재제작은 한 번 재합성되고(그때 키가
찍힌다) 그 뒤부터 재사용된다. 백필하지 않는다 — 과거 렌더의 script_text·voice 조합을
지금 신뢰해 키를 만들면 틀린 음원을 재사용할 위험이 있고, 한 번의 재합성으로 자연히
정합해진다.

멱등: 컬럼/인덱스 존재 시 건너뜀. 다운그레이드는 역순.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0073"
down_revision: Union[str, None] = "0072"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "video_renders"
_COLUMN = "tts_cache_key"
_INDEX = "ix_video_renders_tts_cache_key"


def _has_table(table: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return table in insp.get_table_names()


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    try:
        return any(c["name"] == column for c in insp.get_columns(table))
    except Exception:  # noqa: BLE001 — 테이블이 없으면 컬럼도 없다고 본다.
        return False


def _has_index(table: str, name: str) -> bool:
    insp = sa.inspect(op.get_bind())
    try:
        return any(ix["name"] == name for ix in insp.get_indexes(table))
    except Exception:  # noqa: BLE001
        return False


def upgrade() -> None:
    if not _has_table(_TABLE):
        return

    if not _has_column(_TABLE, _COLUMN):
        op.add_column(_TABLE, sa.Column(_COLUMN, sa.String(64), nullable=True))

    if not _has_index(_TABLE, _INDEX):
        op.create_index(_INDEX, _TABLE, [_COLUMN])


def downgrade() -> None:
    if _has_index(_TABLE, _INDEX):
        op.drop_index(_INDEX, table_name=_TABLE)
    if _has_column(_TABLE, _COLUMN):
        op.drop_column(_TABLE, _COLUMN)
