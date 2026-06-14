"""Add subtitle_cues to video_renders (precise subtitle sync) — 0045 중복 수정 재발행.

Revision ID: 0047
Revises: 0046
Create Date: 2026-06-14

배경: 이 마이그레이션은 원래 #441 에서 ``0045`` 로 머지됐으나, origin/main 에 이미
``0045_add_user_onboarded_at`` 이 있어 **revision id 0045 가 중복**됐다(alembic
"Revision 0045 is present more than once" → 0046 의 down_revision='0045' 모호 →
``alembic upgrade head`` 깨짐). 중복 0045 파일을 제거하고 실제 head(0046) 뒤에
``0047`` 로 재배치한다. 결과 체인: 0044 → 0045(user_onboarded) → 0046(invites)
→ 0047(subtitle_cues).

변경 내용:
- ``video_renders.subtitle_cues`` (JSONB, nullable): 자막 정밀 싱크용 cue.
    Forced Alignment(ElevenLabs)로 산출한 슬라이드 음성의 실제 발성 시각.
    형식: [{"start": float, "end": float, "text": "문장"}, ...].
    NULL = 정렬 미수행/실패 → 플레이어가 글자수 균등분배로 폴백.

멱등: 중복 0045 상태에서 일부 환경이 이미 컬럼을 만들었을 수 있으므로, 컬럼
존재 여부를 확인해 있으면 add 를 건너뛴다(운영 DB 상태와 무관하게 안전).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0047"
down_revision: Union[str, None] = "0046"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("video_renders", "subtitle_cues"):
        op.add_column(
            "video_renders",
            sa.Column("subtitle_cues", postgresql.JSONB(), nullable=True),
        )


def downgrade() -> None:
    if _has_column("video_renders", "subtitle_cues"):
        op.drop_column("video_renders", "subtitle_cues")
