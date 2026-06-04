"""렌더 완료 → Video 상태 전환 헬퍼 (동기 세션 전용).

본문 렌더(슬라이드별 VideoRender)가 모두 끝나면 부모 Video 를 done 으로 올린다.
이게 없으면 approve 가 Video 를 rendering 으로 둔 채 아무도 done 으로 바꾸지 않아
(grep VideoStatus.done 0건) 영구 rendering 에 갇히고, 재-approve 시 409 가 난다.
render.py(슬라이드쇼)·webhooks.py·polling.py(HeyGen 완료) 가 공통으로 호출한다.
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def finalize_video_if_all_ready(db: Session, lecture_id) -> bool:
    """강의의 모든 VideoRender 가 ready/cancelled 면 rendering Video 를 done 으로 전환.

    - 렌더가 하나도 없으면(승인 전) 전환하지 않는다.
    - 아직 진행 중(pending/tts_processing/rendering/uploading)인 렌더가 있으면 보류.
    동시에 끝난 두 태스크가 모두 호출해도 멱등(이미 done 이면 no-op).
    반환: 이번 호출로 Video 를 done 으로 전환했으면 True(완료 알림 트리거용).
    """
    from app.models.video import Video, VideoStatus
    from app.models.video_render import RenderStatus, VideoRender

    total = (
        db.query(VideoRender).filter(VideoRender.lecture_id == lecture_id).count()
    )
    if total == 0:
        return False
    pending = (
        db.query(VideoRender)
        .filter(
            VideoRender.lecture_id == lecture_id,
            VideoRender.status.notin_([RenderStatus.ready, RenderStatus.cancelled]),
        )
        .count()
    )
    if pending:
        return False

    videos = (
        db.query(Video)
        .filter(Video.lecture_id == lecture_id, Video.status == VideoStatus.rendering)
        .all()
    )
    for video in videos:
        video.status = VideoStatus.done
    if videos:
        db.commit()
        logger.info("Video done 전환: lecture_id=%s, count=%d", lecture_id, len(videos))
        return True
    return False
