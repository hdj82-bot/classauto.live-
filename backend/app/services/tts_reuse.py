"""TTS 음원 재사용 — 재제작 시 중복 과금 제거 (스펙 13 §C-5).

**문제**: `services/video.py::approve_video` 는 승인할 때마다 세그먼트별 `VideoRender`
행을 무조건 새로 만든다. `tasks/render.py` 의 TTS idempotency 는 `render_id` 로 S3 키를
만들므로, 새 행이면 항상 "아직 합성 안 됨"이 되어 **아무것도 안 바꾸고 다시 제작해도 전
슬라이드가 재합성·재과금**됐다.

**해결**: 음원을 **내용으로** 식별한다. (강의, 슬라이드, 발화 텍스트, 보이스, 속도)가
같으면 같은 음원이므로 이전 렌더의 것을 그대로 쓴다. 아바타만 바꾸는 재제작은 TTS 비용이
0 이 된다.

안전장치
--------
- **해시 충돌**: 키로 후보를 찾은 뒤 `script_text`·`voice_id`·`voice_speed` 를 **실제로
  다시 비교**한다. SHA-256 충돌 확률은 무시할 수준이지만, 충돌해도 엉뚱한 음원이 나가지
  않도록 최종 판정은 원본 값으로 한다.
- **부동소수**: `voice_speed` 는 float 이라 `1.0` 과 `1.0000001` 이 다른 키가 되면 재사용이
  깨진다. 소수 둘째 자리로 반올림한 **고정 폭 문자열**로 키에 넣는다.
- **S3 유실**: DB 에는 `audio_url` 이 남았는데 객체가 지워졌을 수 있다. 재사용 전에 객체
  존재를 확인하고, 없으면 후보에서 제외해 정상 합성으로 폴백한다.
- **기존 데이터**: `tts_cache_key` 가 NULL 인 과거 행은 후보가 되지 않는다. 배포 후 첫
  재제작에서 한 번 합성되며 키가 찍히고, 그 뒤부터 재사용된다.
"""
from __future__ import annotations

import hashlib
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.video_render import RenderStatus, VideoRender

logger = logging.getLogger(__name__)

# 재사용 후보로 인정할 렌더 상태. 실패·취소된 렌더의 음원은 쓰지 않는다.
_REUSABLE_STATUSES = (
    RenderStatus.ready,
    RenderStatus.tts_processing,
    RenderStatus.rendering,
)


def _normalized_speed(voice_speed: float | None) -> str:
    """부동소수를 키에 넣을 수 있는 고정 표현으로.

    `1.0` 과 `1.0000001` 이 다른 키가 되면 재사용이 조용히 깨진다. 실제 합성에서
    의미 있는 정밀도는 소수 둘째 자리이므로 거기서 끊는다.
    """
    try:
        speed = float(voice_speed if voice_speed is not None else 1.0)
    except (TypeError, ValueError):
        speed = 1.0
    return f"{round(speed, 2):.2f}"


def build_cache_key(
    *,
    lecture_id: uuid.UUID | str | None,
    slide_number: int | None,
    script_text: str | None,
    voice_id: str | None,
    voice_speed: float | None,
) -> str:
    """음원의 내용 기반 키(SHA-256 hex).

    강의·슬라이드까지 넣는 이유: 같은 문장이 다른 강의에 있어도 음원 파일을 공유하면
    한쪽 강의를 지울 때 다른 쪽이 깨진다. 재사용 범위를 강의 안으로 묶어 그 결합을 없앤다.
    """
    # 모든 조각을 명시적으로 str 로 강제한다 — 호출부가 ORM 객체·UUID·Mock 등 무엇을
    # 넘겨도 키 생성이 TypeError 로 렌더를 통째로 실패시키면 안 된다.
    text_hash = hashlib.sha256(str(script_text or "").encode("utf-8")).hexdigest()
    payload = "|".join(
        [
            str(lecture_id or ""),
            str(slide_number if slide_number is not None else -1),
            str(voice_id or ""),
            _normalized_speed(voice_speed),
            text_hash,
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def find_reusable_render(
    db: Session,
    *,
    cache_key: str,
    exclude_render_id: uuid.UUID,
    script_text: str | None,
    voice_id: str | None,
    voice_speed: float | None,
    audio_exists: "callable[[VideoRender], bool]",
) -> VideoRender | None:
    """재사용 가능한 이전 렌더. 없으면 None(= 정상 합성).

    ``audio_exists`` 는 후보의 S3 객체 존재를 확인하는 호출 가능 객체다. S3 접근을
    주입으로 받아 이 함수를 순수하게 유지한다(테스트에서 스텁 가능).
    """
    if not cache_key:
        return None

    candidates = (
        db.execute(
            select(VideoRender)
            .where(
                VideoRender.tts_cache_key == cache_key,
                VideoRender.id != exclude_render_id,
                VideoRender.audio_url.isnot(None),
                VideoRender.status.in_(_REUSABLE_STATUSES),
            )
            .order_by(VideoRender.created_at.desc())
            .limit(5)
        )
        .scalars()
        .all()
    )

    for candidate in candidates:
        # 해시 충돌 방어 — 키가 같아도 원본 값이 다르면 쓰지 않는다.
        if (candidate.script_text or "") != (script_text or ""):
            logger.warning(
                "TTS 캐시 키 충돌 감지 — 원본 텍스트 불일치로 재사용 거부: candidate=%s",
                candidate.id,
            )
            continue
        if (candidate.voice_id or "") != (voice_id or ""):
            continue
        if _normalized_speed(candidate.voice_speed) != _normalized_speed(voice_speed):
            continue
        # S3 객체가 지워졌으면 DB 만 남은 유령이다 — 재합성으로 폴백.
        if not audio_exists(candidate):
            logger.info(
                "TTS 재사용 후보의 S3 객체 없음 — 재합성으로 폴백: candidate=%s",
                candidate.id,
            )
            continue
        return candidate

    return None


def apply_reuse(target: VideoRender, source: VideoRender) -> None:
    """이전 렌더의 음원과 그 부속 메타를 그대로 옮긴다.

    음원만 옮기고 ``subtitle_cues`` 를 빠뜨리면 자막이 글자수 균등분배로 폴백해
    음성과 어긋난다. 같이 옮겨야 한다.
    """
    target.audio_url = source.audio_url
    target.tts_provider = source.tts_provider
    target.voice_id = source.voice_id
    target.voice_speed = source.voice_speed
    target.subtitle_cues = source.subtitle_cues
