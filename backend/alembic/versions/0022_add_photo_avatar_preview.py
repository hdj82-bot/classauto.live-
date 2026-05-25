"""Add photo-avatar preview fields to users.

Revision ID: 0022
Revises: 0021
Create Date: 2026-05-23

주의: 이 마이그레이션은 voice_speed(0021)와 동시에 머지되어 둘 다 revision="0021"·
down_revision="0020" 으로 충돌(중복 revision·다중 head)했다. voice_speed 가 운영에
먼저 적용된 정식 0021 이므로, 이쪽을 0022 로 재번호해 체인을 선형화한다
(0020 → 0021[voice_speed] → 0022[photo_avatar_preview]).

변경 내용 (본인 아바타 "움직이는 미리보기" 캐시):
- ``users.photo_avatar_preview_url`` (VARCHAR(1024), nullable): Talking Photo 로
    1회 렌더한 짧은 샘플 영상의 영구 S3 https URL. 채워지면 캐시 적중.
- ``users.photo_avatar_preview_video_id`` (VARCHAR(255), nullable): 렌더 진행
    중인 HeyGen video_id (상태 폴링 키).
- ``users.photo_avatar_preview_voice_id`` (VARCHAR(255), nullable): 그 미리보기를
    렌더할 때 쓴 ElevenLabs voice_id (다른 음성으로 다시 만들기 판정용).

다운그레이드: 3개 컬럼 제거.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0022"
down_revision: Union[str, None] = "0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("photo_avatar_preview_url", sa.String(length=1024), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "photo_avatar_preview_video_id", sa.String(length=255), nullable=True
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "photo_avatar_preview_voice_id", sa.String(length=255), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "photo_avatar_preview_voice_id")
    op.drop_column("users", "photo_avatar_preview_video_id")
    op.drop_column("users", "photo_avatar_preview_url")
