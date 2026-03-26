"""영상 버전 관리 서비스 — 시청자 확인, 아카이브, 버전 생성."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.session_log import SessionLog
from app.models.video import Video, VideoVersion

logger = logging.getLogger(__name__)


@dataclass
class ActiveViewerInfo:
    count: int
    session_ids: list[str]


def get_active_viewers(db: Session, video_id: int) -> ActiveViewerInfo:
    """현재 해당 영상을 시청 중인 학습자 수를 조회한다."""
    active_sessions = (
        db.query(SessionLog)
        .filter(
            SessionLog.video_id == video_id,
            SessionLog.is_active == True,  # noqa: E712
            SessionLog.archived == False,  # noqa: E712
        )
        .all()
    )
    return ActiveViewerInfo(
        count=len(active_sessions),
        session_ids=[s.session_id for s in active_sessions],
    )


def archive_session_logs(db: Session, video_id: int, version: int) -> int:
    """현재 버전의 모든 세션 로그를 아카이브 처리한다.

    Returns
    -------
    int : 아카이브된 로그 수
    """
    logs = (
        db.query(SessionLog)
        .filter(
            SessionLog.video_id == video_id,
            SessionLog.archived == False,  # noqa: E712
        )
        .all()
    )

    for log in logs:
        log.archived = True
        log.is_active = False
        log.ended_at = datetime.utcnow()
        log.video_version = version

    db.flush()
    logger.info("video_id=%d: %d개 세션 로그 아카이브 완료 (v%d)", video_id, len(logs), version)
    return len(logs)


def create_version_snapshot(db: Session, video: Video) -> VideoVersion:
    """현재 영상 상태의 버전 스냅샷을 생성한다."""
    # 스크립트 + 번역 스냅샷 구성
    snapshot_data = []
    for slide in sorted(video.slides, key=lambda s: s.slide_number):
        slide_snap = {
            "slide_number": slide.slide_number,
            "text_content": slide.text_content,
            "speaker_notes": slide.speaker_notes,
        }
        if slide.script:
            slide_snap["script"] = slide.script.content
            slide_snap["translations"] = [
                {"language": t.language, "content": t.content, "provider": t.provider}
                for t in slide.script.translations
            ]
        snapshot_data.append(slide_snap)

    version_record = VideoVersion(
        video_id=video.id,
        version=video.version,
        s3_url=video.s3_url,
        status=video.status.value if video.status else "",
        snapshot=json.dumps(snapshot_data, ensure_ascii=False),
    )
    db.add(version_record)
    db.flush()

    logger.info("video_id=%d: v%d 스냅샷 생성 완료", video.id, video.version)
    return version_record


def bump_version(db: Session, video: Video) -> int:
    """영상 버전을 1 증가시키고 새 버전 번호를 반환한다."""
    video.version += 1
    db.flush()
    return video.version
