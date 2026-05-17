"""HeyGen API 클라이언트."""
from __future__ import annotations

import logging
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
) -> str:
    """HeyGen v2 API로 아바타 립싱크 비디오 생성 요청. video_id를 반환.

    avatar_id: 명시 시 그것 우선(custom 아바타 등), 아니면 ``pick_avatar_id(gender)``.
    gender:    ``"male"`` | ``"female"`` — avatar_id 가 None 일 때 _MALE/_FEMALE 분기 키.
    """
    avatar = avatar_id or pick_avatar_id(gender)
    url = f"{settings.HEYGEN_BASE_URL}/v2/video/generate"
    payload = {
        "video_inputs": [
            {
                "character": {"type": "avatar", "avatar_id": avatar, "avatar_style": "normal"},
                "voice": {"type": "audio", "audio_url": audio_url},
            }
        ],
        "dimension": {"width": 1920, "height": 1080},
        "callback_id": callback_id or "",
        "callback_url": settings.HEYGEN_CALLBACK_URL,
    }

    logger.info("HeyGen 비디오 생성 요청: avatar=%s, callback_id=%s", avatar, callback_id)
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


# ── 비디오 삭제 ──────────────────────────────────────────────────────────────


async def cancel_video(video_id: str) -> bool:
    """진행 중인 HeyGen 비디오 잡 취소 (best-effort).

    Lecture 삭제 등으로 더 이상 결과가 필요 없는 잡을 정리한다. 실패해도
    호출자(예: lecture DELETE)는 진행을 멈추지 않으므로 예외 대신 bool 반환.
    HeyGen v1 API 의 video.delete 엔드포인트가 PROCESSING 상태 잡도 처리한다.
    """
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
