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
from app.models.photo_avatar import LookStatus, PhotoAvatarLook
from app.models.user import User
from app.schemas.avatar import (
    AvatarMeta,
    AvatarPreviewRequest,
    AvatarPreviewResponse,
    AvatarsResponse,
    LookGenerateRequest,
    LookGenerateResponse,
    LookItem,
    LookSelectResponse,
    PhotoAvatarStatusResponse,
    ProfilePhotoResponse,
    RecentAvatarRequest,
    RecentAvatarResponse,
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
        # 새 아바타로 교체됨 → 이전 사진으로 만든 "움직이는 미리보기" 캐시는
        # 옛 얼굴이라 더 이상 유효하지 않으므로 비운다(다음 조회 시 재생성 유도).
        user.photo_avatar_preview_url = None
        user.photo_avatar_preview_video_id = None
        user.photo_avatar_preview_voice_id = None
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
    if not user.photo_avatar_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="본인 아바타가 아직 등록되지 않았습니다. 먼저 사진으로 아바타를 만들어 주세요.",
        )

    voice_id = payload.voice_id

    # 캐시 적중: 강제 아님 + 완성본 있음 + 같은 음성(또는 음성 미지정).
    if (
        not payload.force
        and user.photo_avatar_preview_url
        and (voice_id is None or voice_id == user.photo_avatar_preview_voice_id)
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
        result = await tts.synthesize(_PREVIEW_TEXT, voice_id=voice_id, cloned=is_cloned)
        stored_audio_url = s3_svc.upload_audio_bytes(
            result.audio_bytes, f"avatar-preview-{user.id}"
        )
        audio_url = s3_svc.presign_stored_s3_url(stored_audio_url) or stored_audio_url
        video_id = await create_video(
            audio_url=audio_url,
            talking_photo_id=user.photo_avatar_id,
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
                status=r.status if r.status in ("generating", "ready", "failed") else "ready",
                is_default=(lid == user.photo_avatar_default_look_id),
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

    message = "기본 아바타 룩으로 설정했습니다."
    if settings.PHOTO_AVATAR_PROVIDER == "gpt":
        if not row.image_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="이 룩에는 이미지가 없습니다.",
            )
        from urllib.parse import urlparse

        from app.services.pipeline.heygen import HeyGenError, upload_talking_photo

        key = urlparse(row.image_url).path.lstrip("/")
        ctype = "image/png" if key.lower().endswith(".png") else "image/jpeg"
        try:
            img_bytes = s3_svc.download_file(key)
            talking_photo_id = await upload_talking_photo(img_bytes, content_type=ctype)
        except HeyGenError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"본인 아바타 등록에 실패했습니다: {e}",
            ) from e
        user.photo_avatar_id = talking_photo_id
        # (E) 얼굴이 바뀌었으므로 이전 '움직이는 미리보기' 캐시는 무효(재생성 유도).
        user.photo_avatar_preview_url = None
        user.photo_avatar_preview_video_id = None
        user.photo_avatar_preview_voice_id = None
        message = "이 모습을 본인 아바타로 설정했습니다."

    user.photo_avatar_default_look_id = look_id
    await db.commit()
    return LookSelectResponse(default_look_id=look_id, message=message)


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
