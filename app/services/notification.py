"""교수자 알림 서비스.

현재는 로깅 기반 구현이며, 추후 이메일/웹소켓/푸시 등으로 교체 가능하다.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def notify_script_ready(task_id: str, video_filename: str, total_slides: int) -> None:
    """교수자에게 '스크립트 검토 준비됨' 알림을 발송한다.

    Parameters
    ----------
    task_id : 파이프라인 태스크 ID
    video_filename : 원본 PPT 파일명
    total_slides : 총 슬라이드 수
    """
    # TODO: 실제 알림 채널 연동 (이메일, 웹소켓, FCM 등)
    logger.info(
        "[알림] 스크립트 검토 준비 완료 — task_id=%s, 파일=%s, 슬라이드=%d장",
        task_id,
        video_filename,
        total_slides,
    )


def notify_video_ready(task_id: str, video_filename: str, s3_url: str) -> None:
    """교수자에게 '영상 준비 완료' 알림을 발송한다."""
    # TODO: 실제 알림 채널 연동
    logger.info(
        "[알림] 영상 준비 완료 — task_id=%s, 파일=%s, url=%s",
        task_id,
        video_filename,
        s3_url,
    )
