"""강의 본문 mp4 on-demand 합성 (슬라이드 이미지 + 구간 음성 → ffmpeg).

본문은 평소 클라이언트 슬라이드쇼로 재생하므로 mp4 를 굽지 않는다. 다만 "mp4
다운로드" 약속(docs/planning/08-cost-optimization.md §4.1, 01-pricing-policy)은
**요청 시 on-demand** 로 처리한다: 슬라이드 PNG 를 각 구간 음성 길이만큼 정지영상
클립으로 만들고 이어붙여 하나의 mp4 로 합성한다. 결과는 캐시(``lectures.mp4_url``)
되어 재요청 시 재인코딩하지 않는다.
"""
from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

import httpx

from app.celery_app import celery
from app.core.config import settings
from app.db.session import SyncSessionLocal
from app.models.course import Course
from app.models.embedding import SlideEmbedding
from app.models.lecture import Lecture
from app.models.video import Video
from app.models.video_render import RenderStatus, VideoRender
from app.services.pipeline import s3 as s3_svc

logger = logging.getLogger(__name__)

_W, _H = 1280, 720
_FFMPEG_TIMEOUT = 900
_MIN_SLIDE_SEC = 3.0
# 정지영상 + 음성을 균일 1280x720 / yuv420p 로 인코딩해 concat -c copy 가 안전하도록.
_VF = (
    f"scale={_W}:{_H}:force_original_aspect_ratio=decrease,"
    f"pad={_W}:{_H}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p"
)


def _mp4_key(lecture_id: str) -> str:
    return f"{settings.S3_PREFIX}lectures/{lecture_id}/download.mp4"


def _download(url: str | None) -> bytes | None:
    """저장된 S3 URL(또는 외부 URL)을 presign 후 바이트로 받아온다."""
    if not url:
        return None
    signed = s3_svc.presign_stored_s3_url(url) or url
    try:
        r = httpx.get(signed, timeout=60.0, follow_redirects=True)
        r.raise_for_status()
        return r.content
    except Exception as exc:  # noqa: BLE001 — graceful: 한 슬라이드 누락은 스킵.
        logger.warning("mp4 합성 자원 다운로드 실패: %s (%s)", url, exc)
        return None


def _set_status(db, lecture_id: str, status: str, url: str | None = None) -> None:
    lec = db.query(Lecture).filter(Lecture.id == uuid.UUID(lecture_id)).one_or_none()
    if lec is None:
        return
    lec.mp4_status = status
    if url is not None:
        lec.mp4_url = url
    db.commit()


@celery.task(bind=True, max_retries=1, default_retry_delay=30)
def compose_lecture_mp4(
    self, lecture_id: str, caller_user_id: str | None = None
) -> dict:
    """슬라이드 이미지 + 구간 음성으로 강의 본문 mp4 를 합성해 S3 에 올린다.

    멱등: 이미 ``mp4_status="ready"`` 면 재인코딩하지 않는다. 호출자(caller_user_id)
    가 강의 소유 교수자와 다르면 즉시 종료한다(방어).
    """
    db = SyncSessionLocal()
    tmp: Path | None = None
    try:
        lecture = (
            db.query(Lecture)
            .filter(Lecture.id == uuid.UUID(lecture_id))
            .one_or_none()
        )
        if lecture is None:
            return {"lecture_id": lecture_id, "status": "not_found"}

        # 소유권 방어 — 엔드포인트에서 1차 검증하지만 태스크에서도 확인.
        if caller_user_id is not None:
            course = (
                db.query(Course).filter(Course.id == lecture.course_id).one_or_none()
            )
            if course is None or str(course.instructor_id) != str(caller_user_id):
                logger.warning(
                    "[security] compose_lecture_mp4 소유권 불일치 — 종료: lecture=%s caller=%s",
                    lecture_id, caller_user_id,
                )
                return {"lecture_id": lecture_id, "status": "REJECTED_OWNERSHIP_MISMATCH"}

        if lecture.mp4_status == "ready" and lecture.mp4_url:
            return {"lecture_id": lecture_id, "status": "ready", "url": lecture.mp4_url}

        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            _set_status(db, lecture_id, "failed")
            return {"lecture_id": lecture_id, "status": "failed", "reason": "ffmpeg_missing"}

        lecture.mp4_status = "building"
        db.commit()

        # ── 슬라이드쇼 자원 수집 (slideshow 엔드포인트와 동일 규약) ──
        video = (
            db.query(Video)
            .filter(Video.lecture_id == lecture.id)
            .order_by(Video.created_at.desc())
            .first()
        )
        script = video.script if video else None
        segments = (script.segments if script else None) or []

        images: dict[int, str | None] = {}
        if lecture.pipeline_task_id:
            for sn, url in (
                db.query(SlideEmbedding.slide_number, SlideEmbedding.slide_image_url)
                .filter(SlideEmbedding.task_id == lecture.pipeline_task_id)
                .all()
            ):
                images[int(sn) - 1] = url  # 1-based → 0-based

        audio: dict[int, str] = {}
        for r in (
            db.query(VideoRender)
            .filter(
                VideoRender.lecture_id == lecture.id,
                VideoRender.status == RenderStatus.ready,
            )
            .order_by(VideoRender.created_at.desc())
            .all()
        ):
            if r.slide_number is not None and r.audio_url and int(r.slide_number) not in audio:
                audio[int(r.slide_number)] = r.audio_url

        seg_by_index: dict[int, dict] = {
            int(s["slide_index"]): s
            for s in segments
            if isinstance(s, dict) and isinstance(s.get("slide_index"), int)
        }
        indices = sorted(i for i in seg_by_index if i >= 0)
        if not indices:
            _set_status(db, lecture_id, "failed")
            return {"lecture_id": lecture_id, "status": "failed", "reason": "no_slides"}

        tmp = Path(tempfile.mkdtemp(prefix="mp4-compose-"))
        clips: list[Path] = []
        for idx in indices:
            img_bytes = _download(images.get(idx))
            if not img_bytes:
                continue  # 이미지 없는 슬라이드는 건너뛴다.
            img_path = tmp / f"img_{idx}.png"
            img_path.write_bytes(img_bytes)
            clip = tmp / f"clip_{idx:04d}.mp4"

            aud_bytes = _download(audio.get(idx))
            common_tail = [
                "-c:v", "libx264", "-tune", "stillimage", "-r", "30",
                "-vf", _VF, "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
                "-ac", "2", "-shortest", "-movflags", "+faststart", str(clip),
            ]
            if aud_bytes:
                aud_path = tmp / f"aud_{idx}.mp3"
                aud_path.write_bytes(aud_bytes)
                cmd = [ffmpeg, "-y", "-loop", "1", "-i", str(img_path),
                       "-i", str(aud_path), *common_tail]
            else:
                seg = seg_by_index.get(idx, {})
                est = max(
                    _MIN_SLIDE_SEC,
                    float(seg.get("end_seconds") or 0) - float(seg.get("start_seconds") or 0),
                )
                cmd = [ffmpeg, "-y", "-loop", "1", "-i", str(img_path),
                       "-f", "lavfi", "-i",
                       "anullsrc=channel_layout=stereo:sample_rate=44100",
                       "-t", f"{est:.2f}", *common_tail]
            subprocess.run(cmd, check=True, capture_output=True, timeout=_FFMPEG_TIMEOUT)
            clips.append(clip)

        if not clips:
            _set_status(db, lecture_id, "failed")
            return {"lecture_id": lecture_id, "status": "failed", "reason": "no_clips"}

        out = tmp / "out.mp4"
        if len(clips) == 1:
            shutil.copyfile(clips[0], out)
        else:
            list_path = tmp / "list.txt"
            list_path.write_text(
                "".join(f"file '{c.as_posix()}'\n" for c in clips), encoding="utf-8"
            )
            subprocess.run(
                [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(list_path),
                 "-c", "copy", "-movflags", "+faststart", str(out)],
                check=True, capture_output=True, timeout=_FFMPEG_TIMEOUT,
            )

        url = s3_svc.upload_file(
            out.read_bytes(), _mp4_key(lecture_id), content_type="video/mp4"
        )
        _set_status(db, lecture_id, "ready", url=url)
        logger.info("강의 mp4 합성 완료: lecture=%s slides=%d", lecture_id, len(clips))
        return {"lecture_id": lecture_id, "status": "ready", "url": url}

    except subprocess.CalledProcessError as exc:
        db.rollback()
        logger.error("ffmpeg 실패: lecture=%s, stderr=%s", lecture_id, getattr(exc, "stderr", b"")[:500])
        _set_status(db, lecture_id, "failed")
        return {"lecture_id": lecture_id, "status": "failed", "reason": "ffmpeg_error"}
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.exception("강의 mp4 합성 실패: lecture=%s (%s)", lecture_id, exc)
        try:
            _set_status(db, lecture_id, "failed")
        except Exception:  # noqa: BLE001
            db.rollback()
        return {"lecture_id": lecture_id, "status": "failed", "reason": "exception"}
    finally:
        if tmp is not None:
            shutil.rmtree(tmp, ignore_errors=True)
        db.close()
