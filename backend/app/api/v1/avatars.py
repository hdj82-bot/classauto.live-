"""아바타 API — 목록 조회 + 교수자 본인 사진 업로드(Talking Photo).

라우트 prefix 는 lectures.py 와 동일하게 풀패스(``/api/...``) 로 둔다
(render.py 의 ``/api/v1/render/avatars`` 와 별개 — 프론트 아바타 갤러리는 본
``/api/avatars`` 계약을 사용한다).
"""
import asyncio
import logging
import uuid

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_professor
from app.core.config import settings
from app.db.session import get_db
from app.models.course import Course
from app.models.lecture import Lecture
from app.models.photo_avatar import LookStatus, PhotoAvatarLook
from app.models.saved_avatar import SavedAvatar
from app.models.standard_avatar import StandardAvatar
from app.models.user import User
from app.schemas.avatar import (
    AvatarMeta,
    AvatarPreviewRequest,
    AvatarPreviewResponse,
    AvatarsResponse,
    LookGenerateRequest,
    LookGenerateResponse,
    LookItem,
    LookNameUpdate,
    LookSelectResponse,
    PhotoAvatarStatusResponse,
    ProfilePhotoResponse,
    RecentAvatarRequest,
    RecentAvatarResponse,
    SavedAvatarApply,
    SavedAvatarCreate,
    SavedAvatarItem,
    SavedAvatarPreviewRequest,
    SavedAvatarUpdate,
    StandardAvatarItem,
    StandardAvatarNameUpdate,
    StandardAvatarRegisterRequest,
    VoiceCloneResponse,
    VoiceScriptRequest,
    VoiceScriptResponse,
)
from app.services.pipeline import s3 as s3_svc

router = APIRouter(tags=["avatars"])
logger = logging.getLogger(__name__)

# 프로필 사진 한도 — 휴대폰 고화질 원본(보통 5~12MB)을 잘리지 않게 받도록 20MB.
# profile-photo·photo-avatar 두 업로드 엔드포인트가 공통으로 쓴다. 에러 문구는
# 이 상수에서 자동 계산하므로(``// (1024*1024)``) 값만 바꾸면 메시지도 따라간다.
_MAX_PROFILE_PHOTO = 20 * 1024 * 1024  # 20MB

# HeyGen Talking Photo 업로드 한도 — 룩 이미지(gpt-image-2 1536x1024 PNG)는
# 흔히 3-5MB 가 나와 HeyGen 제한(공식 명시는 없으나 실측 4-5MB 부근에서 거부)에
# 닿을 수 있어, select 단계에서 안전망으로 다운스케일 + JPEG 재인코딩한다.
_TALKING_PHOTO_MAX_BYTES = 4 * 1024 * 1024  # 4MB — HeyGen 안전 마진
# 긴 변 픽셀 상한. gpt-image-2 룩은 1536x1024 이므로 1920 이면 다운스케일이
# 일어나지 않아 원본 해상도를 그대로 HeyGen 에 넘긴다(아바타 렌더 선명도↑ —
# 2026-06-05 사용자 보고: 원본 룩은 선명한데 아바타가 흐림). 그보다 큰 업로드
# (직접 올린 고해상도 사진)만 1920 으로 줄여 4MB 제한을 지킨다.
_TALKING_PHOTO_MAX_SIDE = 1920
# JPEG 재인코딩 품질. 90→95 로 올려 HeyGen 입력 이미지의 압축 손실을 줄인다
# (95 는 시각적으로 거의 무손실이며 1536px 인물 사진이라 파일도 4MB 안쪽).
_TALKING_PHOTO_JPEG_QUALITY = 95


def _ensure_talking_photo_payload(
    img_bytes: bytes, content_type: str
) -> tuple[bytes, str]:
    """HeyGen Talking Photo 업로드용으로 이미지를 안전 사이즈로 정규화.

    gpt-image-2 1536x1024 PNG 가 큰 경우 HeyGen 이 거부할 수 있어, 긴 변
    ``_TALKING_PHOTO_MAX_SIDE``(1920) 이내로만 다운스케일하고 JPEG(품질 95)로
    재인코딩한다. 1536x1024 룩은 1920 이내라 다운스케일 없이 원본 해상도가 유지돼
    HeyGen 이 더 선명한 소스로 talking-head 를 렌더한다.
    원본이 이미 작고 4MB 이하면 그대로 통과(불필요한 압축 손실 회피).

    Pillow 의존 — requirements 에 이미 포함됨.
    """
    if len(img_bytes) <= _TALKING_PHOTO_MAX_BYTES and content_type != "image/png":
        # 이미 작은 JPEG 등은 손대지 않는다(추가 압축 손실 회피).
        return img_bytes, content_type

    from io import BytesIO

    from PIL import Image

    try:
        img = Image.open(BytesIO(img_bytes))
        img.load()
    except Exception as e:  # noqa: BLE001 — corrupt image 등
        logger.warning("talking_photo 리사이즈 — 디코드 실패, 원본 사용: %s", e)
        return img_bytes, content_type

    # RGBA·P 모드 → RGB 변환(JPEG 호환).
    if img.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img.convert("RGBA"), mask=img.convert("RGBA").split()[-1] if "A" in img.mode else None)
        img = bg

    w, h = img.size
    longest = max(w, h)
    if longest > _TALKING_PHOTO_MAX_SIDE:
        scale = _TALKING_PHOTO_MAX_SIDE / longest
        new_size = (int(w * scale), int(h * scale))
        img = img.resize(new_size, Image.LANCZOS)

    buf = BytesIO()
    img.save(buf, format="JPEG", quality=_TALKING_PHOTO_JPEG_QUALITY, optimize=True)
    out = buf.getvalue()
    logger.info(
        "talking_photo 정규화: %dB(%s) → %dB(JPEG, %dx%d)",
        len(img_bytes), content_type, len(out), *img.size,
    )
    return out, "image/jpeg"


def _talking_photo_created_ts(tp: dict) -> float:
    """Talking Photo 목록 항목의 생성시각(없으면 0). 오래된 것부터 정리하기 위함."""
    for k in ("created_at", "created_ts", "create_time", "created", "updated_at"):
        v = tp.get(k)
        if isinstance(v, (int, float)):
            return float(v)
    return 0.0


async def _register_talking_photo_with_cleanup(
    img_bytes: bytes, content_type: str, keep_id: str | None = None
) -> str:
    """Talking Photo 를 등록하되, HeyGen Photo Avatar 한도 초과 시 자가 회복한다.

    계정(공유 HeyGen 키)의 Photo Avatar 한도(흔히 3개)에 걸리면(code 401028),
    ``/v1/talking_photo.list`` 로 기존 Talking Photo 를 조회해 **오래된 것부터
    삭제**하고 등록을 재시도한다 — 대시보드에서 안 보이는(API 로만 만든) 고아
    Talking Photo 가 슬롯을 점유한 상태를 사람 개입 없이 푼다. ``keep_id`` 가
    주어지면 그것은 건너뛴다(현재 사용 중인 것 보호).

    주의(베타): 현재는 교수자들이 단일 HeyGen 계정을 공유하므로, 정리는 계정 전체의
    오래된 Talking Photo 를 지운다. 다사용자 동시 운영에는 HeyGen 플랜 상향이 필요하다.
    """
    from app.services.pipeline.heygen import (
        HeyGenError,
        delete_talking_photo,
        list_talking_photos,
        upload_talking_photo,
    )

    def _is_limit(err: Exception) -> bool:
        s = str(err)
        return "exceeded your limit" in s or "401028" in s

    try:
        return await upload_talking_photo(img_bytes, content_type=content_type)
    except HeyGenError as e:
        if not _is_limit(e):
            raise

    # 한도 초과 — 오래된 Talking Photo 를 하나씩 지우며 재시도(자가 회복).
    logger.warning("photo-avatar: Photo Avatar 한도 초과 — 오래된 Talking Photo 정리 후 재시도")
    try:
        photos = await list_talking_photos()
    except HeyGenError as le:
        logger.warning("photo-avatar: Talking Photo 목록 조회 실패 — %s", le)
        photos = []
    photos.sort(key=_talking_photo_created_ts)  # 오래된 것부터

    last_err: Exception | None = None
    for tp in photos:
        tpid = tp.get("id") or tp.get("talking_photo_id")
        if not tpid or tpid == keep_id:
            continue
        await delete_talking_photo(tpid)  # best-effort
        try:
            return await upload_talking_photo(img_bytes, content_type=content_type)
        except HeyGenError as e2:
            last_err = e2
            if not _is_limit(e2):
                raise
            # 아직 한도면 다음(더 최신) 항목을 지우고 재시도.
            continue
    raise last_err or HeyGenError(
        "HeyGen Talking Photo 한도 정리 후에도 등록에 실패했습니다."
    )


async def _ensure_photo_avatar_id(user: User, db: AsyncSession) -> str | None:
    """현재 기본 룩에 대응하는 Talking Photo 를 보장한다(lazy 등록·재사용·회수).

    2026-06-01 결정: select 단계에서 HeyGen 을 호출하지 않고("최후에만 헤이젠"),
    preview / 강의 렌더 진입 시점에 이 헬퍼가 등록한다.

    2026-06-04 보강: HeyGen 계정의 Photo Avatar 한도(흔히 3개, code 401028)에 걸리지
    않도록 —
    - ``photo_avatar_look_id`` 로 "현재 등록된 talking photo 가 어느 룩의 것인지"를
      추적해, 같은 룩이면 **재등록하지 않고 재사용**한다(룩 전환·재렌더마다 새로
      만들던 누적 등록 버그 제거).
    - 룩이 바뀌어 새로 만들어야 할 때는, 만들기 전에 **이전 talking photo 를 먼저
      삭제해 슬롯을 회수**한다(best-effort).

    반환: 보장된 talking_photo_id. 기본 룩이 없거나 룩이 ready 가 아니면 기존
    ``photo_avatar_id``(없으면 None). S3/HeyGen 실패는 ``HTTPException`` 으로 전파.
    """
    look_id = user.photo_avatar_default_look_id

    # 현재 등록된 talking photo 가 현재 기본 룩의 것이면 그대로 재사용(중복 등록 방지).
    # 기본 룩 미지정(레거시)인데 photo_avatar_id 가 있으면 그것을 그대로 쓴다.
    if user.photo_avatar_id and (
        not look_id or user.photo_avatar_look_id == look_id
    ):
        return user.photo_avatar_id
    if not look_id:
        return user.photo_avatar_id

    # default look 조회 — gpt 내부 UUID 또는 레거시 heygen_look_id 둘 다 시도.
    row = None
    try:
        row = (
            await db.execute(
                select(PhotoAvatarLook).where(
                    PhotoAvatarLook.user_id == user.id,
                    PhotoAvatarLook.id == uuid.UUID(look_id),
                )
            )
        ).scalar_one_or_none()
    except ValueError:
        row = None
    if row is None:
        row = (
            await db.execute(
                select(PhotoAvatarLook).where(
                    PhotoAvatarLook.user_id == user.id,
                    PhotoAvatarLook.heygen_look_id == look_id,
                )
            )
        ).scalar_one_or_none()
    if row is None or row.status != LookStatus.ready.value or not row.image_url:
        # 새 룩을 만들 수 없으면 기존 talking photo 라도 유지(있으면).
        return user.photo_avatar_id

    from urllib.parse import urlparse

    from app.services.pipeline.heygen import HeyGenError, delete_talking_photo

    key = urlparse(row.image_url).path.lstrip("/")
    ctype = "image/png" if key.lower().endswith(".png") else "image/jpeg"
    try:
        img_bytes = s3_svc.download_file(key)
    except Exception as e:  # noqa: BLE001
        logger.exception(
            "photo-avatar-ensure: S3 다운로드 실패 — user=%s, look=%s, key=%s",
            user.id, look_id, key,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"룩 이미지를 불러오지 못했습니다(S3): {e}",
        ) from e

    # 룩이 바뀌어 새로 만들기 전에, 이전 talking photo 를 먼저 지워 HeyGen Photo
    # Avatar 한도 슬롯을 회수한다(best-effort — 실패해도 계속 진행).
    old_id = user.photo_avatar_id
    if old_id:
        try:
            await delete_talking_photo(old_id)
        except Exception:  # noqa: BLE001 — 회수는 best-effort
            logger.warning("photo-avatar-ensure: 이전 talking photo 삭제 실패(무시): %s", old_id)

    safe_bytes, safe_ctype = _ensure_talking_photo_payload(img_bytes, ctype)
    try:
        talking_photo_id = await _register_talking_photo_with_cleanup(
            safe_bytes, safe_ctype, keep_id=None
        )
    except HeyGenError as e:
        logger.warning(
            "photo-avatar-ensure: HeyGen Talking Photo 등록 실패 — user=%s, look=%s, error=%s",
            user.id, look_id, e,
        )
        # 정리 후에도 한도 초과면 사용자에게 정확히 안내한다.
        hint = ""
        if "exceeded your limit" in str(e) or "401028" in str(e):
            hint = (
                " — HeyGen 계정의 Photo Avatar 한도(플랜 제한)에 도달했습니다. "
                "잠시 후 다시 시도하거나 HeyGen 플랜을 업그레이드해 주세요."
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"본인 아바타 등록에 실패했습니다(HeyGen): {e}{hint}",
        ) from e

    user.photo_avatar_id = talking_photo_id
    user.photo_avatar_look_id = look_id
    # 새 얼굴 → 이전 미리보기 캐시는 옛 룩이라 무효.
    user.photo_avatar_preview_url = None
    user.photo_avatar_preview_video_id = None
    user.photo_avatar_preview_voice_id = None
    user.photo_avatar_preview_text = None
    await db.commit()
    logger.info(
        "photo-avatar-ensure: 등록 성공 — user=%s, look=%s, talking_photo_id=%s",
        user.id, look_id, talking_photo_id,
    )
    return talking_photo_id


_JPEG_MAGIC = b"\xff\xd8\xff"
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

# 본인 음성 샘플 한도 — 1분 내외 mp3 는 보통 1~3MB. 고비트레이트/긴 샘플 여유로 25MB.
_MAX_VOICE_SAMPLE = 25 * 1024 * 1024  # 25MB
# 허용 확장자 → S3 저장 확장자/Content-Type. ElevenLabs IVC 는 mp3·m4a·wav 등을 받는다.
_VOICE_EXT_CTYPE: dict[str, str] = {
    "mp3": "audio/mpeg",
    "m4a": "audio/mp4",
    "mp4": "audio/mp4",
    "wav": "audio/wav",
    "webm": "audio/webm",
    "ogg": "audio/ogg",
}


def _looks_like_audio(content: bytes) -> bool:
    """업로드 바이트가 흔한 오디오 컨테이너인지 magic byte 로 느슨히 검증.

    엄밀한 디코딩은 ElevenLabs 가 수행하므로, 여기서는 이미지/문서/빈 파일 같은
    명백한 비-오디오만 거른다.
    """
    if len(content) < 12:
        return False
    head = content[:12]
    if head[:3] == b"ID3":  # mp3 with ID3 tag
        return True
    if head[0] == 0xFF and (head[1] & 0xE0) == 0xE0:  # mp3 frame sync
        return True
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":  # wav
        return True
    if head[4:8] == b"ftyp":  # m4a / mp4 audio
        return True
    if head[:4] == b"OggS":  # ogg
        return True
    if head[:4] == b"\x1aE\xdf\xa3":  # webm / matroska (EBML)
        return True
    return False

# "움직이는 미리보기" 렌더에 쓰는 짧은 샘플 문장 — 렌더 시간·비용을 줄이려 짧게.
_PREVIEW_TEXT = "안녕하세요. 이 모습으로 강의를 진행하겠습니다."

# ── 큐레이션 allowlist ────────────────────────────────────────────────────────
# HeyGen /v2/avatars 는 수백 개를 돌려주고 배경색·복장 메타데이터를 주지 않는다.
# 그래서 갤러리에 노출할 아바타는 교수가 직접 지목한 이름 목록으로 고른다
# (정장/세미정장·흰 배경·남녀 균등 기준은 사람이 보고 선택). 매칭은 avatar_name
# 대소문자 무시 부분일치 — UI 에서 이름이 잘려도 접두/부분으로 잡힌다.
#
# 비어 있으면 필터를 적용하지 않고 전체를 그대로 노출한다(안전 기본값). 목록을
# 채우면 "지목한 순서대로" 정렬되며, 한 항목이 여러 변형(예: Sitting/Standing)에
# 매칭되면 모두 포함된다. 본인 사진 아바타(is_custom)는 큐레이션 대상이 아니다.
CURATED_AVATAR_NAMES: list[str] = [
    # 남성 (정장/세미정장·흰 배경)
    "Adita in Brown shirt",
    "Adrian in Blue shirt",
    "Albert in Khaki",
    "Bastien in Blue",
    "Brandon in Grey",
    "Iker in Black blazer",
    "Jinwoo in Blue suit",
    "Lucien in Grey blazer",
    "Minho in Blue blazer",
    # 여성 (정장/세미정장·흰 배경)
    "Abigail (Upper Body)",
    "Adriana Business Front 2",
    "Annelise in Dark blue dress",
    "Annelore in Red sweater",
    "Annie in Tan Jacket",
    "Bahar Business Front",
    "Bahar Suit Front",
]


def curate_avatars(avatars: list[AvatarMeta]) -> list[AvatarMeta]:
    """``CURATED_AVATAR_NAMES`` 에 지목된 아바타만 그 순서대로 남긴다.

    목록이 비어 있으면 입력을 그대로 반환한다(미지정 시 전체 노출).
    avatar_id 기준으로 중복을 제거한다.
    """
    terms = [t.strip().lower() for t in CURATED_AVATAR_NAMES if t.strip()]
    if not terms:
        return avatars

    by_term: list[AvatarMeta] = []
    seen: set[str] = set()
    for term in terms:
        for a in avatars:
            if a.avatar_id in seen:
                continue
            if term in (a.avatar_name or "").lower():
                by_term.append(a)
                seen.add(a.avatar_id)
    return by_term


@router.get(
    "/api/avatars",
    response_model=AvatarsResponse,
    summary="아바타 목록 (기본 HeyGen + 본인 photo avatar)",
)
async def list_avatars_endpoint(
    user: User = Depends(require_professor),
):
    """HeyGen 기본 아바타 목록을 반환하되, 교수자가 본인 사진으로 등록한
    Talking Photo(``user.photo_avatar_id``)가 있으면 ``is_custom=True`` 항목으로
    목록 맨 앞에 합성한다. HeyGen 장애 시에도 본인 아바타는 노출한다.
    """
    from app.services.pipeline.heygen import (
        HeyGenError,
        list_avatars as heygen_list_avatars,
    )

    items: list[AvatarMeta] = []
    if user.photo_avatar_id:
        items.append(
            AvatarMeta(
                avatar_id=user.photo_avatar_id,
                avatar_name=f"{user.name} (본인)",
                gender=None,
                preview_image_url=s3_svc.presign_stored_s3_url(user.profile_image_url),
                preview_video_url=None,
                is_custom=True,
            )
        )

    try:
        avatars = await heygen_list_avatars()
    except HeyGenError as e:
        # 본인 아바타라도 있으면 그것만이라도 돌려준다.
        if items:
            return AvatarsResponse(avatars=items, total=len(items))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"HeyGen API 오류: {e}"
        )

    heygen_items: list[AvatarMeta] = []
    for a in avatars:
        avatar_id = a.get("avatar_id")
        if not avatar_id:
            continue
        heygen_items.append(
            AvatarMeta(
                avatar_id=avatar_id,
                avatar_name=a.get("avatar_name") or "Avatar",
                gender=a.get("gender"),
                preview_image_url=a.get("preview_image_url"),
                preview_video_url=a.get("preview_video_url"),
                is_custom=False,
            )
        )

    # 본인 아바타(items)는 그대로 두고, HeyGen 목록만 큐레이션해 합친다.
    items.extend(curate_avatars(heygen_items))
    return AvatarsResponse(avatars=items, total=len(items))


@router.post(
    "/api/avatars/profile-photo",
    response_model=ProfilePhotoResponse,
    summary="교수자 프로필 사진 업로드 → 본인 아바타(Talking Photo) 등록",
)
async def upload_profile_photo(
    file: UploadFile = File(...),
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """사진을 S3 에 저장하고 HeyGen Talking Photo 로 등록한다.

    1차 범위: 업로드 + S3 저장 + HeyGen 등록까지. HeyGen 등록이 실패해도 사진
    저장(``user.profile_image_url``)은 유지하고 ``status="failed"`` 로 알린다.
    """
    content = await file.read()
    if len(content) > _MAX_PROFILE_PHOTO:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"사진은 {_MAX_PROFILE_PHOTO // (1024 * 1024)}MB 이하여야 합니다.",
        )

    if content[:3] == _JPEG_MAGIC:
        ext, ctype = "jpg", "image/jpeg"
    elif content[:8] == _PNG_MAGIC:
        ext, ctype = "png", "image/png"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="JPEG 또는 PNG 이미지만 업로드할 수 있습니다.",
        )

    # thumbnails/ prefix 아래 저장 — 응답은 presigned 로 서빙(#210 과 동일 패턴).
    s3_key = f"thumbnails/profile/{user.id}/{uuid.uuid4().hex[:8]}.{ext}"
    s3_svc.upload_file(content, s3_key, content_type=ctype)
    profile_url = (
        f"https://{settings.S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{s3_key}"
    )
    user.profile_image_url = profile_url

    from app.services.pipeline.heygen import HeyGenError, upload_talking_photo

    photo_avatar_id: str | None = None
    result_status: str = "processing"
    message = "사진이 업로드되었습니다. 본인 아바타 등록을 진행 중입니다."
    try:
        photo_avatar_id = await upload_talking_photo(content, content_type=ctype)
        user.photo_avatar_id = photo_avatar_id
        # 직접 업로드한 사진 기반 — 특정 룩의 것이 아니므로 look 매핑은 비운다
        # (_ensure_photo_avatar_id 의 룩-재사용 판정이 이 값을 본다).
        user.photo_avatar_look_id = None
        # 새 아바타로 교체됨 → 이전 사진으로 만든 "움직이는 미리보기" 캐시는
        # 옛 얼굴이라 더 이상 유효하지 않으므로 비운다(다음 조회 시 재생성 유도).
        user.photo_avatar_preview_url = None
        user.photo_avatar_preview_video_id = None
        user.photo_avatar_preview_voice_id = None
        user.photo_avatar_preview_text = None
        result_status = "ready"
        message = "본인 아바타가 등록되었습니다."
    except HeyGenError as e:
        result_status = "failed"
        message = f"사진은 저장됐지만 본인 아바타 등록에 실패했습니다: {e}"

    await db.commit()

    return ProfilePhotoResponse(
        photo_avatar_id=photo_avatar_id,
        status=result_status,
        profile_image_url=s3_svc.presign_stored_s3_url(profile_url) or profile_url,
        message=message,
    )


@router.post(
    "/api/avatars/me/preview",
    response_model=AvatarPreviewResponse,
    summary="본인 아바타 '움직이는 미리보기' 렌더 시작/조회",
)
async def create_avatar_preview(
    payload: AvatarPreviewRequest | None = Body(default=None),
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """본인 Talking Photo 로 짧은 샘플 영상을 1회 렌더한다.

    Talking Photo 는 정지 사진이라 아이들 영상이 없으므로, 갤러리에서 움직이는
    모습을 보여 주려면 실제 렌더가 필요하다. 결과는 ``users.photo_avatar_preview_url``
    에 캐시하고, 같은 음성이면 다시 렌더하지 않는다(HeyGen 비용 절감).
    상태 조회·완료 수령은 ``GET /api/avatars/me/preview`` 폴링으로 한다.
    """
    payload = payload or AvatarPreviewRequest()
    # 2026-06-01: 기존엔 select 가 HeyGen 등록까지 했지만, 이제 select 는 default
    # 만 저장한다. preview 진입 시점에 lazy 등록 — 사진→룩→default 까지 끝낸
    # 사용자만 도달할 수 있는 시점이고, 어차피 preview 자체가 HeyGen 호출이므로
    # 여기서 talking_photo 등록을 함께 수행한다(idempotent).
    talking_photo_id = await _ensure_photo_avatar_id(user, db)
    if not talking_photo_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "본인 아바타가 아직 등록되지 않았습니다. 먼저 사진을 올리고 "
                "기본 룩을 지정해 주세요."
            ),
        )

    voice_id = payload.voice_id
    # 렌더할 대본 — "스크립트 테스트"가 임의 문장을 보내면 그 문장을, 아니면 기본
    # 샘플을 읽는다. NULL 캐시(과거 데이터)는 기본 문장으로 렌더된 것으로 본다.
    render_text = (payload.text or "").strip() or _PREVIEW_TEXT
    cached_text = user.photo_avatar_preview_text or _PREVIEW_TEXT
    text_matches = cached_text == render_text

    # 캐시 적중: 강제 아님 + 완성본 있음 + 같은 음성(또는 음성 미지정) + 같은 대본.
    if (
        not payload.force
        and user.photo_avatar_preview_url
        and (voice_id is None or voice_id == user.photo_avatar_preview_voice_id)
        and text_matches
    ):
        return AvatarPreviewResponse(
            status="ready",
            video_url=s3_svc.presign_stored_s3_url(user.photo_avatar_preview_url),
            voice_id=user.photo_avatar_preview_voice_id,
        )

    # 이미 렌더 진행 중 + 강제 아님 → 새로 시작하지 않고 진행 상태만 알린다.
    if not payload.force and user.photo_avatar_preview_video_id:
        return AvatarPreviewResponse(
            status="processing", voice_id=user.photo_avatar_preview_voice_id
        )

    # 새 렌더 시작: 샘플 텍스트 → TTS → S3 → HeyGen Talking Photo 비디오 생성.
    from app.services.pipeline import tts
    from app.services.pipeline.heygen import HeyGenError, create_video

    # 미리보기 대상이 교수자 본인 목소리(IVC 클론)면 v3 가 아니라 multilingual_v2
    # +클론 튜닝 세팅으로 합성한다(클론 fidelity 안정화).
    is_cloned = bool(voice_id and user.cloned_voice_id and voice_id == user.cloned_voice_id)
    try:
        result = await tts.synthesize(render_text, voice_id=voice_id, cloned=is_cloned)
        stored_audio_url = s3_svc.upload_audio_bytes(
            result.audio_bytes, f"avatar-preview-{user.id}"
        )
        audio_url = s3_svc.presign_stored_s3_url(stored_audio_url) or stored_audio_url
        video_id = await create_video(
            audio_url=audio_url,
            talking_photo_id=talking_photo_id,
            callback_id=f"avatar-preview:{user.id}",
        )
    except (HeyGenError, tts.TTSError) as e:
        return AvatarPreviewResponse(
            status="failed",
            voice_id=voice_id,
            message=f"미리보기 생성에 실패했습니다: {e}",
        )

    user.photo_avatar_preview_video_id = video_id
    user.photo_avatar_preview_voice_id = voice_id
    user.photo_avatar_preview_text = render_text
    user.photo_avatar_preview_url = None  # 새 렌더 시작 — 이전 캐시 무효화.
    await db.commit()

    return AvatarPreviewResponse(
        status="processing",
        voice_id=voice_id,
        message="움직이는 미리보기를 만들고 있습니다. 잠시만 기다려 주세요.",
    )


@router.get(
    "/api/avatars/me/preview",
    response_model=AvatarPreviewResponse,
    summary="본인 아바타 '움직이는 미리보기' 상태 폴링",
)
async def get_avatar_preview(
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """미리보기 렌더 상태를 조회한다.

    완성본이 캐시돼 있으면 즉시 ready. 진행 중이면 HeyGen 상태를 폴링하고,
    완료되면 영상을 S3 로 옮겨 캐시한 뒤 ready 로 전환한다.
    """
    if user.photo_avatar_preview_url:
        return AvatarPreviewResponse(
            status="ready",
            video_url=s3_svc.presign_stored_s3_url(user.photo_avatar_preview_url),
            voice_id=user.photo_avatar_preview_voice_id,
        )

    if not user.photo_avatar_preview_video_id:
        return AvatarPreviewResponse(status="not_started")

    from app.services.pipeline.heygen import HeyGenError, get_video_status

    try:
        st = await get_video_status(user.photo_avatar_preview_video_id)
    except HeyGenError:
        # 일시적 조회 실패 — 계속 진행 중으로 보고 다음 폴링을 기다린다.
        return AvatarPreviewResponse(
            status="processing", voice_id=user.photo_avatar_preview_voice_id
        )

    heygen_status = st.get("status")
    heygen_url = st.get("video_url")

    if heygen_status == "completed" and heygen_url:
        # HeyGen URL 은 만료되므로 S3 로 옮겨 영구 캐시한다.
        try:
            s3_url, _ = await s3_svc.upload_from_url(
                heygen_url, f"avatar-preview-{user.id}"
            )
        except Exception:  # 다운로드/업로드 실패 시 HeyGen URL 을 임시로 사용.
            s3_url = heygen_url
        user.photo_avatar_preview_url = s3_url
        user.photo_avatar_preview_video_id = None
        await db.commit()
        return AvatarPreviewResponse(
            status="ready",
            video_url=s3_svc.presign_stored_s3_url(s3_url) or s3_url,
            voice_id=user.photo_avatar_preview_voice_id,
        )

    if heygen_status in ("failed", "error"):
        user.photo_avatar_preview_video_id = None
        await db.commit()
        return AvatarPreviewResponse(
            status="failed",
            voice_id=user.photo_avatar_preview_voice_id,
            message="미리보기 렌더에 실패했습니다. 다시 시도해 주세요.",
        )

    return AvatarPreviewResponse(
        status="processing", voice_id=user.photo_avatar_preview_voice_id
    )


# ── 본인 음성 클로닝 (ElevenLabs Instant Voice Cloning) ───────────────────────


def _voice_clone_response(user: User) -> VoiceCloneResponse:
    """현재 user 의 cloned voice 상태를 응답 스키마로 변환."""
    if not user.cloned_voice_id:
        return VoiceCloneResponse(status="none")
    return VoiceCloneResponse(
        status="ready",
        voice_id=user.cloned_voice_id,
        name=user.cloned_voice_name,
        sample_url=s3_svc.presign_stored_s3_url(user.cloned_voice_sample_url),
    )


@router.get(
    "/api/avatars/me/voice",
    response_model=VoiceCloneResponse,
    summary="본인 음성(클론) 상태 조회",
)
async def get_my_voice(user: User = Depends(require_professor)):
    """교수자가 만든 본인 음성(ElevenLabs cloned voice) 상태를 반환한다.

    ``status="ready"`` 면 ``voice_id`` 가 ``GET /api/voices`` 계정 보이스로도
    노출돼 음성 패널·미리보기에서 바로 선택할 수 있다.
    """
    return _voice_clone_response(user)


@router.post(
    "/api/avatars/me/voice",
    response_model=VoiceCloneResponse,
    summary="음성 샘플(mp3 등) 업로드 → 본인 음성 클론 생성/교체",
)
async def create_my_voice(
    file: UploadFile = File(...),
    gender: str | None = Form(default=None),
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """업로드한 음성 샘플로 ElevenLabs Instant Voice Cloning(IVC)을 수행한다.

    - 1인 1개: 이미 본인 음성이 있으면 새 샘플로 교체하고, 이전 ElevenLabs
      voice 는 best-effort 로 삭제한다(쿼터·목록 정리).
    - 원본 샘플은 S3 에 보관(``cloned_voice_sample_url``).
    - 성공 시 ``cloned_voice_id`` 가 채워지고, 이후 ``GET /api/voices`` 에
      계정 보이스로 자동 노출된다(별도 연결 불필요).
    - ``gender`` ("male"|"female") 는 ElevenLabs label 로 전달해 음성 패널의
      남/여 그룹 분류에 쓰인다(선택).
    """
    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="빈 파일입니다."
        )
    if len(content) > _MAX_VOICE_SAMPLE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"음성 파일은 {_MAX_VOICE_SAMPLE // (1024 * 1024)}MB 이하여야 합니다.",
        )
    if not _looks_like_audio(content):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="mp3·m4a·wav 등 음성 파일만 업로드할 수 있습니다.",
        )

    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "mp3"
    if ext not in _VOICE_EXT_CTYPE:
        ext = "mp3"
    ctype = _VOICE_EXT_CTYPE[ext]

    # 원본 샘플 보관 — thumbnails/ 와 같은 사적 prefix 아래(응답은 presigned).
    s3_key = f"voice-samples/{user.id}/{uuid.uuid4().hex[:8]}.{ext}"
    s3_svc.upload_file(content, s3_key, content_type=ctype)
    sample_url = (
        f"https://{settings.S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{s3_key}"
    )

    from app.services.pipeline.elevenlabs_client import (
        ElevenLabsError,
        clone_voice,
        delete_voice,
    )

    labels: dict[str, str] | None = None
    g = (gender or "").strip().lower()
    if g in ("male", "female"):
        labels = {"gender": g}

    voice_name = f"{user.name} (본인 목소리)"
    try:
        result = await clone_voice(
            voice_name,
            [(file.filename or f"sample.{ext}", content)],
            description="ClassAuto 교수자 본인 음성 (IVC)",
            labels=labels,
        )
    except ElevenLabsError as e:
        # 샘플은 S3 에 남겨 둔다(원인 진단·재시도용). voice_id 는 미갱신.
        return VoiceCloneResponse(
            status="failed",
            sample_url=s3_svc.presign_stored_s3_url(sample_url),
            message=f"본인 음성 생성에 실패했습니다: {e}",
        )

    new_voice_id = result.get("voice_id")
    if not new_voice_id:
        return VoiceCloneResponse(
            status="failed",
            sample_url=s3_svc.presign_stored_s3_url(sample_url),
            message="본인 음성 생성에 실패했습니다: ElevenLabs 가 voice_id 를 반환하지 않았습니다.",
        )

    # 교체: 이전 cloned voice 는 best-effort 삭제(실패해도 진행).
    old_voice_id = user.cloned_voice_id
    if old_voice_id and old_voice_id != new_voice_id:
        try:
            await delete_voice(old_voice_id)
        except ElevenLabsError:
            pass

    user.cloned_voice_id = new_voice_id
    user.cloned_voice_name = voice_name
    user.cloned_voice_sample_url = sample_url
    await db.commit()

    return VoiceCloneResponse(
        status="ready",
        voice_id=new_voice_id,
        name=voice_name,
        sample_url=s3_svc.presign_stored_s3_url(sample_url),
        message="본인 음성이 생성되었습니다. 음성 목록에서 선택해 미리보기를 만들어 보세요.",
    )


@router.delete(
    "/api/avatars/me/voice",
    response_model=VoiceCloneResponse,
    summary="본인 음성(클론) 삭제",
)
async def delete_my_voice(
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """본인 음성 클론을 제거한다. ElevenLabs voice 도 best-effort 로 삭제."""
    voice_id = user.cloned_voice_id
    if voice_id:
        from app.services.pipeline.elevenlabs_client import ElevenLabsError, delete_voice

        try:
            await delete_voice(voice_id)
        except ElevenLabsError:
            pass
    user.cloned_voice_id = None
    user.cloned_voice_name = None
    user.cloned_voice_sample_url = None
    await db.commit()
    return VoiceCloneResponse(status="none", message="본인 음성을 삭제했습니다.")


@router.post(
    "/api/avatars/me/voice/script",
    response_model=VoiceScriptResponse,
    summary="본인 음성 녹음용 대본 생성 (한국어 학술 산문 ~500자)",
)
async def generate_voice_recording_script(
    payload: VoiceScriptRequest | None = Body(default=None),
    user: User = Depends(require_professor),
):
    """교수자가 ElevenLabs IVC 샘플을 녹음할 때 읽을 대본을 Claude 로 생성한다.

    ``topic`` (강의 제목 등) 이 주어지면 그 주제와 연관된 학술 산문을, 비어 있으면
    일반 학술문을 만든다. ``language`` (ko·en·zh·ja, 기본 ko) 로 대본 언어를 고른다.
    낭독하기 좋은 한 편의 산문(목록·표 없음)으로 약 500자, 호출마다 변형된다.
    모델은 전용 경량 모델(``VOICE_SCRIPT_MODEL``)·단발 호출·retry_external 백오프.
    """
    payload = payload or VoiceScriptRequest()

    # 키가 없으면 Claude 호출 자체가 불가 — 명확한 503 으로 응답한다.
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="대본 생성 기능이 일시적으로 비활성화되어 있습니다(ANTHROPIC_API_KEY 미설정).",
        )

    from app.services.voice_script import VoiceScriptError, generate_voice_script

    # anthropic SDK 는 동기·블로킹 — 이벤트 루프를 막지 않도록 스레드로 오프로드.
    try:
        script = await asyncio.to_thread(
            generate_voice_script, payload.topic, payload.language
        )
    except VoiceScriptError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e)
        ) from e

    return VoiceScriptResponse(script=script)


# ── Photo Avatar (Design with AI 룩) ─────────────────────────────────────────


@router.post(
    "/api/avatars/me/photo-avatar",
    response_model=PhotoAvatarStatusResponse,
    summary="사진 업로드 → Photo Avatar 그룹 생성 + 학습 시작",
)
async def create_photo_avatar(
    file: UploadFile = File(...),
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """증명사진으로 HeyGen Photo Avatar 그룹을 만들고 학습을 시작한다.

    학습은 비동기 — 진행 상태는 ``GET /api/avatars/me/photo-avatar`` 폴링으로 확인.
    학습이 끝나면(ready) ``POST /api/avatars/me/looks`` 로 Design with AI 룩을 만든다.
    """
    content = await file.read()
    if len(content) > _MAX_PROFILE_PHOTO:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"사진은 {_MAX_PROFILE_PHOTO // (1024 * 1024)}MB 이하여야 합니다.",
        )
    if content[:3] == _JPEG_MAGIC:
        ext, ctype = "jpg", "image/jpeg"
    elif content[:8] == _PNG_MAGIC:
        ext, ctype = "png", "image/png"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="JPEG 또는 PNG 이미지만 업로드할 수 있습니다.",
        )

    # v0.2 gpt 경로: train 없음. 사진을 S3 에 reference 로 저장만 하면 곧바로 룩
    # 생성이 가능하다(정체성 보존은 generate 시 input_fidelity 가 책임). 저장한 원본은
    # 모더레이션 거부 fallback(원본 그대로 Talking Photo)에도 재사용된다.
    if settings.PHOTO_AVATAR_PROVIDER == "gpt":
        s3_key = f"thumbnails/photo-avatar/{user.id}/source-{uuid.uuid4().hex[:8]}.{ext}"
        s3_svc.upload_file(content, s3_key, content_type=ctype)
        user.profile_image_url = (
            f"https://{settings.S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{s3_key}"
        )
        # group_id 없이 status 만 'ready' 로 둬 룩 생성 gate 를 연다(룩 생성 신호).
        user.photo_avatar_group_status = "ready"
        user.photo_avatar_group_error = None
        await db.commit()
        return PhotoAvatarStatusResponse(
            status="ready",
            message="사진이 업로드되었습니다. 이제 원하는 룩을 만들어 보세요.",
        )

    # ── 레거시 heygen 경로(롤백용): 그룹 생성 + train ──────────────────────────
    from app.services.pipeline.heygen import HeyGenError, create_photo_avatar_group

    # 그룹 생성만 동기로 한다. 학습(train)은 업로드 사진(look)이 'ready' 된 뒤에야
    # 가능하다 — 생성 직후 사진은 'pending' 이라 곧바로 train 하면 HeyGen 이
    # 400 "No valid image for training" 을 낸다. 사진 ready 대기→train→학습 폴링은
    # prepare_photo_avatar_training 태스크가 비동기로 잇는다.
    try:
        group_id = await create_photo_avatar_group(
            f"{user.name} avatar", content, content_type=ctype
        )
    except HeyGenError as e:
        logger.warning("Photo Avatar 그룹 생성 실패: user=%s, error=%s", user.id, e)
        return PhotoAvatarStatusResponse(
            status="failed", message=f"본인 아바타 생성에 실패했습니다: {e}"
        )

    user.photo_avatar_group_id = group_id
    user.photo_avatar_group_status = "training"
    user.photo_avatar_group_error = None  # 새 시도 — 이전 실패 사유 정리.
    await db.commit()

    from app.tasks.photo_avatar import prepare_photo_avatar_training

    prepare_photo_avatar_training.delay(str(user.id))

    return PhotoAvatarStatusResponse(
        group_id=group_id,
        status="training",
        message="본인 아바타를 준비 중입니다. 잠시만 기다려 주세요.",
    )


@router.get(
    "/api/avatars/me/photo-avatar",
    response_model=PhotoAvatarStatusResponse,
    summary="Photo Avatar 그룹 학습 상태 조회",
)
async def get_photo_avatar(user: User = Depends(require_professor)):
    """본인 Photo Avatar 그룹의 학습 상태를 반환한다."""
    # gpt 경로는 group/train 이 없다 — reference 사진이 올라가 있으면 룩 생성 가능(ready).
    if settings.PHOTO_AVATAR_PROVIDER == "gpt":
        if user.photo_avatar_group_status == "ready" and user.profile_image_url:
            return PhotoAvatarStatusResponse(status="ready")
        return PhotoAvatarStatusResponse(status="none")

    if not user.photo_avatar_group_id:
        return PhotoAvatarStatusResponse(status="none")
    raw = user.photo_avatar_group_status or "training"
    group_status = raw if raw in ("training", "ready", "failed") else "training"
    # 실패 시 사유 분류 코드를 함께 내려 프론트가 정확한 안내를 고르게 한다
    # (크레딧 부족을 "사진을 바꾸라"고 오안내하지 않도록).
    error_code = user.photo_avatar_group_error if group_status == "failed" else None
    return PhotoAvatarStatusResponse(
        group_id=user.photo_avatar_group_id,
        status=group_status,
        error_code=error_code,
    )


@router.post(
    "/api/avatars/me/looks",
    response_model=LookGenerateResponse,
    summary="Design with AI 룩 배치 생성",
)
async def generate_looks(
    payload: LookGenerateRequest,
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """프롬프트로 룩을 배치 생성한다(비동기).

    비용 통제: 1회 생성 수는 ``PHOTO_AVATAR_LOOK_BATCH_MAX`` 로, 교수자당 누적은
    ``PHOTO_AVATAR_LOOK_TOTAL_MAX`` 로 상한을 둔다.
    """
    # ── v0.2 gpt 경로: placeholder 행 선생성 → generate_gpt_looks 태스크 ──────────
    if settings.PHOTO_AVATAR_PROVIDER == "gpt":
        if user.photo_avatar_group_status != "ready" or not user.profile_image_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="먼저 사진을 업로드해 주세요.",
            )

        # 누적 상한은 소프트 처리 — 한도 도달 시 예외가 아니라 안내 메시지로 응답한다.
        # failed 룩은 누적에서 제외(실패가 한도를 잡아먹지 않도록).
        existing = (
            await db.execute(
                select(func.count())
                .select_from(PhotoAvatarLook)
                .where(
                    PhotoAvatarLook.user_id == user.id,
                    PhotoAvatarLook.status != LookStatus.failed.value,
                )
            )
        ).scalar() or 0
        remaining = settings.PHOTO_AVATAR_LOOK_TOTAL_MAX - existing
        if remaining <= 0:
            return LookGenerateResponse(
                status="failed",
                message=(
                    f"룩은 최대 {settings.PHOTO_AVATAR_LOOK_TOTAL_MAX}개까지 만들 수 있습니다. "
                    "기존 룩을 정리한 뒤 다시 시도해 주세요."
                ),
            )
        count = min(payload.count, settings.PHOTO_AVATAR_LOOK_BATCH_MAX, remaining)

        from app.services.pipeline.openai_image import build_prompt

        prompt = build_prompt(
            payload.persona or "educator",
            payload.outfit,
            payload.background,
            payload.expression,
            payload.extra,
            payload.prop,
            payload.pose,
        )
        rows = [
            PhotoAvatarLook(
                user_id=user.id,
                image_url=None,
                prompt=prompt,
                status=LookStatus.generating.value,
            )
            for _ in range(count)
        ]
        db.add_all(rows)
        await db.flush()  # id 확정 — 태스크가 id 로 행을 채운다(idempotent 키).
        look_ids = [str(r.id) for r in rows]
        await db.commit()

        from app.tasks.photo_avatar import generate_gpt_looks

        generate_gpt_looks.delay(
            str(user.id),
            look_ids,
            payload.persona or "educator",
            payload.outfit,
            payload.background,
            payload.expression,
            payload.extra,
            payload.prop,
            payload.pose,
        )
        return LookGenerateResponse(
            generation_id=None,
            status="generating",
            message=f"룩 {count}개를 생성하고 있습니다.",
        )

    # ── 레거시 heygen 경로(Design with AI) ───────────────────────────────────────
    if not user.photo_avatar_group_id or user.photo_avatar_group_status != "ready":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="본인 아바타 학습이 끝난 뒤에 룩을 생성할 수 있습니다.",
        )

    count = min(payload.count, settings.PHOTO_AVATAR_LOOK_BATCH_MAX)
    existing = (
        await db.execute(
            select(func.count())
            .select_from(PhotoAvatarLook)
            .where(PhotoAvatarLook.user_id == user.id)
        )
    ).scalar() or 0
    if existing + count > settings.PHOTO_AVATAR_LOOK_TOTAL_MAX:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"룩은 최대 {settings.PHOTO_AVATAR_LOOK_TOTAL_MAX}개까지 만들 수 있습니다.",
        )

    from app.services.pipeline.heygen import HeyGenError, generate_photo_avatar_looks

    try:
        generation_id = await generate_photo_avatar_looks(
            user.photo_avatar_group_id, payload.prompt, count
        )
    except HeyGenError as e:
        return LookGenerateResponse(
            status="failed", message=f"룩 생성에 실패했습니다: {e}"
        )

    from app.tasks.photo_avatar import poll_photo_avatar_looks

    poll_photo_avatar_looks.delay(str(user.id), generation_id, payload.prompt, count)

    return LookGenerateResponse(
        generation_id=generation_id,
        status="generating",
        message=f"룩 {count}개를 생성하고 있습니다.",
    )


@router.get(
    "/api/avatars/me/looks",
    response_model=list[LookItem],
    summary="생성된 룩 목록",
)
async def list_looks(
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """본인 Photo Avatar 룩 목록을 최신순으로 반환한다(맨 배열).

    프론트 온보딩 래퍼(photoAvatarApi.listLooks)가 배열을 직접 map 하므로
    래핑 없이 ``list[LookItem]`` 으로 응답한다.
    """
    rows = (
        await db.execute(
            select(PhotoAvatarLook)
            .where(PhotoAvatarLook.user_id == user.id)
            .order_by(PhotoAvatarLook.created_at.desc())
        )
    ).scalars().all()
    items: list[LookItem] = []
    for r in rows:
        # 룩 식별자: v0.2 gpt=내부 uuid, 레거시=heygen_look_id.
        lid = r.heygen_look_id or str(r.id)
        items.append(
            LookItem(
                look_id=lid,
                # gpt: S3 영구 URL 을 presigned 로 서빙. 레거시: HeyGen 외부 URL 은
                # presign_stored_s3_url 이 우리 버킷이 아니면 그대로 통과시킨다.
                image_url=s3_svc.presign_stored_s3_url(r.image_url),
                preview_image_url=s3_svc.presign_stored_s3_url(
                    r.preview_image_url or r.image_url
                ),
                prompt=r.prompt,
                name=r.name,
                status=r.status if r.status in ("generating", "ready", "failed") else "ready",
                is_default=(lid == user.photo_avatar_default_look_id),
                saved=r.saved_to_library,
                created_at=r.created_at,
            )
        )
    return items


@router.post(
    "/api/avatars/me/looks/{look_id}/select",
    response_model=LookSelectResponse,
    summary="기본 아바타 룩 선택",
)
async def select_look(
    look_id: str,
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """지정한 룩을 기본 룩으로 설정한다(강의 렌더의 본인 얼굴 기본값).

    v0.2 gpt: 룩 이미지를 Talking Photo 로 등록해 ``user.photo_avatar_id`` 로 확정하고
    이전 미리보기 캐시를 무효화한다(얼굴 교체). 레거시 heygen: 룩 id 를 기본값으로만 둔다.
    """
    # 룩 해석 — gpt 는 내부 uuid, 레거시는 heygen_look_id. 둘 다 시도한다.
    row = None
    try:
        row = (
            await db.execute(
                select(PhotoAvatarLook).where(
                    PhotoAvatarLook.user_id == user.id,
                    PhotoAvatarLook.id == uuid.UUID(look_id),
                )
            )
        ).scalar_one_or_none()
    except ValueError:
        row = None
    if row is None:
        row = (
            await db.execute(
                select(PhotoAvatarLook).where(
                    PhotoAvatarLook.user_id == user.id,
                    PhotoAvatarLook.heygen_look_id == look_id,
                )
            )
        ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="해당 룩을 찾을 수 없습니다."
        )
    if row.status != LookStatus.ready.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="아직 준비되지 않은 룩입니다.",
        )

    # 2026-06-01: select 시점에 HeyGen 호출하지 않는다(사용자 요청 "최후에만 헤이젠").
    # default_look_id 만 저장하고, HeyGen Talking Photo 등록은 ``preview`` (또는 첫
    # 강의 렌더) 진입 시 ``_ensure_photo_avatar_id`` 가 lazy 로 처리한다.
    if settings.PHOTO_AVATAR_PROVIDER == "gpt" and not row.image_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이 룩에는 이미지가 없습니다.",
        )

    # 기본 룩만 바꾼다. 이전 talking_photo_id 는 여기서 비우지 않는다 — 다음 렌더
    # 시점에 _ensure_photo_avatar_id 가 (룩이 실제로 바뀌었으면) 이전 것을 HeyGen 에서
    # 삭제해 슬롯을 회수한 뒤 새로 만든다. 같은 룩이면 재사용한다(Photo Avatar 한도
    # 누적 초과 방지, 2026-06-04). 미리보기 캐시(옛 얼굴)는 무효화한다.
    user.photo_avatar_preview_url = None
    user.photo_avatar_preview_video_id = None
    user.photo_avatar_preview_voice_id = None
    user.photo_avatar_preview_text = None
    user.photo_avatar_default_look_id = look_id
    # 기본 룩 지정 = 확정 → 라이브러리에도 자동 저장(사용자 결정 2026-06-02).
    row.saved_to_library = True
    await db.commit()
    return LookSelectResponse(
        default_look_id=look_id,
        message="기본 아바타 룩으로 설정했습니다. 미리보기를 만들 때 본인 아바타가 자동 등록됩니다.",
    )


@router.post(
    "/api/avatars/me/looks/{look_id}/save",
    response_model=dict,
    summary="룩 라이브러리에 저장 (확정)",
)
async def save_look_to_library(
    look_id: str,
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """후보 룩을 라이브러리에 저장(확정)한다.

    온보딩에서 생성한 룩은 후보일 뿐이고, 이 엔드포인트(또는 기본 룩 지정)로
    확정한 것만 라이브러리에 노출된다. 라이브러리 상한
    (``PHOTO_AVATAR_LIBRARY_MAX``)을 초과하면 400 으로 막는다.
    """
    row = None
    try:
        row = (
            await db.execute(
                select(PhotoAvatarLook).where(
                    PhotoAvatarLook.user_id == user.id,
                    PhotoAvatarLook.id == uuid.UUID(look_id),
                )
            )
        ).scalar_one_or_none()
    except ValueError:
        row = None
    if row is None:
        row = (
            await db.execute(
                select(PhotoAvatarLook).where(
                    PhotoAvatarLook.user_id == user.id,
                    PhotoAvatarLook.heygen_look_id == look_id,
                )
            )
        ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="해당 룩을 찾을 수 없습니다."
        )
    if row.status != LookStatus.ready.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="아직 준비되지 않은 룩입니다.",
        )

    if not row.saved_to_library:
        saved_count = (
            await db.execute(
                select(func.count())
                .select_from(PhotoAvatarLook)
                .where(
                    PhotoAvatarLook.user_id == user.id,
                    PhotoAvatarLook.saved_to_library.is_(True),
                )
            )
        ).scalar() or 0
        if saved_count >= settings.PHOTO_AVATAR_LIBRARY_MAX:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"라이브러리는 최대 {settings.PHOTO_AVATAR_LIBRARY_MAX}개까지 "
                    "저장할 수 있습니다. 기존 항목을 정리한 뒤 다시 시도해 주세요."
                ),
            )
        row.saved_to_library = True
        await db.commit()
    return {"ok": True, "saved": True}


@router.delete(
    "/api/avatars/me/looks/{look_id}",
    response_model=dict,
    summary="룩 삭제 (라이브러리 정리)",
)
async def delete_look(
    look_id: str,
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """교수자의 룩 1개를 라이브러리에서 삭제한다.

    - gpt 경로: 내부 UUID 로 식별. 레거시 heygen 경로: heygen_look_id 로도 시도(select 동일).
    - 누적 cap(``PHOTO_AVATAR_LOOK_TOTAL_MAX``) 에서 즉시 빠진다 → 새 룩 생성 여유 확보.
    - 기본 룩으로 선택돼 있으면 ``photo_avatar_default_look_id`` 도 함께 해제.
      이미 Talking Photo 로 확정된 아바타(``photo_avatar_id``)는 별개로 보존
      (사진 본체가 사라지는 게 아니라 라이브러리 카드만 정리하는 의미).
    - S3 원본 이미지는 비동기 정리(향후) — 본 PR은 DB row 삭제까지만 한다(소액 leak,
      cap 회복이 우선).
    """
    row = None
    try:
        row = (
            await db.execute(
                select(PhotoAvatarLook).where(
                    PhotoAvatarLook.user_id == user.id,
                    PhotoAvatarLook.id == uuid.UUID(look_id),
                )
            )
        ).scalar_one_or_none()
    except ValueError:
        row = None
    if row is None:
        row = (
            await db.execute(
                select(PhotoAvatarLook).where(
                    PhotoAvatarLook.user_id == user.id,
                    PhotoAvatarLook.heygen_look_id == look_id,
                )
            )
        ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="해당 룩을 찾을 수 없습니다."
        )

    # 기본 룩으로 선택돼 있으면 해제(다음 사용 시 사용자가 다시 골라야 함).
    if user.photo_avatar_default_look_id == look_id:
        user.photo_avatar_default_look_id = None

    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.patch(
    "/api/avatars/me/looks/{look_id}/name",
    response_model=dict,
    summary="룩 이름 변경 (라이브러리 표시명)",
)
async def rename_look(
    look_id: str,
    payload: LookNameUpdate,
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """라이브러리 룩에 교수자가 직접 붙이는 표시 이름을 저장한다.

    영어 prompt 를 표시명으로 노출하던 것을 대체한다(연필 아이콘). 공백/빈 문자열은
    이름 해제(NULL)로 처리한다. 식별은 삭제·선택과 동일하게 내부 UUID 우선, 레거시
    heygen_look_id 폴백.
    """
    row = None
    try:
        row = (
            await db.execute(
                select(PhotoAvatarLook).where(
                    PhotoAvatarLook.user_id == user.id,
                    PhotoAvatarLook.id == uuid.UUID(look_id),
                )
            )
        ).scalar_one_or_none()
    except ValueError:
        row = None
    if row is None:
        row = (
            await db.execute(
                select(PhotoAvatarLook).where(
                    PhotoAvatarLook.user_id == user.id,
                    PhotoAvatarLook.heygen_look_id == look_id,
                )
            )
        ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="해당 룩을 찾을 수 없습니다."
        )

    name = (payload.name or "").strip()
    row.name = name[:80] or None
    await db.commit()
    return {"ok": True, "name": row.name}


# ── 최근 선택한 아바타 (라이브러리 즉시 선택·적용) ────────────────────────────
#
# "기본 룩"(photo_avatar_default_look_id, 모든 강의의 폴백)과 별개로, 교수자가
# 가장 최근에 고른 아바타/룩을 기억한다. 표준 HeyGen avatar_id 든 본인 룩
# heygen_look_id(둘 다 렌더용 avatar_id)든 그대로 저장하며, 프론트가 이미 가진
# 목록에서 해석해 "최근 선택한 아바타" 박스로 복원한다(재생성 없이 바로 적용).


@router.get(
    "/api/avatars/me/recent",
    response_model=RecentAvatarResponse,
    summary="가장 최근 선택한 아바타",
)
async def get_recent_avatar(user: User = Depends(require_professor)):
    """가장 최근 선택한 아바타/룩 id 를 반환한다(없으면 null)."""
    return RecentAvatarResponse(avatar_id=user.recent_avatar_id)


@router.post(
    "/api/avatars/me/recent",
    response_model=RecentAvatarResponse,
    summary="가장 최근 선택한 아바타 기록",
)
async def set_recent_avatar(
    payload: RecentAvatarRequest,
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """가장 최근 선택한 아바타/룩을 기록한다(재생성 없는 단순 선택 기록).

    값이 본인 룩이면 ready 인 것만 허용한다(미완 룩은 노출·적용 대상이 아님).
    표준 HeyGen 아바타·Talking Photo id 는 그대로 수용한다(프론트가 큐레이션된
    목록에서만 보내므로 추가 검증 불필요).
    """
    avatar_id = payload.avatar_id.strip()
    if not avatar_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="아바타 id 가 비어 있습니다."
        )
    look = (
        await db.execute(
            select(PhotoAvatarLook).where(
                PhotoAvatarLook.user_id == user.id,
                PhotoAvatarLook.heygen_look_id == avatar_id,
            )
        )
    ).scalar_one_or_none()
    if look is not None and look.status != LookStatus.ready.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="아직 준비되지 않은 룩입니다.",
        )
    user.recent_avatar_id = avatar_id
    await db.commit()
    return RecentAvatarResponse(avatar_id=avatar_id)


# ── 내 아바타 (룩 + 음성 조합 라이브러리) ──────────────────────────────────────
#
# 룩만 저장하던 라이브러리(GET /api/avatars/me/looks)의 상위 개념. 교수자가 고른
# 룩 + 음성을 한 묶음으로 저장(saved_avatars)해, 재방문 시 재선택·재렌더 없이 바로
# 강의에 적용한다. 말하는 미리보기 영상은 user 단일 캐시가 아니라 조합 단위로 보관해
# 덮어쓰기 없이 갤러리에서 재생한다.


def _saved_preview_status(row: SavedAvatar) -> str:
    """saved_avatar 행의 미리보기 상태를 산출(저장값으로만 판정)."""
    if row.preview_video_url:
        return "ready"
    if row.preview_video_id:
        return "processing"
    return "none"


def _saved_avatar_item(row: SavedAvatar) -> SavedAvatarItem:
    """SavedAvatar 행 → 응답 스키마(미리보기 URL 은 presigned)."""
    return SavedAvatarItem(
        id=str(row.id),
        name=row.name,
        look_id=row.look_id,
        voice_id=row.voice_id,
        avatar_scale=row.avatar_scale,
        preview_video_url=s3_svc.presign_stored_s3_url(row.preview_video_url),
        preview_status=_saved_preview_status(row),
        created_at=row.created_at,
    )


async def _resolve_look(
    user: User, db: AsyncSession, look_id: str
) -> PhotoAvatarLook | None:
    """룩 식별자(내부 uuid 또는 heygen_look_id)로 본인 룩 행을 찾는다.

    select_look/save/delete 와 동일한 식별 규칙(gpt=uuid, 레거시=heygen_look_id).
    """
    row = None
    try:
        row = (
            await db.execute(
                select(PhotoAvatarLook).where(
                    PhotoAvatarLook.user_id == user.id,
                    PhotoAvatarLook.id == uuid.UUID(look_id),
                )
            )
        ).scalar_one_or_none()
    except ValueError:
        row = None
    if row is None:
        row = (
            await db.execute(
                select(PhotoAvatarLook).where(
                    PhotoAvatarLook.user_id == user.id,
                    PhotoAvatarLook.heygen_look_id == look_id,
                )
            )
        ).scalar_one_or_none()
    return row


async def _get_saved(user: User, db: AsyncSession, saved_id: str) -> SavedAvatar:
    """본인 소유의 saved_avatar 행을 가져온다(없으면 404)."""
    try:
        sid = uuid.UUID(saved_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="해당 아바타를 찾을 수 없습니다."
        ) from e
    row = (
        await db.execute(
            select(SavedAvatar).where(
                SavedAvatar.user_id == user.id, SavedAvatar.id == sid
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="해당 아바타를 찾을 수 없습니다."
        )
    return row


async def _renderable_character_for_look(
    look: PhotoAvatarLook, keep_id: str | None
) -> tuple[str | None, str | None]:
    """룩을 HeyGen create_video 의 character 로 변환해 (avatar_id, talking_photo_id) 반환.

    - 레거시 heygen 룩(``heygen_look_id`` 있음): avatar_id 로 그대로 렌더.
    - gpt 룩(``image_url`` 있음): 이미지를 Talking Photo 로 등록해 talking_photo_id 로 렌더.
      ``keep_id`` 는 한도 정리 시 보호할 기존 talking photo(현재 사용 중인 본인 아바타).
    """
    if look.heygen_look_id:
        return look.heygen_look_id, None
    if not look.image_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이 룩에는 렌더할 이미지가 없습니다.",
        )

    from urllib.parse import urlparse

    from app.services.pipeline.heygen import HeyGenError

    key = urlparse(look.image_url).path.lstrip("/")
    ctype = "image/png" if key.lower().endswith(".png") else "image/jpeg"
    try:
        img_bytes = s3_svc.download_file(key)
    except Exception as e:  # noqa: BLE001 — S3 다운로드 실패
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"룩 이미지를 불러오지 못했습니다(S3): {e}",
        ) from e

    safe_bytes, safe_ctype = _ensure_talking_photo_payload(img_bytes, ctype)
    try:
        tp_id = await _register_talking_photo_with_cleanup(
            safe_bytes, safe_ctype, keep_id=keep_id
        )
    except HeyGenError as e:
        hint = ""
        if "exceeded your limit" in str(e) or "401028" in str(e):
            hint = (
                " — HeyGen 계정의 Photo Avatar 한도에 도달했습니다. 잠시 후 다시 "
                "시도하거나 HeyGen 플랜을 업그레이드해 주세요."
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"미리보기용 아바타 등록에 실패했습니다(HeyGen): {e}{hint}",
        ) from e
    return None, tp_id


async def _refresh_saved_preview(row: SavedAvatar, db: AsyncSession) -> None:
    """진행 중(preview_video_id 있음) 미리보기를 폴링해 완료 시 S3 로 옮겨 캐시한다.

    get_avatar_preview 와 동일 패턴 — HeyGen URL 은 만료되므로 영구 S3 로 이전한다.
    실패/일시 오류는 상태만 정리하고 조용히 넘긴다(목록 조회를 막지 않는다).
    """
    from app.services.pipeline.heygen import HeyGenError, get_video_status

    try:
        st = await get_video_status(row.preview_video_id)
    except HeyGenError:
        return  # 일시 조회 실패 — 다음 폴링까지 processing 유지.

    heygen_status = st.get("status")
    heygen_url = st.get("video_url")
    if heygen_status == "completed" and heygen_url:
        try:
            s3_url, _ = await s3_svc.upload_from_url(
                heygen_url, f"saved-avatar-{row.id}"
            )
        except Exception:  # noqa: BLE001 — 이전 실패 시 HeyGen URL 임시 사용.
            s3_url = heygen_url
        row.preview_video_url = s3_url
        row.preview_video_id = None
        await db.commit()
    elif heygen_status in ("failed", "error"):
        row.preview_video_id = None
        await db.commit()


@router.get(
    "/api/avatars/me/saved",
    response_model=list[SavedAvatarItem],
    summary="내 아바타(룩+음성 조합) 목록",
)
async def list_saved_avatars(
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """저장된 '룩+음성' 조합 아바타를 최신순으로 반환한다(맨 배열).

    진행 중인 미리보기가 있으면 HeyGen 상태를 폴링해 완료 시 S3 로 옮겨 캐시한다.
    """
    rows = (
        await db.execute(
            select(SavedAvatar)
            .where(SavedAvatar.user_id == user.id)
            .order_by(SavedAvatar.created_at.desc())
        )
    ).scalars().all()
    for row in rows:
        if row.preview_video_id and not row.preview_video_url:
            await _refresh_saved_preview(row, db)
    return [_saved_avatar_item(r) for r in rows]


@router.post(
    "/api/avatars/me/saved",
    response_model=SavedAvatarItem,
    status_code=status.HTTP_201_CREATED,
    summary="룩+음성 조합 아바타 저장",
)
async def create_saved_avatar(
    payload: SavedAvatarCreate,
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """선택한 룩 + 음성을 '내 아바타' 1개로 저장한다(재렌더 없음).

    룩은 본인 소유 + ready 여야 한다. 저장 수는 ``PHOTO_AVATAR_SAVED_MAX`` 로 상한.
    """
    look = await _resolve_look(user, db, payload.look_id)
    if look is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="해당 룩을 찾을 수 없습니다."
        )
    if look.status != LookStatus.ready.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="아직 준비되지 않은 룩입니다."
        )

    saved_count = (
        await db.execute(
            select(func.count())
            .select_from(SavedAvatar)
            .where(SavedAvatar.user_id == user.id)
        )
    ).scalar() or 0
    if saved_count >= settings.PHOTO_AVATAR_SAVED_MAX:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"내 아바타는 최대 {settings.PHOTO_AVATAR_SAVED_MAX}개까지 저장할 수 "
                "있습니다. 기존 항목을 정리한 뒤 다시 시도해 주세요."
            ),
        )

    row = SavedAvatar(
        user_id=user.id,
        name=payload.name.strip()[:80],
        look_id=payload.look_id,
        voice_id=payload.voice_id,
        avatar_scale=payload.avatar_scale,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _saved_avatar_item(row)


@router.patch(
    "/api/avatars/me/saved/{saved_id}",
    response_model=SavedAvatarItem,
    summary="내 아바타 수정(이름/음성)",
)
async def update_saved_avatar(
    saved_id: str,
    payload: SavedAvatarUpdate,
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """저장된 아바타의 표시 이름·음성을 부분 수정한다.

    voice_id 가 바뀌면 기존 미리보기 캐시(옛 음성)는 무효화한다. 전송된 필드만
    수정한다(model_fields_set 으로 '미전송' 과 'null 전송' 구분).
    """
    row = await _get_saved(user, db, saved_id)
    fields = payload.model_fields_set
    if "name" in fields and payload.name is not None:
        nm = payload.name.strip()
        if nm:
            row.name = nm[:80]
    if "voice_id" in fields and row.voice_id != payload.voice_id:
        row.voice_id = payload.voice_id
        # 음성이 바뀌었으니 옛 음성으로 만든 미리보기는 무효.
        row.preview_video_url = None
        row.preview_video_id = None
        row.preview_voice_id = None
        row.preview_text = None
    await db.commit()
    await db.refresh(row)
    return _saved_avatar_item(row)


@router.delete(
    "/api/avatars/me/saved/{saved_id}",
    response_model=dict,
    summary="내 아바타 삭제",
)
async def delete_saved_avatar(
    saved_id: str,
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """저장된 아바타 1개를 삭제한다(룩·음성 원본은 보존, 조합 카드만 제거)."""
    row = await _get_saved(user, db, saved_id)
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.post(
    "/api/avatars/me/saved/{saved_id}/preview",
    response_model=SavedAvatarItem,
    summary="내 아바타 말하는 미리보기 렌더",
)
async def render_saved_avatar_preview(
    saved_id: str,
    payload: SavedAvatarPreviewRequest | None = Body(default=None),
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """저장된 조합(룩+음성)으로 짧은 말하는 영상을 1회 렌더해 이 행에 캐시한다.

    같은 음성·대본의 완성본이 있으면 즉시 반환(HeyGen 비용 절감). 상태 갱신·완료
    수령은 ``GET /api/avatars/me/saved`` 폴링이 담당한다.
    """
    payload = payload or SavedAvatarPreviewRequest()
    row = await _get_saved(user, db, saved_id)
    look = await _resolve_look(user, db, row.look_id)
    if look is None or look.status != LookStatus.ready.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이 아바타의 룩을 사용할 수 없습니다.",
        )

    render_text = (payload.text or "").strip() or _PREVIEW_TEXT
    cached_text = row.preview_text or _PREVIEW_TEXT

    # 캐시 적중: 강제 아님 + 완성본 + 같은 음성 + 같은 대본.
    if (
        not payload.force
        and row.preview_video_url
        and row.preview_voice_id == row.voice_id
        and cached_text == render_text
    ):
        return _saved_avatar_item(row)
    # 이미 렌더 중 + 강제 아님 → 새로 시작하지 않는다.
    if not payload.force and row.preview_video_id:
        return _saved_avatar_item(row)

    from app.services.pipeline import tts
    from app.services.pipeline.heygen import HeyGenError, create_video

    avatar_id, talking_photo_id = await _renderable_character_for_look(
        look, keep_id=user.photo_avatar_id
    )
    is_cloned = bool(
        row.voice_id and user.cloned_voice_id and row.voice_id == user.cloned_voice_id
    )
    try:
        result = await tts.synthesize(
            render_text, voice_id=row.voice_id, cloned=is_cloned
        )
        stored_audio_url = s3_svc.upload_audio_bytes(
            result.audio_bytes, f"saved-avatar-{row.id}"
        )
        audio_url = s3_svc.presign_stored_s3_url(stored_audio_url) or stored_audio_url
        video_id = await create_video(
            audio_url=audio_url,
            avatar_id=avatar_id,
            talking_photo_id=talking_photo_id,
            avatar_scale=row.avatar_scale,
            callback_id=f"saved-avatar:{row.id}",
        )
    except (HeyGenError, tts.TTSError) as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"미리보기 생성에 실패했습니다: {e}",
        ) from e

    row.preview_video_id = video_id
    row.preview_voice_id = row.voice_id
    row.preview_text = render_text
    row.preview_video_url = None  # 새 렌더 시작 — 이전 캐시 무효화.
    await db.commit()
    await db.refresh(row)
    return _saved_avatar_item(row)


@router.post(
    "/api/avatars/me/saved/{saved_id}/apply",
    response_model=dict,
    summary="내 아바타를 강의에 적용",
)
async def apply_saved_avatar(
    saved_id: str,
    payload: SavedAvatarApply,
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """저장된 조합(룩+음성)을 지정한 강의에 한 번에 적용한다.

    lecture.avatar_id(=look_id) + voice_id + avatar_name + avatar_scale 를 설정한다.
    강의는 본인(course.instructor_id) 소유여야 한다.
    """
    row = await _get_saved(user, db, saved_id)
    try:
        lid = uuid.UUID(payload.lecture_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="강의를 찾을 수 없습니다."
        ) from e
    lecture = (
        await db.execute(
            select(Lecture)
            .join(Course, Lecture.course_id == Course.id)
            .where(Lecture.id == lid, Course.instructor_id == user.id)
        )
    ).scalar_one_or_none()
    if lecture is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="강의를 찾을 수 없습니다."
        )

    lecture.avatar_id = row.look_id
    lecture.avatar_name = row.name
    lecture.avatar_scale = row.avatar_scale
    lecture.voice_id = row.voice_id
    await db.commit()
    return {"ok": True}


# ── 표준 아바타 (HeyGen 웹 스튜디오 Video Avatar 등록) ─────────────────────────
#
# Pay-As-You-Go 등급은 커스텀 Video Avatar 를 API 로 "생성"할 수 없다(Enterprise
# 전용). 대신 교수자가 웹 스튜디오에서 만든 Video Avatar 의 avatar_id 를 여기에
# 등록해 두면 갤러리에서 골라 강의에 적용할 수 있고, 렌더 시 HeyGen 이 그대로
# character.type="avatar" 로 사용한다(qa_batch._resolve_character). Photo Avatar
# (Talking Photo, 몸 고정)와 달리 전신이 자연스럽게 움직이는 비교용 아바타.


def _standard_avatar_item(row: StandardAvatar) -> StandardAvatarItem:
    """StandardAvatar row → 응답 스키마. 미리보기 URL 은 HeyGen 외부 URL 그대로."""
    return StandardAvatarItem(
        id=str(row.id),
        avatar_id=row.heygen_avatar_id,
        name=row.name,
        preview_image_url=row.preview_image_url,
        preview_video_url=row.preview_video_url,
        gender=row.gender,
        created_at=row.created_at,
    )


@router.get(
    "/api/avatars/me/standard",
    response_model=list[StandardAvatarItem],
    summary="등록한 표준 아바타 목록",
)
async def list_standard_avatars(
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """교수자가 등록한 표준 Video Avatar 목록을 최신순으로 반환한다(맨 배열).

    프론트(avatarsApi.listMyStandardAvatars)가 배열을 직접 map 하므로 래핑 없이
    ``list[StandardAvatarItem]`` 으로 응답한다.
    """
    rows = (
        await db.execute(
            select(StandardAvatar)
            .where(StandardAvatar.user_id == user.id)
            .order_by(StandardAvatar.created_at.desc())
        )
    ).scalars().all()
    return [_standard_avatar_item(r) for r in rows]


@router.get(
    "/api/avatars/heygen-account",
    response_model=list[AvatarMeta],
    summary="HeyGen 계정의 전체 아바타 목록 (표준 아바타 등록 피커용)",
)
async def list_heygen_account_avatars(
    user: User = Depends(require_professor),
):
    """HeyGen ``/v2/avatars`` 의 전체 아바타 목록을 그대로 반환한다(큐레이션 없음).

    표준 아바타 등록 화면의 "내 아바타 고르기" 피커가 쓴다. 교수자는 avatar_id 를
    직접 찾을 필요 없이, 본인이 웹 스튜디오에서 지은 아바타 이름으로 검색해 고른다.
    공개 샘플 아바타도 함께 포함되므로(HeyGen 이 소유 구분 필드를 안정적으로 주지
    않음), 프론트는 이름 검색으로 본인 것을 찾게 한다. 여기서 고른 id 는 곧 이
    엔드포인트의 출처(``/v2/avatars``)에 존재하므로 등록 검증을 항상 통과한다.

    MOCK 환경은 빈 목록을 돌려준다(외부 호출 0).
    """
    if settings.HEYGEN_MOCK:
        return []

    from app.services.pipeline.heygen import (
        HeyGenError,
        list_avatars as heygen_list_avatars,
    )

    try:
        avatars = await heygen_list_avatars()
    except HeyGenError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"HeyGen 아바타 목록을 불러오지 못했습니다: {e}",
        ) from e

    items: list[AvatarMeta] = []
    for a in avatars:
        avatar_id = a.get("avatar_id")
        if not avatar_id:
            continue
        items.append(
            AvatarMeta(
                avatar_id=avatar_id,
                avatar_name=a.get("avatar_name") or "Avatar",
                gender=a.get("gender"),
                preview_image_url=a.get("preview_image_url"),
                preview_video_url=a.get("preview_video_url"),
                is_custom=False,
            )
        )
    return items


@router.post(
    "/api/avatars/me/standard",
    response_model=StandardAvatarItem,
    summary="표준 아바타 등록 (HeyGen avatar_id)",
)
async def register_standard_avatar(
    payload: StandardAvatarRegisterRequest,
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """HeyGen Video Avatar 의 avatar_id 를 등록한다.

    HeyGen ``/v2/avatars`` 에서 그 id 를 조회해 미리보기·성별 메타데이터를 함께
    보관한다. 계정 아바타 목록에 없는 id 면 404 로 안내한다(오타·권한). 이미 같은
    avatar_id 를 등록했으면 이름만 갱신해 멱등하게 반환한다.
    """
    avatar_id = payload.avatar_id.strip()
    if not avatar_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="아바타 id 가 비어 있습니다."
        )

    # 이미 등록된 같은 avatar_id 가 있으면 이름만 갱신(중복 행 방지, 멱등).
    existing = (
        await db.execute(
            select(StandardAvatar).where(
                StandardAvatar.user_id == user.id,
                StandardAvatar.heygen_avatar_id == avatar_id,
            )
        )
    ).scalar_one_or_none()

    # HeyGen 메타데이터 조회 — MOCK 환경은 외부 호출 없이 통과(개발/테스트).
    meta: dict | None = None
    if not settings.HEYGEN_MOCK:
        from app.services.pipeline.heygen import (
            HeyGenError,
            list_avatars as heygen_list_avatars,
        )

        try:
            avatars = await heygen_list_avatars()
        except HeyGenError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"HeyGen 아바타 목록을 불러오지 못했습니다: {e}",
            ) from e
        meta = next((a for a in avatars if a.get("avatar_id") == avatar_id), None)
        if meta is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "이 avatar_id 를 HeyGen 계정에서 찾을 수 없습니다. 웹 스튜디오에서 "
                    "만든 Video Avatar 의 정확한 avatar_id 인지 확인해 주세요."
                ),
            )

    name = (payload.name or "").strip()[:80] or None
    # 이름 미지정 시 HeyGen 아바타 이름을 폴백으로 사용.
    fallback_name = (meta or {}).get("avatar_name") if meta else None
    resolved_name = name or (fallback_name[:80] if fallback_name else None)

    if existing is not None:
        existing.name = resolved_name
        if meta:
            existing.preview_image_url = meta.get("preview_image_url")
            existing.preview_video_url = meta.get("preview_video_url")
            existing.gender = meta.get("gender")
        await db.commit()
        await db.refresh(existing)
        return _standard_avatar_item(existing)

    row = StandardAvatar(
        user_id=user.id,
        heygen_avatar_id=avatar_id,
        name=resolved_name,
        preview_image_url=(meta or {}).get("preview_image_url") if meta else None,
        preview_video_url=(meta or {}).get("preview_video_url") if meta else None,
        gender=(meta or {}).get("gender") if meta else None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _standard_avatar_item(row)


@router.patch(
    "/api/avatars/me/standard/{record_id}/name",
    response_model=dict,
    summary="표준 아바타 이름 변경",
)
async def rename_standard_avatar(
    record_id: str,
    payload: StandardAvatarNameUpdate,
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """등록한 표준 아바타의 표시 이름을 저장한다(연필). 공백/빈 문자열은 해제(NULL)."""
    try:
        rid = uuid.UUID(record_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="해당 아바타를 찾을 수 없습니다."
        )
    row = (
        await db.execute(
            select(StandardAvatar).where(
                StandardAvatar.user_id == user.id,
                StandardAvatar.id == rid,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="해당 아바타를 찾을 수 없습니다."
        )
    name = (payload.name or "").strip()
    row.name = name[:80] or None
    await db.commit()
    return {"ok": True, "name": row.name}


@router.delete(
    "/api/avatars/me/standard/{record_id}",
    response_model=dict,
    summary="표준 아바타 등록 해제",
)
async def delete_standard_avatar(
    record_id: str,
    user: User = Depends(require_professor),
    db: AsyncSession = Depends(get_db),
):
    """등록한 표준 아바타를 갤러리에서 제거한다(등록 해제).

    HeyGen 의 Video Avatar 자체는 건드리지 않는다(웹 스튜디오 소유물). 우리 쪽
    등록 레코드만 삭제한다.
    """
    try:
        rid = uuid.UUID(record_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="해당 아바타를 찾을 수 없습니다."
        )
    row = (
        await db.execute(
            select(StandardAvatar).where(
                StandardAvatar.user_id == user.id,
                StandardAvatar.id == rid,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="해당 아바타를 찾을 수 없습니다."
        )
    await db.delete(row)
    await db.commit()
    return {"ok": True}
