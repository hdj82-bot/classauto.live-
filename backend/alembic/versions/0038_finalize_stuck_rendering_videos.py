"""Unstick videos stuck in 'rendering' whose renders are all done.

Revision ID: 0038
Revises: 0037
Create Date: 2026-06-04

배경: 슬라이드쇼 전환(08 Phase 1) 이후 본문 렌더(VideoRender)는 ready 로 끝나지만
부모 Video 를 done 으로 올리는 코드가 어디에도 없어(grep VideoStatus.done 0건)
Video 가 영구 'rendering' 에 갇혔다. 그 결과 스튜디오 재진입·재클릭 시 approve 가
409("rendering 상태에선 승인 불가") 를 낸다. 코드는 finalize_video_if_all_ready 로
앞으로의 렌더 완료 시 전환하지만, 이미 갇힌 기존 Video 는 이 일회성 보정으로 푼다.

대상: status='rendering' 이고, 그 강의의 모든 VideoRender 가 ready/cancelled 인 Video.
(아직 진행 중인 렌더가 하나라도 있으면 건드리지 않는다.) 렌더가 0건인 Video 도 제외.

다운그레이드: no-op (done→rendering 되돌림은 의미 없음).
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0038"
down_revision: Union[str, None] = "0037"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE videos
        SET status = 'done'
        WHERE status = 'rendering'
          AND EXISTS (
            SELECT 1 FROM video_renders r WHERE r.lecture_id = videos.lecture_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM video_renders r
            WHERE r.lecture_id = videos.lecture_id
              AND r.status NOT IN ('ready', 'cancelled')
          );
        """
    )


def downgrade() -> None:
    # 되돌리지 않는다(완료 상태를 rendering 으로 되돌릴 근거 없음).
    pass
