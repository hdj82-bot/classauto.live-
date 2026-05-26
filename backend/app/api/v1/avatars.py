"""아바타 API — 목록 조회 + 교수자 본인 사진 업로드(Talking Photo).

라우트 prefix 는 lectures.py 와 동일하게 풀패스(``/api/...``) 로 둔다
(render.py 의 ``/api/v1/render/avatars`` 와 별개 — 프론트 아바타 갤러리는 본
``/api/avatars`` 계약을 사용한다).
"""
import uuid

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_professor
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.avatar import (
    AvatarMeta,
    AvatarPreviewRequest,
    AvatarPreviewResponse,
    AvatarsResponse,
    ProfilePhotoResponse,
    VoiceCloneResponse,
)
from app.services.pipeline import s3 as s3_svc

router = APIRouter(tags=["avatars"])

# 프로필 사진 한도 — 본인 아바타 소스 1장이라 크게 잡을 필요 없음.
_MAX_PROFILE_PHOTO = 8 * 1024 * 1024  # 8MB
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

    try:
        result = await tts.synthesize(_PREVIEW_TEXT, voice_id=voice_id)
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
