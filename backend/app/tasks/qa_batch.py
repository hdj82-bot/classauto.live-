"""아바타 Q&A 야간 배치 (docs/planning/08 §5, 09 §5 — Phase 2).

실시간 HeyGen 렌더는 **금지**(지연 → 학습자 이탈). 학생 질문은 항상 즉시 RAG
텍스트로 답하고(api/v1/qa.py), 미적중 질문은 status=pending 으로 적립된다. 이
배치가 야간에:

1. pending 질문을 임베딩 클러스터링 → 강의별 상위 N개 클러스터만 선정.
2. 대표 질문 답변을 TTS → HeyGen 720p 렌더 제출(status=rendering).
3. **자체 폴링**으로 완료 감지(창1 webhooks/polling 비의존) → S3 이전 → status=ready.
   클러스터 형제 행은 같은 클립(s3_video_url)을 공유.

비용 통제: 교수자당 월 한도(2영상 × 3렌더 = 6, budget.assert_qa_render_budget) +
전역 $ 서킷 브레이커. MOCK 모드면 외부 호출 없이 전 경로를 통과(테스트 비용 ₩0).
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from collections import defaultdict

from app.celery_app import celery
from app.core.config import settings
from app.db.session import SyncSessionLocal
from app.models.qa_answer_cache import QAAnswerCache
from app.services.pipeline import qa_avatar
from app.services.pipeline.budget import BudgetExceededError, assert_qa_render_budget

logger = logging.getLogger(__name__)

_MOCK_AUDIO_URL = "https://mock.invalid/qa_audio.mp3"


# ── 렌더 제출 ─────────────────────────────────────────────────────────────────


def _lecture_voice_settings(db, lecture_id, instructor_id) -> dict:
    """강의·교수자에서 TTS/아바타 파라미터를 모은다(render.py 패턴 축약)."""
    from app.models.lecture import Lecture, VoiceGender
    from app.models.user import User

    lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
    voice_gender = (
        lecture.voice_gender.value
        if lecture and isinstance(lecture.voice_gender, VoiceGender)
        else (str(lecture.voice_gender) if lecture and lecture.voice_gender else "male")
    )
    voice_id = (lecture.voice_id or None) if lecture else None
    voice_speed = (getattr(lecture, "voice_speed", None) if lecture else None) or 1.3
    avatar_scale = (getattr(lecture, "avatar_scale", None) if lecture else None) or 1.0
    avatar_id = (lecture.avatar_id or None) if lecture else None

    professor = db.query(User).filter(User.id == instructor_id).first()
    is_cloned = bool(
        voice_id and professor and professor.cloned_voice_id
        and voice_id == professor.cloned_voice_id
    )
    return {
        "voice_gender": voice_gender,
        "voice_id": voice_id,
        "voice_speed": voice_speed,
        "avatar_scale": avatar_scale,
        "avatar_id": avatar_id,
        "is_cloned": is_cloned,
    }


# ── 렌더 캐릭터 결정 (본인 제작 아바타 = talking_photo / 표준 = avatar) ──────────


def _instructor_look_match(db, instructor_id, candidate) -> bool:
    """candidate(아바타 id) 가 이 교수자의 PhotoAvatarLook(내부 id 또는 heygen_look_id)인지."""
    if not candidate:
        return False
    from app.models.photo_avatar import PhotoAvatarLook

    try:
        lid = uuid.UUID(str(candidate))
    except (ValueError, TypeError):
        lid = None
    if lid is not None and db.query(PhotoAvatarLook).filter(
        PhotoAvatarLook.user_id == instructor_id, PhotoAvatarLook.id == lid
    ).first():
        return True
    return bool(
        db.query(PhotoAvatarLook).filter(
            PhotoAvatarLook.user_id == instructor_id,
            PhotoAvatarLook.heygen_look_id == str(candidate),
        ).first()
    )


def _ensure_talking_photo_sync(db, loop, professor) -> str | None:
    """본인 제작 아바타의 talking_photo_id 확보 — avatars._ensure_photo_avatar_id 의 동기판.

    preview 와 동일하게 default 룩 이미지를 HeyGen Talking Photo 로 등록해
    professor.photo_avatar_id 에 캐시한다(있으면 재사용). 룩이 ready 가 아니거나
    등록 실패면 None → 이번 배치는 렌더 보류(잘못된 id 로 렌더하지 않음).
    """
    if professor is None:
        return None
    if settings.HEYGEN_MOCK:
        # MOCK: 외부 호출 0 — 있으면 그대로, 없으면 placeholder(create_video MOCK 가 무시).
        return professor.photo_avatar_id or "mock_talking_photo"
    if professor.photo_avatar_id:
        return professor.photo_avatar_id

    look_id = professor.photo_avatar_default_look_id
    if not look_id:
        return None

    from app.models.photo_avatar import LookStatus, PhotoAvatarLook

    look = None
    try:
        lid = uuid.UUID(str(look_id))
        look = db.query(PhotoAvatarLook).filter(
            PhotoAvatarLook.user_id == professor.id, PhotoAvatarLook.id == lid
        ).first()
    except (ValueError, TypeError):
        look = None
    if look is None:
        look = db.query(PhotoAvatarLook).filter(
            PhotoAvatarLook.user_id == professor.id,
            PhotoAvatarLook.heygen_look_id == str(look_id),
        ).first()
    if look is None or look.status != LookStatus.ready.value or not look.image_url:
        return None

    from urllib.parse import urlparse

    from app.services.pipeline import s3 as s3_svc
    from app.services.pipeline.heygen import upload_talking_photo

    key = urlparse(look.image_url).path.lstrip("/")
    ctype = "image/png" if key.lower().endswith(".png") else "image/jpeg"
    try:
        img_bytes = s3_svc.download_file(key)
        try:
            # preview 와 동일한 리사이즈 안전망 재사용(없으면 원본 사용).
            from app.api.v1.avatars import _ensure_talking_photo_payload
            img_bytes, ctype = _ensure_talking_photo_payload(img_bytes, ctype)
        except Exception:  # noqa: BLE001
            pass
        tp = loop.run_until_complete(upload_talking_photo(img_bytes, content_type=ctype))
    except Exception as exc:  # noqa: BLE001 — 등록 실패면 보류(다음 밤 재시도).
        logger.warning(
            "Q&A 배치: talking_photo lazy 등록 실패 — instructor=%s, look=%s, error=%s",
            professor.id, look_id, exc,
        )
        return None

    professor.photo_avatar_id = tp
    db.commit()
    logger.info(
        "Q&A 배치: talking_photo lazy 등록 — instructor=%s, talking_photo_id=%s",
        professor.id, tp,
    )
    return tp


def _resolve_character(db, loop, lecture, professor) -> dict | None:
    """create_video 의 character 인자(본인 아바타=talking_photo / 표준=avatar)를 결정.

    반환: {"talking_photo_id": ...} | {"avatar_id": ...} | None(본인 아바타 미준비 → 보류).

    본인 아바타로 판정(08 정책 — Q&A=본인 얼굴):
    - lecture.avatar_id 미지정(강의별 선택 없음 → 본인 기본 얼굴), 또는
    - lecture.avatar_id == 등록된 talking_photo_id, 또는 기본 룩 id, 또는
      교수자의 PhotoAvatarLook(id/heygen_look_id).
    그 외(표준 HeyGen 아바타를 강의에 지정)면 avatar_id 그대로 사용.
    """
    av = (lecture.avatar_id or None) if lecture else None
    tp = professor.photo_avatar_id if professor else None
    look_default = professor.photo_avatar_default_look_id if professor else None
    has_self = bool(tp or look_default)

    is_self = has_self and (
        not av
        or (tp and av == tp)
        or (look_default and av == look_default)
        or _instructor_look_match(db, professor.id, av)
    )
    if is_self:
        resolved = _ensure_talking_photo_sync(db, loop, professor)
        if resolved:
            return {"talking_photo_id": resolved}
        return None  # 잘못된 avatar_id 로 렌더하지 않고 보류
    return {"avatar_id": av}


def _submit_cluster(loop, db, cluster, lecture_id, instructor_id) -> bool:
    """클러스터 대표 질문 답변을 TTS→HeyGen 제출. 성공 시 True.

    대표 행은 heygen_job_id 를 받고, 모든 멤버는 같은 cluster_key + status=rendering.
    """
    from app.services.pipeline import s3 as s3_svc
    from app.services.pipeline.heygen import create_video

    rep = cluster.representative()
    answer = (rep.answer_text or "").strip()
    if not answer:
        logger.warning("Q&A 배치: 대표 답변이 비어 렌더 건너뜀 — cache_id=%s", rep.id)
        return False
    answer = answer[: settings.QA_AVATAR_MAX_ANSWER_CHARS]

    cfg = _lecture_voice_settings(db, lecture_id, instructor_id)

    # 렌더 캐릭터 결정 — 본인 제작 아바타면 talking_photo, 표준이면 avatar.
    # rendering 으로 전이하기 전에 판정해, 본인 아바타 미준비 시 pending 을 유지한다.
    from app.models.lecture import Lecture as _Lecture
    from app.models.user import User as _User

    _lecture = db.query(_Lecture).filter(_Lecture.id == lecture_id).first()
    _professor = db.query(_User).filter(_User.id == instructor_id).first()
    character = _resolve_character(db, loop, _lecture, _professor)
    if character is None:
        logger.info(
            "Q&A 배치: 본인 아바타 미준비(룩 not ready 등) — 렌더 보류(pending 유지): cache_id=%s",
            rep.id,
        )
        return False

    cluster_key = uuid.uuid4().hex

    # 멤버 전체를 같은 클러스터로 묶고 rendering 으로 전이(대표만 이후 heygen_job_id).
    for m in cluster.members:
        m.cluster_key = cluster_key
        m.status = qa_avatar.STATUS_RENDERING
    db.flush()

    try:
        if settings.HEYGEN_MOCK:
            # MOCK: 외부 호출 0 — TTS/S3 생략하고 placeholder audio_url 로 제출.
            heygen_audio_url = _MOCK_AUDIO_URL
        else:
            from app.services.pipeline.tts import synthesize

            tts = loop.run_until_complete(
                synthesize(
                    answer,
                    voice_id=cfg["voice_id"],
                    gender=cfg["voice_gender"],
                    speed=cfg["voice_speed"],
                    cloned=cfg["is_cloned"],
                )
            )
            audio_url = s3_svc.upload_audio_bytes(tts.audio_bytes, f"qa_{rep.id}")
            heygen_audio_url = s3_svc.presign_stored_s3_url(audio_url, expiration=86400)

        job_id = loop.run_until_complete(
            create_video(
                audio_url=heygen_audio_url,
                gender=cfg["voice_gender"],
                callback_id=str(rep.id),
                avatar_scale=cfg["avatar_scale"],
                **character,
            )
        )
        rep.heygen_job_id = job_id
        db.flush()
        logger.info(
            "Q&A 배치 렌더 제출: cache_id=%s, cluster=%s, size=%d, job=%s",
            rep.id, cluster_key, cluster.size, job_id,
        )
        return True
    except Exception as exc:  # noqa: BLE001 — 한 클러스터 실패가 배치 전체를 막지 않게.
        logger.error("Q&A 배치 렌더 제출 실패: cache_id=%s, error=%s", rep.id, exc)
        _mark_cluster_failed(db, cluster_key, str(exc))
        return False


# ── 완료 폴링 ─────────────────────────────────────────────────────────────────


def _mark_cluster_ready(db, rep, s3_url, duration) -> None:
    rep.status = qa_avatar.STATUS_READY
    rep.s3_video_url = s3_url
    rep.duration_seconds = duration
    if rep.cluster_key:
        siblings = db.query(QAAnswerCache).filter(
            QAAnswerCache.cluster_key == rep.cluster_key,
            QAAnswerCache.id != rep.id,
        ).all()
        for s in siblings:
            s.status = qa_avatar.STATUS_READY
            s.s3_video_url = s3_url
            s.duration_seconds = duration
    db.flush()


def _mark_cluster_failed(db, cluster_key, error: str | None) -> None:
    if not cluster_key:
        return
    rows = db.query(QAAnswerCache).filter(
        QAAnswerCache.cluster_key == cluster_key
    ).all()
    for r in rows:
        r.status = qa_avatar.STATUS_FAILED
        r.error_message = (error or "")[:1000]
    db.flush()


def _poll_inflight(loop, db) -> tuple[int, int]:
    """status=rendering 인 대표 행(heygen_job_id 보유)을 폴링해 ready/failed 로 전이."""
    from app.services.pipeline import s3 as s3_svc
    from app.services.pipeline.heygen import get_video_status

    reps = db.query(QAAnswerCache).filter(
        QAAnswerCache.status == qa_avatar.STATUS_RENDERING,
        QAAnswerCache.heygen_job_id.isnot(None),
    ).all()
    completed = failed = 0
    for rep in reps:
        try:
            status_data = loop.run_until_complete(get_video_status(rep.heygen_job_id))
        except Exception as exc:  # noqa: BLE001 — 다음 배치에서 재시도.
            logger.warning("Q&A 배치 폴링 실패(다음 배치 재시도): cache_id=%s, error=%s", rep.id, exc)
            continue

        video_url = status_data.get("video_url")
        if status_data.get("status") == "completed" and (video_url or settings.HEYGEN_MOCK):
            duration = status_data.get("duration")
            if settings.HEYGEN_MOCK:
                s3_url = video_url or f"mock://qa_clip/{rep.id}.mp4"
            else:
                if not video_url:
                    continue
                s3_url, _ = loop.run_until_complete(
                    s3_svc.upload_from_url(video_url, str(rep.lecture_id))
                )
            _mark_cluster_ready(db, rep, s3_url, duration)
            completed += 1
        elif status_data.get("status") == "failed":
            _mark_cluster_failed(db, rep.cluster_key, status_data.get("error", "HeyGen Q&A 렌더 실패"))
            failed += 1
    return completed, failed


# ── 배치 본체 ─────────────────────────────────────────────────────────────────


def _lecture_renders_used_this_month(db, lecture_id) -> int:
    """이번 달 해당 강의(영상)에 이미 제출된 Q&A 아바타 렌더 수.

    09 §5: "아바타 Q&A 영상당 렌더 = 영상 전체에서 3렌더". 교수자 월 한도(6)와 별개로
    한 영상이 여러 밤의 배치에 걸쳐 3렌더를 초과하지 않도록 영상 단위로도 막는다.
    교수자 한도(budget.qa_renders_used_this_month)와 동일 기준 — 대표 행(heygen_job_id
    보유)만 세고, 실패도 포함(이미 제출·과금됐을 수 있음)해 재시도 폭주를 막는다.
    """
    from sqlalchemy import func, select

    from app.services.pipeline.budget import _month_start

    total = db.execute(
        select(func.count(QAAnswerCache.id)).where(
            QAAnswerCache.lecture_id == lecture_id,
            QAAnswerCache.heygen_job_id.isnot(None),
            QAAnswerCache.created_at >= _month_start(),
        )
    ).scalar()
    return int(total or 0)


def _submit_pending(loop, db) -> int:
    """pending 질문을 강의별 클러스터링 → 상위 N 렌더 제출. 제출 건수 반환."""
    pending = db.query(QAAnswerCache).filter(
        QAAnswerCache.status == qa_avatar.STATUS_PENDING
    ).all()
    if not pending:
        return 0

    by_instructor: dict = defaultdict(list)
    for r in pending:
        by_instructor[r.instructor_id].append(r)

    submitted = 0
    for instructor_id, rows in by_instructor.items():
        from app.services.pipeline.budget import qa_render_quota_remaining

        remaining = qa_render_quota_remaining(db, instructor_id)
        if remaining <= 0:
            logger.info("Q&A 배치: 교수자 월 렌더 한도 소진 — 건너뜀: instructor=%s", instructor_id)
            continue

        by_lecture: dict = defaultdict(list)
        for r in rows:
            by_lecture[r.lecture_id].append(r)

        for lecture_id, lrows in by_lecture.items():
            if remaining <= 0:
                break
            # 영상 단위 한도(09 §5: 영상당 3렌더) — 여러 밤 배치 누적분까지 합산해,
            # 인기 영상 하나가 교수자 월 한도(6)를 독식하며 "영상당 3"을 넘지 않게 한다.
            lecture_remaining = max(
                0,
                settings.QA_AVATAR_TOP_CLUSTERS - _lecture_renders_used_this_month(db, lecture_id),
            )
            if lecture_remaining <= 0:
                logger.info(
                    "Q&A 배치: 영상 월 렌더 한도(영상당 %d) 소진 — 건너뜀: lecture=%s",
                    settings.QA_AVATAR_TOP_CLUSTERS, lecture_id,
                )
                continue
            clusters = qa_avatar.cluster_pending(lrows)
            eligible = [
                c for c in clusters
                if c.size >= settings.QA_AVATAR_MIN_CLUSTER_SIZE
                and qa_avatar._to_list(c.representative().question_embedding)
            ]
            eligible.sort(key=lambda c: c.size, reverse=True)
            chosen = eligible[: min(settings.QA_AVATAR_TOP_CLUSTERS, remaining, lecture_remaining)]
            for cluster in chosen:
                try:
                    assert_qa_render_budget(db, instructor_id)
                except BudgetExceededError as exc:
                    logger.warning("Q&A 배치 예산 차단(교수자 중단): instructor=%s, %s", instructor_id, exc)
                    remaining = 0
                    break
                if _submit_cluster(loop, db, cluster, lecture_id, instructor_id):
                    submitted += 1
                    remaining -= 1
    return submitted


def process_qa_avatar_batch(db, loop) -> dict:
    """배치 1회: 진행 중 폴링 → 신규 제출 → 재폴링(MOCK 즉시 완료 흡수).

    실 모드에서 마지막 재폴링은 갓 제출한 렌더가 아직 진행 중이라 대부분 no-op 이고,
    다음 야간 배치가 완료를 회수한다. MOCK 은 get_video_status 가 즉시 completed 를
    주므로 같은 실행에서 pending → ready 까지 도달한다.
    """
    pre_done, pre_fail = _poll_inflight(loop, db)
    submitted = _submit_pending(loop, db)
    post_done, post_fail = _poll_inflight(loop, db)
    db.commit()
    result = {
        "submitted": submitted,
        "completed": pre_done + post_done,
        "failed": pre_fail + post_fail,
    }
    logger.info("Q&A 아바타 배치 완료: %s", result)
    return result


@celery.task(name="app.tasks.qa_batch.run_qa_avatar_batch")
def run_qa_avatar_batch() -> dict:
    """야간 배치 엔트리포인트(celery beat). 세션·이벤트루프 수명 관리만 담당."""
    db = SyncSessionLocal()
    loop = asyncio.new_event_loop()
    try:
        return process_qa_avatar_batch(db, loop)
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.error("Q&A 아바타 배치 실패: %s", exc)
        return {"submitted": 0, "completed": 0, "failed": 0, "error": str(exc)}
    finally:
        loop.close()
        db.close()
