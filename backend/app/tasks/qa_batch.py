"""아바타 Q&A 야간 배치 (docs/planning/08 §5, 09 §5 — Phase 2).

실시간 HeyGen 렌더는 **금지**(지연 → 학습자 이탈). 학생 질문은 항상 즉시 RAG
텍스트로 답하고(api/v1/qa.py), 미적중 질문은 status=pending 으로 적립된다. 이
배치가 야간에:

1. pending 질문을 임베딩 클러스터링 → 강의별 상위 N개 클러스터만 선정.
2. 대표 질문 답변을 TTS → HeyGen 720p 렌더 제출(status=rendering).
3. **자체 폴링**으로 완료 감지(창1 webhooks/polling 비의존) → S3 이전 → status=ready.
   클러스터 형제 행은 같은 클립(s3_video_url)을 공유.

비용 통제: 교수자당 월 한도(배포된 강의 단위, 베타 8강의·budget.assert_qa_render_budget)
+ 영상당 3렌더 + 전역 $ 서킷 브레이커. MOCK 모드면 외부 호출 없이 전 경로 통과(비용 ₩0).
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

    정본(_ensure_photo_avatar_id)과 동작을 일치시킨다:
    - 현재 기본 룩의 talking photo 가 이미 있으면(``photo_avatar_look_id == look_id``)
      재사용한다(중복 등록·HeyGen Photo Avatar 한도 누적 방지).
    - 룩이 바뀌었으면 이전 talking photo 를 먼저 삭제해 한도 슬롯을 회수한 뒤, 새로
      등록한다. 등록은 ``_register_talking_photo_with_cleanup`` 로 수행해 한도 초과
      (code 401028) 시 오래된 talking photo 를 자동 정리·재시도한다(self-healing).
    - 등록 성공 시 ``photo_avatar_look_id`` 도 함께 갱신해 다음 호출의 재사용 판정을
      정확히 한다.

    룩이 ready 가 아니거나 끝내 등록에 실패하면 기존 photo_avatar_id(없으면 None)를
    돌려준다. seed 즉시 렌더 경로(_render_seed_questions)는 None 이면 해당 카드를
    failed 로 표시해 교수자에게 사유를 알린다(무한 "대기" 방지).

    [수정 배경 2026-06-08] 종전 동기판은 정본과 달리 한도 슬롯 회수·self-healing 없이
    bare ``upload_talking_photo`` 를 호출해, 미리보기를 만든 적 없어 photo_avatar_id 가
    아직 비어 있고 HeyGen 계정이 3개 한도에 도달한 교수자의 경우 등록이 조용히 실패→
    seed 카드가 영구 "대기" 로 고착됐다. 정본과 동일 헬퍼를 써 이를 해소한다.
    """
    if professor is None:
        return None
    if settings.HEYGEN_MOCK:
        # MOCK: 외부 호출 0 — 있으면 그대로, 없으면 placeholder(create_video MOCK 가 무시).
        return professor.photo_avatar_id or "mock_talking_photo"

    look_id = professor.photo_avatar_default_look_id

    # 현재 등록된 talking photo 가 현재 기본 룩의 것이면 재사용(중복 등록·한도 누적 방지).
    # 기본 룩 미지정(레거시)인데 photo_avatar_id 가 있으면 그것을 그대로 쓴다.
    if professor.photo_avatar_id and (
        not look_id or professor.photo_avatar_look_id == look_id
    ):
        return professor.photo_avatar_id
    if not look_id:
        return professor.photo_avatar_id  # 룩도 캐시도 없으면 None

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
        # 새 룩을 만들 수 없으면 기존 talking photo 라도 유지(있으면, 없으면 None).
        return professor.photo_avatar_id

    from urllib.parse import urlparse

    from app.api.v1.avatars import _register_talking_photo_with_cleanup
    from app.services.pipeline import s3 as s3_svc
    from app.services.pipeline.heygen import delete_talking_photo

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
        # 룩이 바뀌어 새로 만들기 전에 이전 talking photo 를 먼저 지워 한도 슬롯을 회수.
        old_id = professor.photo_avatar_id
        if old_id:
            try:
                loop.run_until_complete(delete_talking_photo(old_id))
            except Exception:  # noqa: BLE001 — 회수는 best-effort
                logger.warning("Q&A 배치: 이전 talking photo 삭제 실패(무시): %s", old_id)
        # 한도(401028) 자가 회복 등록 — 정본과 동일 헬퍼.
        tp = loop.run_until_complete(
            _register_talking_photo_with_cleanup(img_bytes, ctype, keep_id=None)
        )
    except Exception as exc:  # noqa: BLE001
        # 등록 실패(HeyGen "사진 아바타 3개 한도" 401028 등) → None 을 반환해 호출부
        # (_resolve_character)가 **표준 아바타로 폴백**하게 한다. 종전엔 기존
        # photo_avatar_id 를 돌려줬는데, 그 id 가 (대시보드에서 삭제돼) 무효면 그걸로
        # 렌더하다 또 실패했다. 한도가 풀리거나 본인 얼굴이 다시 등록되면 그때부터
        # 본인 얼굴로 돌아온다.
        logger.warning(
            "Q&A 배치: talking_photo 등록 실패 → 표준 아바타 폴백 — instructor=%s, look=%s, error=%s",
            professor.id, look_id, exc,
        )
        return None

    professor.photo_avatar_id = tp
    professor.photo_avatar_look_id = look_id
    db.commit()
    logger.info(
        "Q&A 배치: talking_photo 등록(self-healing) — instructor=%s, talking_photo_id=%s",
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
        # 본인 얼굴(Talking Photo)을 못 만드는 경우(HeyGen "사진 아바타 3개 한도"
        # 401028, 룩 미준비 등) Q&A 를 막지 말고 **표준 아바타로 폴백**해 답변 영상은
        # 나오게 한다(얼굴만 일반 아바타). 표준 아바타는 photo-avatar 한도와 무관.
        # 한도가 풀리거나 본인 얼굴이 다시 등록되면 그 다음 렌더부터 본인 얼굴로 돌아온다.
        from app.services.pipeline.heygen import pick_avatar_id

        gender = (
            lecture.voice_gender.value
            if lecture and hasattr(lecture.voice_gender, "value")
            else (str(lecture.voice_gender) if lecture and lecture.voice_gender else None)
        )
        fallback = (pick_avatar_id(gender) or "").strip()
        if fallback:
            logger.warning(
                "Q&A: 본인 아바타 미확보 → 표준 아바타로 폴백 렌더(instructor=%s)",
                getattr(professor, "id", None),
            )
            return {"avatar_id": fallback}
        return None  # 표준 아바타도 없으면(env 미설정) 보류
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
    """pending 질문을 강의별 클러스터링 → 상위 N 렌더 제출. 제출 건수 반환.

    학생 적립(origin=student)만 클러스터링 대상이다. 교수자 사전 질문
    (origin=instructor_seed)은 영상 생성(approve) 시 render_seed_questions 가 즉시
    렌더하므로, 야간 클러스터링에서는 제외한다.
    """
    pending = db.query(QAAnswerCache).filter(
        QAAnswerCache.status == qa_avatar.STATUS_PENDING,
        QAAnswerCache.origin == qa_avatar.ORIGIN_STUDENT,
    ).all()
    if not pending:
        return 0

    by_instructor: dict = defaultdict(list)
    for r in pending:
        by_instructor[r.instructor_id].append(r)

    submitted = 0
    for instructor_id, rows in by_instructor.items():
        from app.services.pipeline.budget import qa_can_render_lecture

        by_lecture: dict = defaultdict(list)
        for r in rows:
            by_lecture[r.lecture_id].append(r)

        for lecture_id, lrows in by_lecture.items():
            # 교수자 월 한도는 '배포(is_published)된 강의' 단위 — 이 강의에 새 렌더
            # 여지가 없으면 건너뛴다(이미 한도 집합에 든 강의·무제한 계정은 통과).
            if not qa_can_render_lecture(db, instructor_id, lecture_id):
                logger.info(
                    "Q&A 배치: 교수자 월 강의 한도 소진 — 건너뜀: instructor=%s, lecture=%s",
                    instructor_id, lecture_id,
                )
                continue
            # 영상 단위 한도(09 §5: 영상당 3렌더) — 여러 밤 배치 누적분까지 합산해,
            # 한 영상이 "영상당 3"을 넘지 않게 한다.
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
            chosen = eligible[: min(settings.QA_AVATAR_TOP_CLUSTERS, lecture_remaining)]
            for cluster in chosen:
                try:
                    assert_qa_render_budget(db, instructor_id, lecture_id)
                except BudgetExceededError as exc:
                    logger.warning(
                        "Q&A 배치 예산 차단: instructor=%s, lecture=%s, %s",
                        instructor_id, lecture_id, exc,
                    )
                    break
                if _submit_cluster(loop, db, cluster, lecture_id, instructor_id):
                    submitted += 1
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


# ── 교수자 사전 질문(instructor_seed) 즉시 렌더 ───────────────────────────────────
#
# 학생 질문 축적을 기다리는 야간 배치와 달리, 교수자가 영상당 ≤3개 등록한 예상
# 질문(origin=instructor_seed)은 영상 생성(approve) 시점에 곧바로 렌더해 첫 학생
# 질문부터 아바타 답변이 나오게 한다(08 §5, 09 §5). RAG 범위 밖 질문은 렌더하지
# 않고 failed 로 표시한다. 클러스터링은 거치지 않고 질문 1건 = 렌더 1건이지만,
# 영상당 렌더 한도(QA_AVATAR_TOP_CLUSTERS)·교수자 월 한도는 야간 배치와 동일하게
# 강제한다(_submit_cluster / assert_qa_render_budget 재사용).


def _seed_still_rendering(db, lecture_id) -> int:
    """해당 강의의 instructor_seed 행 중 아직 status=rendering 인 수."""
    return db.query(QAAnswerCache).filter(
        QAAnswerCache.lecture_id == lecture_id,
        QAAnswerCache.origin == qa_avatar.ORIGIN_SEED,
        QAAnswerCache.status == qa_avatar.STATUS_RENDERING,
    ).count()


def _render_seed_questions(db, loop, lecture_id, instructor_id) -> dict:
    """교수자 사전 질문(pending)을 RAG로 답변 생성 → 렌더 제출. 제출/실패 수 반환.

    한도 = 영상당 남은 렌더(클립). 단, 교수자 월 '배포 강의' 한도에서 이 강의에 새
    렌더 여지가 없으면 0(제출 안 함). 범위 밖 질문은 렌더 없이 failed 로 표시(한도
    미소모). 예산 차단 시 중단.
    """
    from app.models.lecture import Lecture
    from app.services.pipeline.budget import (
        QARenderQuotaError,
        instructor_has_unlimited_qa,
        qa_can_render_lecture,
    )
    from app.services.pipeline.qa import generate_seed_answer

    # pending + **failed** 를 함께 가져온다. 실패한 질문도 "다시 제작" 시 재시도해야
    # 하는데, 종전엔 pending 만 조회해 한 번 failed 가 되면 영영 재시도되지 않았다
    # (원인이 해소돼도 — 예: HeyGen 한도 정리·본인 아바타 재등록 — 그대로 '실패' 고착).
    # failed 행은 상태/사유를 초기화(pending)해 새로 시도한다. ready/rendering 은 제외.
    rows = db.query(QAAnswerCache).filter(
        QAAnswerCache.lecture_id == lecture_id,
        QAAnswerCache.origin == qa_avatar.ORIGIN_SEED,
        QAAnswerCache.status.in_(
            [qa_avatar.STATUS_PENDING, qa_avatar.STATUS_FAILED]
        ),
    ).all()
    for _r in rows:
        if _r.status == qa_avatar.STATUS_FAILED:
            _r.status = qa_avatar.STATUS_PENDING
            _r.error_message = None
    if rows:
        db.commit()

    # 렌더 한도 계산.
    #  - 무제한 계정(QA_AVATAR_UNLIMITED_EMAILS, 계정주 포함)은 강의당 월 캡도 면제 —
    #    등록된 사전 질문을 전부 렌더한다. (종전엔 무제한이어도 강의당 캡(=3)에 걸려,
    #    같은 강의를 반복 제작하면 캡 소진 → 질문이 영구 '대기'로 방치되는 버그가 있었다.)
    #  - 일반 계정: 영상당 남은 렌더(클립 수) = 강의당 월 캡 − 이번 달 이 강의 렌더 수.
    #    교수자 월 '강의' 한도에서 새 렌더 여지가 없으면 0.
    if instructor_has_unlimited_qa(db, instructor_id):
        limit = len(rows)
    elif qa_can_render_lecture(db, instructor_id, lecture_id):
        limit = settings.QA_AVATAR_TOP_CLUSTERS - _lecture_renders_used_this_month(db, lecture_id)
    else:
        limit = 0

    # 한도가 0 이하인데 대기 질문이 있으면 — 조용히 '대기'로 방치하지 말고(피드백 0이
    # 가장 혼란) 명확한 사유로 failed 표시한다. (무제한 계정은 limit=len(rows)>0 이라
    # 여기 안 걸린다.)
    if rows and limit <= 0:
        for row in rows:
            row.status = qa_avatar.STATUS_FAILED
            row.error_message = (
                "이번 달 추천 질문 제작 한도를 모두 사용했어요. 다음 달에 다시 "
                "시도하거나 관리자에게 한도 상향을 문의해 주세요."
            )
        db.commit()
        logger.warning(
            "Q&A 사전질문: 렌더 한도 0 — seed %d개 failed(한도) 표시: "
            "lecture=%s, instructor=%s",
            len(rows), lecture_id, instructor_id,
        )
        return {"submitted": 0, "failed": len(rows)}

    lecture = db.get(Lecture, lecture_id)
    task_id = lecture.pipeline_task_id if lecture else None

    # 본인 아바타(Talking Photo) 사전 확보 — 교수자 트리거 렌더이므로, 끝내 못 만들면
    # seed 카드를 영구 "대기"로 두지 않고 즉시 failed + 사유로 표시한다(피드백 필수).
    # _ensure_talking_photo_sync 가 한도(401028) self-healing 까지 시도한 뒤에도 None 이면
    # 본인 얼굴을 등록할 수 없는 상태다(룩 미준비·HeyGen 등록 실패 등).
    # (limit<=0 인 경우는 위에서 이미 failed 로 처리·return 했으므로 여기는 limit>0.)
    if rows and limit > 0:
        from app.models.user import User as _User

        professor = db.query(_User).filter(_User.id == instructor_id).first()
        if _resolve_character(db, loop, lecture, professor) is None:
            for row in rows:
                row.status = qa_avatar.STATUS_FAILED
                row.error_message = (
                    "본인 아바타를 준비하지 못했습니다. 아바타 페이지에서 ‘움직이는 "
                    "미리보기’를 한 번 생성해 본인 얼굴을 등록한 뒤 다시 시도해 주세요."
                )
            db.commit()
            logger.warning(
                "Q&A 사전질문: 본인 아바타 미확보 — seed %d개 failed 표시: "
                "lecture=%s, instructor=%s",
                len(rows), lecture_id, instructor_id,
            )
            return {"submitted": 0, "failed": len(rows)}

    submitted = failed = 0
    for row in rows:
        if submitted >= limit:
            break  # 영상/교수자 렌더 한도 도달 — 나머지는 pending 유지.

        # 하이브리드: 교수자가 입력한 사전 대답이 있으면 그대로 쓰고, 비어 있으면
        # 강의 자료(PPT) 기반으로 자동 생성한다. generate_seed_answer 는 음성 답변용
        # 표기 규칙(출처 미표기·중국어 괄호 금지)을 적용한다.
        answer = (row.answer_text or "").strip()
        if not answer:
            # 답변은 강의 발화 언어(아바타 발화 내용과 동일)로 생성한다.
            _voice_lang = (lecture.voice_lang if lecture else None) or "ko"
            generated, in_scope = generate_seed_answer(
                db, task_id, row.question_text, lang=_voice_lang
            )
            if not in_scope:
                # 슬라이드/임베딩이 없어 답변을 만들 수 없음(파이프라인 미완 등).
                row.status = qa_avatar.STATUS_FAILED
                row.error_message = "강의 자료를 찾지 못했습니다."
                failed += 1
                continue
            if not generated.strip():
                row.status = qa_avatar.STATUS_FAILED
                row.error_message = "답변 생성 실패"
                failed += 1
                continue
            answer = generated

        row.answer_text = answer[: settings.QA_AVATAR_MAX_ANSWER_CHARS]
        row.question_embedding = qa_avatar.embed_question(row.question_text)

        try:
            assert_qa_render_budget(db, instructor_id, lecture_id)
        except QARenderQuotaError as exc:
            logger.warning(
                "Q&A 사전질문 예산 차단(중단): instructor=%s, lecture=%s, %s",
                instructor_id, lecture_id, exc,
            )
            break

        # 질문 1건 = 단독 클러스터 1렌더. 기존 _submit_cluster 재사용(rendering 전이·제출).
        if _submit_cluster(
            loop, db, qa_avatar.Cluster(members=[row], centroid=[]),
            lecture_id, instructor_id,
        ):
            submitted += 1

    db.commit()
    result = {"submitted": submitted, "failed": failed}
    logger.info(
        "Q&A 사전질문 렌더 제출: lecture=%s, instructor=%s, %s",
        lecture_id, instructor_id, result,
    )
    return result


def _poll_seed_renders(db, loop, lecture_id) -> dict:
    """instructor_seed 렌더 완료를 폴링해 ready/failed 로 전이. 기존 _poll_inflight 재사용.

    _poll_inflight 는 status=rendering 인 모든 대표 행을 폴링하므로 seed/student 를
    가리지 않지만, 같은 클립을 ready 로 굳히는 동작이 동일해 그대로 재사용한다.

    덤으로, heygen_job_id 가 없는 채 rendering 으로 남은 '고아' seed 를 failed 로
    정리한다 — 제출 직전 크래시 등으로 생기며, 웹훅·폴링 어디서도 회수가 안 돼
    무한 'rendering' 이 된다.
    """
    completed, failed = _poll_inflight(loop, db)
    orphaned = (
        db.query(QAAnswerCache)
        .filter(
            QAAnswerCache.lecture_id == lecture_id,
            QAAnswerCache.origin == qa_avatar.ORIGIN_SEED,
            QAAnswerCache.status == qa_avatar.STATUS_RENDERING,
            QAAnswerCache.heygen_job_id.is_(None),
        )
        .all()
    )
    for r in orphaned:
        r.status = qa_avatar.STATUS_FAILED
        r.error_message = "아바타 생성 제출에 실패했어요. 다시 시도해 주세요."
    db.commit()
    return {"completed": completed, "failed": failed + len(orphaned)}


@celery.task(name="app.tasks.qa_batch.render_seed_questions")
def render_seed_questions(lecture_id, instructor_id) -> dict:
    """영상 approve 시 호출(video.approve_video → send_task). 사전 질문 즉시 렌더.

    제출 후 seed 가 rendering 으로 남아 있으면(실 모드는 렌더가 진행 중), 자체
    폴링 태스크(poll_seed_renders)를 예약해 완료를 회수한다.
    """
    loop = asyncio.new_event_loop()
    try:
        with SyncSessionLocal() as db:
            try:
                result = _render_seed_questions(db, loop, lecture_id, instructor_id)
            except Exception as exc:  # noqa: BLE001
                db.rollback()
                logger.error("Q&A 사전질문 렌더 실패: lecture=%s, %s", lecture_id, exc)
                # 렌더가 예외로 중단되면 seed 가 pending/rendering 으로 영원히 남아
                # 프론트가 무한 "생성 중"이 된다. 종료 상태(failed)로 전이해 즉시
                # 피드백을 준다(사용자는 '다시 시도'로 재렌더 가능).
                failed_n = 0
                try:
                    stuck = (
                        db.query(QAAnswerCache)
                        .filter(
                            QAAnswerCache.lecture_id == lecture_id,
                            QAAnswerCache.origin == qa_avatar.ORIGIN_SEED,
                            QAAnswerCache.status.in_(
                                [qa_avatar.STATUS_PENDING, qa_avatar.STATUS_RENDERING]
                            ),
                        )
                        .all()
                    )
                    for r in stuck:
                        r.status = qa_avatar.STATUS_FAILED
                        r.error_message = "아바타 생성 중 오류가 발생했어요. 다시 시도해 주세요."
                    db.commit()
                    failed_n = len(stuck)
                except Exception:  # noqa: BLE001
                    db.rollback()
                return {"submitted": 0, "failed": failed_n, "error": str(exc)}
            still_rendering = _seed_still_rendering(db, lecture_id)
        if still_rendering:
            poll_seed_renders.apply_async((lecture_id,), countdown=30)
        return result
    finally:
        loop.close()


@celery.task(name="app.tasks.qa_batch.poll_seed_renders")
def poll_seed_renders(lecture_id, attempt: int = 0) -> dict:
    """render_seed_questions 가 예약하는 자체 폴링(웹훅 누락 대비 폴백).

    완료될 때까지 30초 간격 재예약(최대 40회=20분). 1차 완료 경로는 HeyGen 웹훅
    (webhooks._handle_seed_clip_webhook)이고, 이 폴링은 웹훅이 유실됐을 때의 안전망.
    """
    loop = asyncio.new_event_loop()
    try:
        with SyncSessionLocal() as db:
            try:
                result = _poll_seed_renders(db, loop, lecture_id)
            except Exception as exc:  # noqa: BLE001
                db.rollback()
                logger.error("Q&A 사전질문 폴링 실패: lecture=%s, %s", lecture_id, exc)
                return {"completed": 0, "failed": 0, "error": str(exc)}
            still_rendering = _seed_still_rendering(db, lecture_id)
        if still_rendering and attempt < 40:
            poll_seed_renders.apply_async((lecture_id, attempt + 1), countdown=30)
        return result
    finally:
        loop.close()
