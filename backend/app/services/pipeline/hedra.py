"""Hedra (Character-3) API 클라이언트 — 본인 얼굴 Q&A 렌더.

HeyGen Photo Avatar 는 계정당 3개 한도라 다수 사용자에게 본인 얼굴을 줄 수 없다.
Hedra 는 렌더할 때마다 **이미지 + 음성을 그대로 넘기는** 방식이라 등록할 아바타
객체가 없고 계정 한도도 없다 → 사용자 수만큼 무한 확장. 과금은 만든 영상 길이(초)
기준(아바타 개수 무관).

렌더 흐름(공개 API ``/web-app/public``):
  1. POST /assets {name, type:"image"}         → image asset id
  2. POST /assets/{id}/upload  (multipart 파일)  → 이미지 업로드
  3. POST /assets {name, type:"audio"}         → audio asset id
  4. POST /assets/{id}/upload  (multipart 파일)  → 음성 업로드
  5. POST /generations {ai_model_id, start_keyframe_id, audio_id, ...} → generation id
  6. GET  /generations/{id}/status             → {status: complete|error, url}

인증: 헤더 ``x-api-key: sk_h...``.
키가 비어 있으면 HedraError 를 던져 호출부(qa_batch)가 HeyGen 표준 아바타로
폴백하게 한다(서비스 연속성).
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import settings
from app.core.metrics import track_external_api
from app.core.retry import RetryableHTTPError, request_with_retry

logger = logging.getLogger(__name__)


class HedraError(Exception):
    """Hedra API 호출 실패."""


# ── 비용 추정 ────────────────────────────────────────────────────────────────


def estimate_cost_usd(duration_seconds: float | None) -> float:
    """영상 길이(초) × ``HEDRA_COST_USD_PER_SECOND`` (회계용 근사치)."""
    if duration_seconds is None or duration_seconds <= 0:
        return 0.0
    return round(duration_seconds * settings.HEDRA_COST_USD_PER_SECOND, 6)


# ── 내부 헬퍼 ────────────────────────────────────────────────────────────────


def _require_key() -> str:
    key = (settings.HEDRA_API_KEY or "").strip()
    if not key:
        raise HedraError("HEDRA_API_KEY 미설정 — 본인 얼굴 렌더 불가(표준 아바타로 폴백).")
    return key


def _json_headers() -> dict[str, str]:
    return {"x-api-key": _require_key(), "Content-Type": "application/json"}


@track_external_api("hedra")
async def _request_json(
    method: str,
    path: str,
    *,
    json: dict | None = None,
    timeout: float = 30.0,
) -> httpx.Response:
    """JSON 요청 — heygen.py 와 동일한 재시도 정책 위임(4xx 즉시 반환)."""
    url = f"{settings.HEDRA_BASE_URL}{path}"
    try:
        return await request_with_retry(
            method, url, headers=_json_headers(), json=json, timeout=timeout,
            label=f"hedra.{method.lower()}",
        )
    except httpx.HTTPStatusError as exc:
        return exc.response
    except (RetryableHTTPError, httpx.TimeoutException) as exc:
        raise HedraError(f"Hedra API 최대 재시도 초과: {exc}") from exc


@track_external_api("hedra")
async def _upload_asset(asset_id: str, filename: str, data: bytes, ctype: str) -> None:
    """multipart 파일 업로드 — request_with_retry 는 files 미지원이라 직접 호출."""
    url = f"{settings.HEDRA_BASE_URL}/assets/{asset_id}/upload"
    headers = {"x-api-key": _require_key()}  # multipart 는 Content-Type 자동
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            url, headers=headers, files={"file": (filename, data, ctype)}
        )
    if resp.status_code >= 400:
        # 5xx/429 는 재시도 가치가 있으나, 업로드는 호출부(배치)가 다음 회차에
        # 재시도하므로 여기선 단순 raise 로 통일한다.
        raise HedraError(f"Hedra 자산 업로드 오류 [{resp.status_code}]: {resp.text[:300]}")


async def _create_asset(name: str, asset_type: str, data: bytes, ctype: str) -> str:
    """자산(image|audio) 생성 + 파일 업로드 → asset id."""
    resp = await _request_json("POST", "/assets", json={"name": name, "type": asset_type})
    if resp.status_code >= 400:
        raise HedraError(f"Hedra 자산 생성 오류 [{resp.status_code}]: {resp.text[:300]}")
    body = resp.json()
    asset_id = body.get("id") or body.get("asset_id")
    if not asset_id:
        raise HedraError(f"Hedra 자산 응답에 id 없음: {str(body)[:300]}")
    await _upload_asset(asset_id, name, data, ctype)
    return asset_id


async def _resolve_model_id() -> str:
    """Character-3 모델 id. 설정값 우선, 없으면 GET /models 에서 'character' 탐색."""
    if settings.HEDRA_MODEL_ID.strip():
        return settings.HEDRA_MODEL_ID.strip()
    resp = await _request_json("GET", "/models")
    if resp.status_code >= 400:
        raise HedraError(f"Hedra 모델 조회 오류 [{resp.status_code}]: {resp.text[:300]}")
    models = resp.json()
    if isinstance(models, dict):
        models = models.get("data") or models.get("models") or []
    # 이름에 'character' 가 들어간 모델(Character-3) 우선, 없으면 첫 항목.
    for m in models:
        name = str(m.get("name") or "").lower()
        if "character" in name:
            mid = m.get("id") or m.get("model_id")
            if mid:
                return str(mid)
    if models:
        mid = models[0].get("id") or models[0].get("model_id")
        if mid:
            return str(mid)
    raise HedraError("Hedra 모델 목록이 비어 model_id 를 찾지 못함.")


# ── 렌더 제출 / 상태 폴링 ─────────────────────────────────────────────────────


async def submit_talking_video(
    *,
    image_bytes: bytes,
    image_ctype: str,
    audio_bytes: bytes,
    audio_ctype: str = "audio/mpeg",
    text_prompt: str = "",
) -> str:
    """사진 + 음성 → 말하는 영상 렌더 제출. generation id 반환.

    MOCK 이면 외부 호출 0 으로 가짜 generation id 를 돌려준다.
    """
    if settings.HEDRA_MOCK:
        return "mock-hedra-gen"

    img_name = "image.png" if "png" in image_ctype.lower() else "image.jpg"
    aud_name = "audio.mp3" if "mpeg" in audio_ctype.lower() or "mp3" in audio_ctype.lower() else "audio.wav"

    image_id = await _create_asset(img_name, "image", image_bytes, image_ctype)
    audio_id = await _create_asset(aud_name, "audio", audio_bytes, audio_ctype)
    model_id = await _resolve_model_id()

    payload = {
        "ai_model_id": model_id,
        "start_keyframe_id": image_id,
        "audio_id": audio_id,
        "text_prompt": text_prompt or "",
        "resolution": settings.HEDRA_RESOLUTION,
        "aspect_ratio": settings.HEDRA_ASPECT_RATIO,
    }
    resp = await _request_json("POST", "/generations", json=payload, timeout=60.0)
    if resp.status_code >= 400:
        raise HedraError(f"Hedra 렌더 제출 오류 [{resp.status_code}]: {resp.text[:300]}")
    body = resp.json()
    gen_id = body.get("id") or body.get("generation_id")
    if not gen_id:
        raise HedraError(f"Hedra 렌더 응답에 id 없음: {str(body)[:300]}")
    logger.info("Hedra 렌더 제출: generation_id=%s, model=%s", gen_id, model_id)
    return str(gen_id)


def _normalize_status(raw: str | None) -> str:
    """Hedra status → heygen 호환(completed|failed|processing)."""
    s = (raw or "").lower()
    if s in ("complete", "completed"):
        return "completed"
    if s in ("error", "failed"):
        return "failed"
    return "processing"


async def get_generation_status(generation_id: str) -> dict[str, Any]:
    """렌더 상태 조회(폴링용) — heygen.get_video_status 와 동일한 dict 형태."""
    if settings.HEDRA_MOCK:
        return {
            "status": "completed",
            "video_url": settings.HEDRA_MOCK_VIDEO_URL or None,
            "duration": 0.0,
            "error": None,
        }
    resp = await _request_json("GET", f"/generations/{generation_id}/status")
    if resp.status_code >= 400:
        raise HedraError(
            f"Hedra 상태 조회 오류 [{resp.status_code}]: {resp.text[:300]}"
        )
    data = resp.json()
    status = _normalize_status(data.get("status"))
    return {
        "status": status,
        "video_url": data.get("url") or data.get("video_url"),
        "duration": data.get("duration"),
        "error": data.get("error") or data.get("error_message"),
    }
