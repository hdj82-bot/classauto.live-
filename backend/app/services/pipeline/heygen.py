"""HeyGen API 클라이언트."""
from __future__ import annotations

import logging
import uuid
from typing import Any

import httpx

from app.core.config import settings
from app.core.metrics import track_external_api
from app.core.retry import RetryableHTTPError, request_with_retry

logger = logging.getLogger(__name__)


class HeyGenError(Exception):
    """HeyGen API 호출 실패."""


# ── 비용 추정 ────────────────────────────────────────────────────────────────


def estimate_cost_usd(duration_seconds: float | None) -> float:
    """렌더 결과 영상 길이(초) × ``HEYGEN_COST_USD_PER_SECOND``.

    HeyGen 은 제출 시점에 실제 청구 금액을 알려주지 않으므로 영상 길이 기반
    근사치를 회계에 기록한다. ``duration`` 이 비어있거나 음수면 ``0.0`` 반환
    (cost_log 는 0 행도 기록 — 정산 시점에 실제 청구로 보정).
    """
    if duration_seconds is None or duration_seconds <= 0:
        return 0.0
    return round(duration_seconds * settings.HEYGEN_COST_USD_PER_SECOND, 6)


# ── 내부 헬퍼 ────────────────────────────────────────────────────────────────


def _headers() -> dict[str, str]:
    return {
        "X-Api-Key": settings.HEYGEN_API_KEY,
        "Content-Type": "application/json",
    }


@track_external_api("heygen")
async def _request_with_retry(
    method: str,
    url: str,
    *,
    headers: dict | None = None,
    json: dict | None = None,
    params: dict | None = None,
    timeout: float = 30.0,
) -> httpx.Response:
    """app.core.retry 의 통일 정책(3회·exp backoff·4xx 즉시 raise) 위임.

    이전 구현의 _MAX_RETRIES=3, exp backoff 정책을 그대로 유지하되,
    4xx(429 제외) 는 retry 헬퍼가 즉시 HTTPStatusError 로 띄우므로
    호출부에서 명시적으로 처리한다.
    """
    try:
        return await request_with_retry(
            method,
            url,
            headers=headers or _headers(),
            json=json,
            params=params,
            timeout=timeout,
            label=f"heygen.{method.lower()}",
        )
    except httpx.HTTPStatusError as exc:
        # 4xx(영구 오류)는 retry 대상이 아니므로 응답 그대로 반환해
        # 기존 호출부의 status_code 분기 코드와 호환을 유지한다.
        return exc.response
    except (RetryableHTTPError, httpx.TimeoutException) as exc:
        # 5xx/429/timeout 은 헬퍼가 max 3회 후 마지막 예외를 그대로 raise.
        # 도메인 예외(HeyGenError) 로 래핑해 호출부 호환성을 유지한다.
        raise HeyGenError(f"HeyGen API 최대 재시도 초과: {exc}") from exc


# ── 비디오 생성 ──────────────────────────────────────────────────────────────


def pick_avatar_id(gender: str | None = None) -> str:
    """강의 성별 → HEYGEN_AVATAR_ID_{MALE,FEMALE} 환경변수 매핑.

    gender 가 ``"male"`` | ``"female"`` 이면 해당 ID, 비거나 None 이면 MALE 을 기본.
    _MALE/_FEMALE 가 비어 있으면 deprecated ``HEYGEN_AVATAR_ID`` 로 fallback —
    1단계 단일 ID 운영 환경에서도 호출이 깨지지 않도록.
    VoiceGender enum 도 .value 를 통해 str 로 비교되므로 그대로 받을 수 있다.
    """
    g = (str(gender) if gender is not None else "male").strip().lower()
    if g == "female":
        primary = settings.HEYGEN_AVATAR_ID_FEMALE
    else:
        primary = settings.HEYGEN_AVATAR_ID_MALE
    return (primary or settings.HEYGEN_AVATAR_ID or "").strip()


async def create_video(
    audio_url: str,
    avatar_id: str | None = None,
    gender: str | None = None,
    callback_id: str | None = None,
    talking_photo_id: str | None = None,
    avatar_scale: float | None = None,
) -> str:
    """HeyGen v2 API로 아바타 립싱크 비디오 생성 요청. video_id를 반환.

    talking_photo_id: 교수자 본인 사진으로 등록한 Talking Photo. 주어지면
        avatar 대신 ``character.type="talking_photo"`` 로 본인 모습 영상을 만든다
        (본인 아바타 1차 범위의 후속 연결 지점 — 현재 호출자는 미사용).
    avatar_id: 명시 시 그것 우선(custom 아바타 등), 아니면 ``pick_avatar_id(gender)``.
    gender:    ``"male"`` | ``"female"`` — avatar_id 가 None 일 때 _MALE/_FEMALE 분기 키.
    avatar_scale: 프레임 안에서 아바타가 차지하는 크기 배율. None 또는 1.0 이면
        기본 크기. 1.0 미만이면 작아지고(배경 여백 늘어남) 초과면 커진다. HeyGen
        character.scale 로 전달하며 [0.3, 2.0] 으로 클램프한다(avatar/talking_photo
        공통).
    """
    if settings.HEYGEN_MOCK:
        mock_id = f"mock_{uuid.uuid4().hex}"
        logger.warning(
            "[HEYGEN_MOCK] create_video 실제 API 호출 생략 — mock video_id=%s, callback_id=%s",
            mock_id, callback_id,
        )
        return mock_id

    if talking_photo_id:
        character: dict[str, Any] = {
            "type": "talking_photo",
            "talking_photo_id": talking_photo_id,
        }
        character_label = f"talking_photo:{talking_photo_id}"
    else:
        avatar = avatar_id or pick_avatar_id(gender)
        character = {"type": "avatar", "avatar_id": avatar, "avatar_style": "normal"}
        character_label = f"avatar:{avatar}"

    # 아바타 크기 배율 — 기본(1.0/None)이 아닐 때만 character.scale 을 실어
    # 기존 호출의 페이로드를 그대로 유지한다. 유효범위 [0.3, 2.0] 로 클램프.
    if avatar_scale is not None and abs(avatar_scale - 1.0) > 1e-6:
        character["scale"] = max(0.3, min(2.0, float(avatar_scale)))
    url = f"{settings.HEYGEN_BASE_URL}/v2/video/generate"
    payload = {
        "video_inputs": [
            {
                "character": character,
                "voice": {"type": "audio", "audio_url": audio_url},
            }
        ],
        "dimension": {
            "width": settings.HEYGEN_DIMENSION_WIDTH,
            "height": settings.HEYGEN_DIMENSION_HEIGHT,
        },
        "callback_id": callback_id or "",
        "callback_url": settings.HEYGEN_CALLBACK_URL,
    }

    logger.info("HeyGen 비디오 생성 요청: %s, callback_id=%s", character_label, callback_id)
    resp = await _request_with_retry("POST", url, json=payload)

    if resp.status_code != 200:
        logger.error("HeyGen 비디오 생성 실패: status=%d, body=%s", resp.status_code, resp.text[:500])
        raise HeyGenError(f"HeyGen API 오류 [{resp.status_code}]: {resp.text}")

    data = resp.json().get("data", {})
    video_id = data.get("video_id")
    if not video_id:
        logger.error("HeyGen 응답에 video_id 없음: %s", resp.text[:500])
        raise HeyGenError(f"HeyGen 응답에 video_id 없음: {resp.text}")

    logger.info("HeyGen 비디오 생성 요청 완료: video_id=%s", video_id)
    return video_id


# ── 비디오 상태 조회 ─────────────────────────────────────────────────────────


async def get_video_status(video_id: str) -> dict:
    """HeyGen 비디오 상태 조회 (폴링용)."""
    if settings.HEYGEN_MOCK:
        # mock 잡은 즉시 완료로 응답. HEYGEN_MOCK_VIDEO_URL 이 비어 있으면
        # 폴링/웹훅이 완료 처리를 건너뛴다(실 비용·실 다운로드 없음). duration 0 → 비용 0.
        return {
            "status": "completed",
            "video_url": settings.HEYGEN_MOCK_VIDEO_URL or None,
            "duration": 0.0,
            "error": None,
        }
    url = f"{settings.HEYGEN_BASE_URL}/v1/video_status.get"
    params = {"video_id": video_id}

    resp = await _request_with_retry("GET", url, params=params, timeout=30.0)

    if resp.status_code != 200:
        logger.error("HeyGen 상태 조회 실패: video_id=%s, status=%d", video_id, resp.status_code)
        raise HeyGenError(f"HeyGen 상태 조회 오류 [{resp.status_code}]: {resp.text}")

    data = resp.json().get("data", {})
    status = data.get("status", "unknown")
    logger.debug("HeyGen 상태 조회: video_id=%s, status=%s", video_id, status)
    return {
        "status": status,
        "video_url": data.get("video_url"),
        "duration": data.get("duration"),
        "error": data.get("error"),
    }


# ── 아바타 목록 조회 ─────────────────────────────────────────────────────────


async def list_avatars() -> list[dict[str, Any]]:
    """사용 가능한 아바타 목록 조회."""
    url = f"{settings.HEYGEN_BASE_URL}/v2/avatars"

    resp = await _request_with_retry("GET", url, timeout=30.0)

    if resp.status_code != 200:
        raise HeyGenError(f"HeyGen 아바타 조회 오류 [{resp.status_code}]: {resp.text}")

    data = resp.json().get("data", {})
    avatars = data.get("avatars", [])

    return [
        {
            "avatar_id": a.get("avatar_id"),
            "avatar_name": a.get("avatar_name"),
            "gender": a.get("gender"),
            "preview_image_url": a.get("preview_image_url"),
            "preview_video_url": a.get("preview_video_url"),
        }
        for a in avatars
    ]


# ── Talking Photo (본인 사진 아바타) ─────────────────────────────────────────


async def upload_talking_photo(
    image_bytes: bytes, content_type: str = "image/jpeg"
) -> str:
    """교수자 사진을 HeyGen 에 Talking Photo asset 으로 업로드. talking_photo_id 반환.

    HeyGen 업로드 엔드포인트는 별도 호스트(``upload.heygen.com``)이고 raw 이미지
    바이트를 그대로 본문에 싣는다(JSON 아님). 그래서 공통 ``_request_with_retry``
    (JSON 전용) 대신 httpx 로 직접 호출한다. 성공 시 응답의
    ``data.talking_photo_id`` 를 반환하고, 실패는 HeyGenError 로 래핑한다.
    """
    url = "https://upload.heygen.com/v1/talking_photo"
    headers = {
        "X-Api-Key": settings.HEYGEN_API_KEY,
        "Content-Type": content_type,
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, headers=headers, content=image_bytes)
    except httpx.HTTPError as exc:
        raise HeyGenError(f"HeyGen Talking Photo 업로드 통신 오류: {exc}") from exc

    if resp.status_code != 200:
        raise HeyGenError(
            f"HeyGen Talking Photo 업로드 오류 [{resp.status_code}]: {resp.text[:300]}"
        )

    data = resp.json().get("data", {})
    talking_photo_id = data.get("talking_photo_id") or data.get("id")
    if not talking_photo_id:
        raise HeyGenError(
            f"HeyGen Talking Photo 응답에 talking_photo_id 없음: {resp.text[:300]}"
        )
    logger.info("HeyGen Talking Photo 등록 완료: %s", talking_photo_id)
    return talking_photo_id


async def delete_talking_photo(talking_photo_id: str) -> bool:
    """HeyGen Photo Avatar(Talking Photo) 삭제 (best-effort) — 슬롯 회수용.

    HeyGen 계정의 Photo Avatar 한도(플랜별, 흔히 3개)를 넘지 않도록, 새 룩의
    Talking Photo 를 만들기 전에 이전 것을 지운다(code 401028 "exceeded your limit of
    3 photo avatars" 방지). 실패해도(엔드포인트 차이·이미 삭제됨·통신 오류) 호출자는
    계속 진행하므로 예외 대신 bool 을 반환한다.
    """
    if not talking_photo_id:
        return False
    if settings.HEYGEN_MOCK:
        logger.warning("[HEYGEN_MOCK] delete_talking_photo 생략: %s", talking_photo_id)
        return True
    url = f"{settings.HEYGEN_BASE_URL}/v2/photo_avatar/{talking_photo_id}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.delete(url, headers=_headers())
    except httpx.HTTPError as exc:
        logger.warning(
            "HeyGen Talking Photo 삭제 통신 오류: %s — %s", talking_photo_id, exc
        )
        return False
    if resp.status_code not in (200, 204):
        logger.warning(
            "HeyGen Talking Photo 삭제 실패 [%d]: %s — %s",
            resp.status_code, talking_photo_id, resp.text[:200],
        )
        return False
    logger.info("HeyGen Talking Photo 삭제: %s", talking_photo_id)
    return True


# ── 비디오 삭제 ──────────────────────────────────────────────────────────────


async def cancel_video(video_id: str) -> bool:
    """진행 중인 HeyGen 비디오 잡 취소 (best-effort).

    Lecture 삭제 등으로 더 이상 결과가 필요 없는 잡을 정리한다. 실패해도
    호출자(예: lecture DELETE)는 진행을 멈추지 않으므로 예외 대신 bool 반환.
    HeyGen v1 API 의 video.delete 엔드포인트가 PROCESSING 상태 잡도 처리한다.
    """
    if settings.HEYGEN_MOCK:
        logger.warning("[HEYGEN_MOCK] cancel_video 실제 호출 생략: %s", video_id)
        return True
    url = f"{settings.HEYGEN_BASE_URL}/v1/video.delete"
    payload = {"video_ids": [video_id]}

    try:
        resp = await _request_with_retry("POST", url, json=payload, timeout=30.0)
        if resp.status_code == 200:
            logger.info("HeyGen 비디오 취소 완료: %s", video_id)
            return True
        logger.warning("HeyGen 비디오 취소 실패 [%d]: %s", resp.status_code, resp.text)
        return False
    except HeyGenError as exc:
        logger.error("HeyGen 비디오 취소 오류: %s — %s", video_id, exc)
        return False


async def delete_video(video_id: str) -> bool:
    """HeyGen 비디오 삭제."""
    if settings.HEYGEN_MOCK:
        logger.warning("[HEYGEN_MOCK] delete_video 실제 호출 생략: %s", video_id)
        return True
    url = f"{settings.HEYGEN_BASE_URL}/v1/video.delete"
    payload = {"video_ids": [video_id]}

    try:
        resp = await _request_with_retry("POST", url, json=payload, timeout=30.0)
        if resp.status_code == 200:
            logger.info("HeyGen 비디오 삭제 완료: %s", video_id)
            return True
        logger.warning("HeyGen 비디오 삭제 실패 [%d]: %s", resp.status_code, resp.text)
        return False
    except HeyGenError as e:
        logger.error("HeyGen 비디오 삭제 오류: %s — %s", video_id, e)
        return False


# ── 남은 크레딧 조회 ─────────────────────────────────────────────────────────


async def get_remaining_quota() -> dict:
    """HeyGen 계정 잔여 크레딧 조회."""
    url = f"{settings.HEYGEN_BASE_URL}/v2/user/remaining_quota"

    resp = await _request_with_retry("GET", url, timeout=15.0)

    if resp.status_code != 200:
        raise HeyGenError(f"HeyGen 크레딧 조회 오류 [{resp.status_code}]: {resp.text}")

    data = resp.json().get("data", {})
    return {
        "remaining_quota": data.get("remaining_quota", 0),
        "details": data,
    }


# ── Photo Avatar (Design with AI 룩) ─────────────────────────────────────────
# HeyGen v2 Photo Avatar 흐름: 이미지 asset 업로드 → avatar group 생성 → train →
# look 생성(Design with AI, 프롬프트) → 상태 폴링 → 완료된 look id 를
# /v2/video/generate 의 avatar character(avatar_id)로 사용.
#
# ⚠️ v2 photo_avatar 의 정확한 요청/응답 필드는 운영 키로 1회 검증 필요
# (docs.heygen.com 이 v3 마이그레이션 안내로 전환되어 스키마 자동확인 불가).
# 응답은 .get() 으로 방어적으로 파싱하며, HEYGEN_MOCK 경로가 개발·테스트의
# 기준 동작을 제공한다(외부 호출 없이 전 파이프라인 통과).

_MOCK_LOOK_COUNT_DEFAULT = 4


def _heygen_phase(raw: object) -> str | None:
    """HeyGen 의 다양한 상태 문자열을 ready/failed 로 정규화. 진행 중이면 None."""
    s = str(raw or "").lower()
    if s in ("ready", "completed", "success", "done", "trained", "active", "ok"):
        return "ready"
    if s in ("failed", "error", "fail"):
        return "failed"
    return None


async def _upload_photo_asset(image_bytes: bytes, content_type: str) -> str:
    """원본 사진을 HeyGen asset 으로 업로드하고 image_key 를 반환.

    upload.heygen.com 은 raw 바이트를 본문에 싣는다(talking_photo 와 동일 패턴).
    """
    if settings.HEYGEN_MOCK:
        return f"mockimg_{uuid.uuid4().hex}"
    url = "https://upload.heygen.com/v1/asset"
    headers = {"X-Api-Key": settings.HEYGEN_API_KEY, "Content-Type": content_type}
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, headers=headers, content=image_bytes)
    except httpx.HTTPError as exc:
        raise HeyGenError(f"HeyGen 이미지 업로드 통신 오류: {exc}") from exc
    if resp.status_code != 200:
        raise HeyGenError(f"HeyGen 이미지 업로드 오류 [{resp.status_code}]: {resp.text[:300]}")
    data = resp.json().get("data", {})
    image_key = data.get("image_key") or data.get("key") or data.get("id")
    if not image_key:
        raise HeyGenError(f"HeyGen 이미지 업로드 응답에 image_key 없음: {resp.text[:300]}")
    return image_key


async def create_photo_avatar_group(
    name: str, image_bytes: bytes, content_type: str = "image/jpeg"
) -> str:
    """업로드 사진으로 Photo Avatar 그룹을 생성하고 group_id 를 반환."""
    if settings.HEYGEN_MOCK:
        gid = f"mockgrp_{uuid.uuid4().hex}"
        logger.warning("[HEYGEN_MOCK] create_photo_avatar_group 생략 — group_id=%s", gid)
        return gid
    image_key = await _upload_photo_asset(image_bytes, content_type)
    url = f"{settings.HEYGEN_BASE_URL}/v2/photo_avatar/avatar_group/create"
    payload = {"name": name, "image_key": image_key}
    resp = await _request_with_retry("POST", url, json=payload)
    if resp.status_code != 200:
        raise HeyGenError(f"Photo Avatar 그룹 생성 오류 [{resp.status_code}]: {resp.text[:300]}")
    data = resp.json().get("data", {})
    group_id = data.get("group_id") or data.get("id")
    if not group_id:
        raise HeyGenError(f"Photo Avatar 그룹 응답에 group_id 없음: {resp.text[:300]}")
    logger.info("Photo Avatar 그룹 생성: group_id=%s", group_id)
    return group_id


async def train_photo_avatar_group(group_id: str) -> None:
    """Photo Avatar 그룹 학습 시작(비동기). 완료는 상태 폴링으로 확인."""
    if settings.HEYGEN_MOCK:
        logger.warning("[HEYGEN_MOCK] train_photo_avatar_group 생략 — group_id=%s", group_id)
        return
    url = f"{settings.HEYGEN_BASE_URL}/v2/photo_avatar/train"
    resp = await _request_with_retry("POST", url, json={"group_id": group_id})
    if resp.status_code != 200:
        raise HeyGenError(f"Photo Avatar 학습 시작 오류 [{resp.status_code}]: {resp.text[:300]}")
    logger.info("Photo Avatar 학습 시작: group_id=%s", group_id)


async def get_photo_avatar_group_status(group_id: str) -> dict:
    """그룹 학습 상태 조회. 반환 ``{"status": "ready"|"training"|"failed"}``."""
    if settings.HEYGEN_MOCK:
        return {"status": "ready"}
    url = f"{settings.HEYGEN_BASE_URL}/v2/photo_avatar/train/status/{group_id}"
    resp = await _request_with_retry("GET", url, timeout=15.0)
    if resp.status_code != 200:
        raise HeyGenError(f"Photo Avatar 학습 상태 오류 [{resp.status_code}]: {resp.text[:300]}")
    data = resp.json().get("data", {})
    return {"status": _heygen_phase(data.get("status")) or "training"}


async def generate_photo_avatar_looks(group_id: str, prompt: str, count: int) -> str:
    """Design with AI 룩 생성 시작(비동기). generation_id 반환."""
    if settings.HEYGEN_MOCK:
        gen = f"mockgen_{uuid.uuid4().hex}"
        logger.warning(
            "[HEYGEN_MOCK] generate_photo_avatar_looks 생략 — gen=%s, count=%d", gen, count
        )
        return gen
    url = f"{settings.HEYGEN_BASE_URL}/v2/photo_avatar/look/generate"
    payload = {"group_id": group_id, "prompt": prompt, "num_images": count}
    resp = await _request_with_retry("POST", url, json=payload)
    if resp.status_code != 200:
        raise HeyGenError(f"Photo Avatar 룩 생성 오류 [{resp.status_code}]: {resp.text[:300]}")
    data = resp.json().get("data", {})
    generation_id = data.get("generation_id") or data.get("id")
    if not generation_id:
        raise HeyGenError(f"Photo Avatar 룩 생성 응답에 generation_id 없음: {resp.text[:300]}")
    logger.info("Photo Avatar 룩 생성 시작: gen=%s, count=%d", generation_id, count)
    return generation_id


async def get_photo_avatar_generation_status(
    generation_id: str, count: int = _MOCK_LOOK_COUNT_DEFAULT
) -> dict:
    """룩 생성 상태 조회.

    반환 ``{"status": "ready"|"pending"|"failed", "looks": [{"look_id","image_url"}, ...]}``.
    ``count`` 는 mock 에서 만들 룩 개수(실호출에선 무시).
    """
    if settings.HEYGEN_MOCK:
        looks = [
            {"look_id": f"mocklook_{uuid.uuid4().hex}", "image_url": settings.HEYGEN_MOCK_VIDEO_URL or ""}
            for _ in range(max(1, count))
        ]
        return {"status": "ready", "looks": looks}
    url = f"{settings.HEYGEN_BASE_URL}/v2/photo_avatar/generation/{generation_id}"
    resp = await _request_with_retry("GET", url, timeout=15.0)
    if resp.status_code != 200:
        raise HeyGenError(f"Photo Avatar 생성 상태 오류 [{resp.status_code}]: {resp.text[:300]}")
    data = resp.json().get("data", {})
    raw_looks = data.get("looks") or data.get("image_list") or data.get("photos") or []
    looks: list[dict[str, str]] = []
    for it in raw_looks:
        look_id = it.get("look_id") or it.get("id") or it.get("image_key")
        image_url = it.get("image_url") or it.get("url") or ""
        if look_id:
            looks.append({"look_id": look_id, "image_url": image_url})
    return {"status": _heygen_phase(data.get("status")) or "pending", "looks": looks}
