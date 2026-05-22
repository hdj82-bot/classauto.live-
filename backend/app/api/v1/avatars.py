"""아바타 API — 목록 조회 + 교수자 본인 사진 업로드(Talking Photo).

라우트 prefix 는 lectures.py 와 동일하게 풀패스(``/api/...``) 로 둔다
(render.py 의 ``/api/v1/render/avatars`` 와 별개 — 프론트 아바타 갤러리는 본
``/api/avatars`` 계약을 사용한다).
"""
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_professor
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.avatar import AvatarMeta, AvatarsResponse, ProfilePhotoResponse
from app.services.pipeline import s3 as s3_svc

router = APIRouter(tags=["avatars"])

# 프로필 사진 한도 — 본인 아바타 소스 1장이라 크게 잡을 필요 없음.
_MAX_PROFILE_PHOTO = 8 * 1024 * 1024  # 8MB
_JPEG_MAGIC = b"\xff\xd8\xff"
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

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
