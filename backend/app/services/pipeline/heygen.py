"""HeyGen API 클라이언트."""
from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any

import httpx

from app.core.config import settings
from app.core.metrics import track_external_api
from app.core.redis import get_redis
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


# HeyGen 계정 아바타 목록은 모든 교수자에게 동일하고 거의 바뀌지 않는다. 하지만
# GET /api/avatars 는 교수자가 아바타 페이지를 열 때마다 호출돼, 캐시가 없으면
# 매번 HeyGen /v2/avatars 를 친다. HeyGen 지연·429 시 재시도(30s×3 + 백오프)가
# 그대로 사용자 대기로 노출되므로, 프로세스 메모리에 짧게(기본 5분) 캐시해 매
# 요청 외부 호출을 없앤다. 성공 응답만 캐시한다(오류는 즉시 표면화).
_AVATARS_CACHE_TTL = 300.0
_avatars_cache: tuple[float, list[dict[str, Any]]] | None = None

# ── 공유(Redis) 캐시 ──────────────────────────────────────────────────────────
# 위 in-proc 캐시는 워커마다 따로라(Railway 다중 워커) 콜드 워커·재시작 직후엔
# 매번 HeyGen 을 다시 친다. HeyGen 카탈로그(아바타/그룹/룩)는 계정 전역이라 거의
# 안 바뀌므로, Redis 에 짧게 공유 캐싱해 워커가 달라도·재시작돼도 외부 호출을
# 줄인다. Redis 장애는 절대 기능을 막지 않게 모든 예외를 삼키고 HeyGen 으로 폴백.
#
# 테스트 격리: conftest 의 autouse 픽스처가 매 테스트마다 reset_avatars_cache()
# 를 호출한다. Redis 는 CI 에 실제로 떠 있어(키가 테스트 간 남으면 오류 케이스가
# 캐시 적중으로 가려짐) sync 인 reset 에서 키를 지울 수 없으므로, 키에 epoch 을
# 박고 reset 이 epoch 을 올린다 → 다음 읽기는 새 키(미스)가 된다. 프로덕션은
# reset 을 부르지 않아 모든 워커가 v0 키를 공유한다.
_REDIS_TTL = 600
_cache_epoch = 0


def reset_avatars_cache() -> None:
    """HeyGen 카탈로그 캐시(in-proc + 공유)를 무효화한다(테스트·강제 갱신용)."""
    global _avatars_cache, _cache_epoch
    _avatars_cache = None
    _cache_epoch += 1


def _ckey(name: str) -> str:
    return f"heygen:{name}:v{_cache_epoch}"


async def _redis_get_json(key: str) -> Any | None:
    try:
        raw = await get_redis().get(key)
        if raw:
            return json.loads(raw)
    except Exception:  # noqa: BLE001 — Redis 장애는 캐시 미스로 강등(기능 차단 금지)
        logger.debug("heygen redis cache get failed key=%s", key, exc_info=True)
    return None


async def _redis_set_json(key: str, value: Any, ttl: int = _REDIS_TTL) -> None:
    try:
        await get_redis().set(key, json.dumps(value), ex=ttl)
    except Exception:  # noqa: BLE001
        logger.debug("heygen redis cache set failed key=%s", key, exc_info=True)


async def list_avatars(*, use_cache: bool = True) -> list[dict[str, Any]]:
    """사용 가능한 아바타 목록 조회. 기본 in-proc(5분) + Redis(10분) 캐시."""
    global _avatars_cache
    if use_cache:
        if _avatars_cache is not None:
            cached_at, cached = _avatars_cache
            if time.monotonic() - cached_at < _AVATARS_CACHE_TTL:
                return cached
        # L2: 워커 간 공유 캐시. 콜드 워커가 HeyGen 을 다시 치지 않게 한다.
        shared = await _redis_get_json(_ckey("avatars"))
        if isinstance(shared, list):
            _avatars_cache = (time.monotonic(), shared)
            return shared

    url = f"{settings.HEYGEN_BASE_URL}/v2/avatars"

    resp = await _request_with_retry("GET", url, timeout=30.0)

    if resp.status_code != 200:
        raise HeyGenError(f"HeyGen 아바타 조회 오류 [{resp.status_code}]: {resp.text}")

    data = resp.json().get("data", {})
    avatars = data.get("avatars", [])

    result = [
        {
            "avatar_id": a.get("avatar_id"),
            "avatar_name": a.get("avatar_name"),
            "gender": a.get("gender"),
            "preview_image_url": a.get("preview_image_url"),
            "preview_video_url": a.get("preview_video_url"),
        }
        for a in avatars
    ]
    _avatars_cache = (time.monotonic(), result)
    await _redis_set_json(_ckey("avatars"), result)
    return result


# ── 아바타 그룹 (Photo Avatar — 웹 "공개 아바타" 캐릭터) ───────────────────────
#
# /v2/avatars 는 Video Avatar 만 돌려준다. 웹 갤러리의 "Annie 57룩" 같은 캐릭터는
# Photo Avatar 그룹이라 별도 API(/v2/avatar_group.list + 그룹별 룩)로만 조회된다.
# 응답 형태가 버전에 따라 달라 방어적으로 파싱한다(UGC 아바타는 API 미제공).


async def list_avatar_groups() -> list[dict[str, Any]]:
    """공개 + 계정 아바타 그룹(캐릭터) 목록. ``GET /v2/avatar_group.list``.

    ``include_public=true`` 를 줘야 HeyGen 웹 "Public Avatars" 갤러리의 공개 Photo
    Avatar 캐릭터(대다수)가 함께 내려온다. 파라미터가 없으면 계정 소유 그룹만 와서
    갤러리에 공개 아바타가 대거 누락된다(2026-06-14 수정).

    각 항목을 ``{group_id, name, num_looks, preview_image_url}`` 로 정규화한다.
    실패는 HeyGenError 로 래핑.
    """
    if settings.HEYGEN_MOCK:
        return []
    cached = await _redis_get_json(_ckey("groups"))
    if isinstance(cached, list):
        return cached
    url = f"{settings.HEYGEN_BASE_URL}/v2/avatar_group.list"
    resp = await _request_with_retry(
        "GET", url, params={"include_public": "true"}, timeout=30.0
    )
    if resp.status_code != 200:
        raise HeyGenError(
            f"HeyGen 아바타 그룹 목록 오류 [{resp.status_code}]: {resp.text[:200]}"
        )
    data = resp.json().get("data", {})
    if isinstance(data, list):
        groups = data
    elif isinstance(data, dict):
        groups = (
            data.get("avatar_group_list")
            or data.get("avatar_groups")
            or data.get("list")
            or []
        )
    else:
        groups = []
    out: list[dict[str, Any]] = []
    for g in groups:
        if not isinstance(g, dict):
            continue
        gid = g.get("id") or g.get("group_id") or g.get("avatar_group_id")
        if not gid:
            continue
        out.append(
            {
                "group_id": gid,
                "name": g.get("name") or g.get("group_name") or "Avatar",
                "num_looks": g.get("num_looks") or g.get("looks_count") or 0,
                "preview_image_url": (
                    g.get("preview_image_url")
                    or g.get("preview_image")
                    or g.get("image_url")
                ),
            }
        )
    await _redis_set_json(_ckey("groups"), out)
    return out


async def list_avatars_in_group(group_id: str) -> list[dict[str, Any]]:
    """한 아바타 그룹의 룩 목록. ``GET /v2/avatar_group/{group_id}/avatars``.

    각 룩을 list_avatars 와 동일한 shape(``{avatar_id, avatar_name, gender,
    preview_image_url, preview_video_url}``)로 정규화해 프론트가 동일하게 소비한다.
    """
    if settings.HEYGEN_MOCK:
        return []
    cached = await _redis_get_json(_ckey(f"group_looks:{group_id}"))
    if isinstance(cached, list):
        return cached
    url = f"{settings.HEYGEN_BASE_URL}/v2/avatar_group/{group_id}/avatars"
    resp = await _request_with_retry("GET", url, timeout=30.0)
    if resp.status_code != 200:
        raise HeyGenError(
            f"HeyGen 그룹 룩 목록 오류 [{resp.status_code}]: {resp.text[:200]}"
        )
    data = resp.json().get("data", {})
    if isinstance(data, list):
        looks = data
    elif isinstance(data, dict):
        looks = data.get("avatar_list") or data.get("avatars") or data.get("list") or []
    else:
        looks = []
    out: list[dict[str, Any]] = []
    for a in looks:
        if not isinstance(a, dict):
            continue
        aid = a.get("avatar_id") or a.get("id")
        if not aid:
            continue
        out.append(
            {
                "avatar_id": aid,
                "avatar_name": a.get("avatar_name") or a.get("name") or "Avatar",
                "gender": a.get("gender"),
                "preview_image_url": (
                    a.get("preview_image_url") or a.get("image_url")
                ),
                "preview_video_url": (
                    a.get("preview_video_url") or a.get("motion_preview_url")
                ),
            }
        )
    await _redis_set_json(_ckey(f"group_looks:{group_id}"), out)
    return out


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
    # v1 으로 업로드한 Talking Photo 는 **asset 삭제 엔드포인트**로 지워야 슬롯이
    # 회수된다(POST /v1/asset/{id}/delete). 종전엔 v2/talking_photo/{id}(DELETE)만
    # 호출했는데 이는 v2 Photo Avatar(룩 그룹) 용이라 v1 업로드 id 에는 404 → 슬롯이
    # 영영 안 비어 "exceeded your limit" 한도가 자가 회복되지 않았다(seed 렌더가
    # 업로드 400→삭제 404 를 무한 반복하던 원인). id 매핑이 버전마다 달라 두 엔드포인트를
    # 순서대로 시도하고 하나라도 2xx 면 성공으로 본다(best-effort).
    base = settings.HEYGEN_BASE_URL
    candidates = (
        ("POST", f"{base}/v1/asset/{talking_photo_id}/delete"),
        ("DELETE", f"{base}/v2/talking_photo/{talking_photo_id}"),
    )
    last_status: int | None = None
    last_text = ""
    for method, url in candidates:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.request(method, url, headers=_headers())
        except httpx.HTTPError as exc:
            logger.warning(
                "HeyGen Talking Photo 삭제 통신 오류(%s): %s — %s",
                method, talking_photo_id, exc,
            )
            continue
        if resp.status_code in (200, 204):
            logger.info("HeyGen Talking Photo 삭제(%s): %s", method, talking_photo_id)
            return True
        last_status, last_text = resp.status_code, resp.text[:200]
    logger.warning(
        "HeyGen Talking Photo 삭제 실패(모든 엔드포인트) [%s]: %s — %s",
        last_status, talking_photo_id, last_text,
    )
    return False


async def list_talking_photos() -> list[dict[str, Any]]:
    """계정의 Talking Photo(Photo Avatar) 목록 — 한도 정리(회수) 대상 조회용.

    HeyGen 공식 ``GET /v1/talking_photo.list``. 응답 형태가 버전에 따라
    ``data`` 가 리스트이거나 ``{talking_photos:[...]}`` / ``{list:[...]}`` 일 수
    있어 방어적으로 파싱한다. 각 항목은 ``id`` 또는 ``talking_photo_id`` 와
    (있으면) 생성시각 필드를 가진다. 실패는 HeyGenError 로 래핑.
    """
    if settings.HEYGEN_MOCK:
        return []
    url = f"{settings.HEYGEN_BASE_URL}/v1/talking_photo.list"
    resp = await _request_with_retry("GET", url, timeout=15.0)
    if resp.status_code != 200:
        raise HeyGenError(
            f"HeyGen Talking Photo 목록 오류 [{resp.status_code}]: {resp.text[:200]}"
        )
    data = resp.json().get("data", {})
    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        items = data.get("talking_photos") or data.get("list") or data.get("talking_photo_list") or []
    else:
        items = []
    return [i for i in items if isinstance(i, dict)]


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
