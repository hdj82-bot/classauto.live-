"""아바타 관련 응답 스키마.

``GET /api/avatars`` 와 ``POST /api/avatars/profile-photo`` 가 사용한다.
프론트(아바타 갤러리 페이지·studio 우측 패널)가 1:1 로 소비하는 wire shape.
"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class AvatarMeta(BaseModel):
    """단일 아바타 항목.

    HeyGen 기본 아바타(``is_custom=False``) 와 교수자가 본인 사진으로 만든
    Talking Photo(``is_custom=True``) 를 동일한 shape 로 노출한다. 갤러리가
    ``gender`` 로 남/여 섹션을 나누고, ``preview_video_url`` 로 동적 샘플을
    재생한다.
    """

    avatar_id: str = Field(..., description="HeyGen avatar_id 또는 talking_photo_id.")
    avatar_name: str = Field(..., description="표시 이름.")
    gender: str | None = Field(
        default=None, description='"male" | "female" | null (HeyGen 제공값 그대로).'
    )
    preview_image_url: str | None = Field(
        default=None, description="정적 썸네일 이미지 URL."
    )
    preview_video_url: str | None = Field(
        default=None, description="동적 샘플 영상 URL (hover/클릭 재생용)."
    )
    is_custom: bool = Field(
        default=False,
        description="교수자 본인 사진으로 만든 아바타면 true (목록 맨 앞에 노출).",
    )


class AvatarsResponse(BaseModel):
    """``GET /api/avatars`` 응답."""

    avatars: list[AvatarMeta]
    total: int


class HeyGenAvatarGroup(BaseModel):
    """아바타 그룹(Photo Avatar 캐릭터) 1개 — ``GET /api/avatars/heygen-groups``.

    웹 "공개 아바타"의 캐릭터(예: "Annie 57룩")에 해당한다. 룩은 무겁고 많아
    여기엔 메타데이터만 주고, 카드를 열 때 ``.../looks`` 로 lazy 로드한다.
    """

    group_id: str = Field(..., description="HeyGen avatar group id.")
    name: str = Field(..., description="캐릭터 이름.")
    num_looks: int = Field(default=0, description="이 그룹의 룩 수.")
    preview_image_url: str | None = Field(
        default=None, description="대표 썸네일(있으면)."
    )


class AvatarPreviewRequest(BaseModel):
    """``POST /api/avatars/me/preview`` 요청 본문."""

    voice_id: str | None = Field(
        default=None,
        description="미리보기를 렌더할 ElevenLabs voice_id. null 이면 기본 음성.",
    )
    force: bool = Field(
        default=False,
        description="true 면 캐시를 무시하고 다시 렌더한다(다른 음성으로 재생성 등).",
    )
    text: str | None = Field(
        default=None,
        max_length=2000,
        description=(
            "아바타가 말할 대본. null 이면 기본 샘플 문장. 아바타 페이지의 "
            "'스크립트 테스트'에서 임의 문장을 보낼 때 쓴다."
        ),
    )
    avatar_id: str | None = Field(
        default=None,
        max_length=255,
        description=(
            "등록한 표준 아바타(Video Avatar)의 heygen avatar_id. 주어지면 talking_photo "
            "대신 이 아바타로 렌더한다(전신 자연 움직임). null 이면 본인 포토 아바타."
        ),
    )


class AvatarPreviewResponse(BaseModel):
    """본인 아바타 "움직이는 미리보기" 상태.

    Talking Photo 는 정지 사진이라 아이들 영상이 없어, 짧은 샘플을 1회 렌더해
    캐시한다. 프론트는 ``status`` 로 버튼/로딩/재생을 분기한다.
    """

    status: Literal["not_started", "processing", "ready", "failed"] = Field(
        ...,
        description=(
            "'not_started' = 아직 안 만듦, 'processing' = HeyGen 렌더 중, "
            "'ready' = 영상 준비됨(video_url 제공), 'failed' = 렌더 실패."
        ),
    )
    video_url: str | None = Field(
        default=None, description="ready 일 때 재생할 영상 URL(presigned)."
    )
    voice_id: str | None = Field(
        default=None, description="이 미리보기를 렌더한 voice_id."
    )
    message: str | None = Field(default=None, description="사용자 표시용 메시지.")


class ProfilePhotoResponse(BaseModel):
    """``POST /api/avatars/profile-photo`` 응답.

    1차 범위: 사진 업로드 + S3 저장 + HeyGen Talking Photo asset 등록까지.
    실제 강의 영상에 본인 모습을 반영하는 것은 후속 — ``photo_avatar_id`` 가
    채워지면 이후 create_video 에서 사용할 수 있다.
    """

    photo_avatar_id: str | None = Field(
        default=None,
        description="HeyGen Talking Photo ID. 등록 실패·대기 시 null.",
    )
    status: Literal["processing", "ready", "failed"] = Field(
        ...,
        description=(
            "'ready' = talking photo 등록 완료, 'processing' = 업로드는 됐으나 "
            "HeyGen 등록 대기/미연동, 'failed' = HeyGen 등록 실패(사진 저장은 됨)."
        ),
    )
    profile_image_url: str = Field(..., description="업로드된 사진의 S3 https URL.")
    message: str = Field(..., description="사용자 표시용 상태 메시지.")


class VoiceCloneResponse(BaseModel):
    """``POST /api/avatars/me/voice`` / ``GET /api/avatars/me/voice`` 응답.

    교수자가 업로드한 음성 샘플(mp3 등)로 ElevenLabs Instant Voice Cloning(IVC)
    을 수행한 결과. ``voice_id`` 가 채워지면 ``GET /api/voices`` 계정 보이스로
    자동 노출돼 음성 패널·미리보기·강의 렌더에 본인 목소리로 쓸 수 있다.
    """

    status: Literal["none", "ready", "failed"] = Field(
        ...,
        description=(
            "'none' = 아직 본인 음성 미생성, 'ready' = 복제 완료(voice_id 제공), "
            "'failed' = 복제 실패."
        ),
    )
    voice_id: str | None = Field(
        default=None, description="ElevenLabs cloned voice_id (ready 일 때)."
    )
    name: str | None = Field(default=None, description="본인 음성 표시 이름.")
    sample_url: str | None = Field(
        default=None, description="업로드한 원본 샘플의 재생 URL(presigned)."
    )
    message: str | None = Field(default=None, description="사용자 표시용 메시지.")


class VoiceScriptRequest(BaseModel):
    """``POST /api/avatars/me/voice/script`` 요청 — 녹음용 대본 생성."""

    topic: str | None = Field(
        default=None,
        max_length=200,
        description=(
            "대본을 연관시킬 강의 주제(강의 제목 등). 비어 있으면 일반 학술문으로 생성."
        ),
    )
    language: Literal["ko", "en", "zh", "ja"] = Field(
        default="ko",
        description="대본 언어 — ko(한국어)·en(영어)·zh(중국어)·ja(일본어). 기본 ko.",
    )


class VoiceScriptResponse(BaseModel):
    """녹음용 대본 응답 — 교수자가 IVC 샘플 녹음 시 읽을 한국어 학술 산문(~500자)."""

    script: str = Field(..., description="낭독용 평문 대본(마크다운 없음).")


# ── Photo Avatar (Design with AI 룩) ─────────────────────────────────────────


class PhotoAvatarStatusResponse(BaseModel):
    """``POST/GET /api/avatars/me/photo-avatar`` 응답 — 그룹 생성·학습 상태."""

    group_id: str | None = Field(default=None, description="HeyGen avatar group id.")
    status: Literal["none", "training", "ready", "failed"] = Field(
        ...,
        description=(
            "'none' = 아직 미생성, 'training' = 그룹 학습 중, 'ready' = 룩 생성 가능, "
            "'failed' = 생성/학습 실패."
        ),
    )
    message: str | None = Field(default=None, description="사용자 표시용 메시지.")
    error_code: str | None = Field(
        default=None,
        description=(
            "status='failed' 일 때의 사유 분류 코드 "
            "('insufficient_credit'|'invalid_image'|'unknown'). 프론트가 정확한 안내를 고른다."
        ),
    )


# v0.2 옵션 enum — 프론트(창4) 드롭다운과 백엔드(창2) 프롬프트 매핑이 공유.
PersonaT = Literal["educator", "researcher", "mentor", "podcast_host"]
OutfitT = Literal["suit", "blazer", "shirt", "knit", "tee", "hoodie"]
BackgroundT = Literal["lecture", "lab", "study", "studio", "lounge", "cafe"]
ExpressionT = Literal["neutral", "friendly", "warm", "confident", "thoughtful"]
# v0.3 (2026-06-01): 소품·손동작 옵션 — HeyGen 갤러리 류 다양성을 위해 추가.
PropT = Literal["mic_stand"]
"""소품. null=없음(기본). mic_stand=책상 위 팟캐스트 마이크 가시."""
PoseT = Literal["crossed_arms", "gesturing", "holding_mic", "relaxed_at_sides"]
"""손·팔 자세. null=자동(모델 알아서). holding_mic 은 핸드헬드 마이크를 든다."""


class LookGenerateRequest(BaseModel):
    """``POST /api/avatars/me/looks`` 요청 — 룩 배치 생성.

    v0.2(provider="gpt"): 구조화 필드(persona 필수, 나머지 선택)로 gpt-image-2 룩 생성.
    레거시(provider="heygen"): 자유 ``prompt`` 사용. 둘 다 하위호환으로 받는다.
    """

    persona: PersonaT | None = Field(default=None, description="교수자 페르소나(v0.2).")
    outfit: OutfitT | None = Field(default=None, description="복장. null=자동 추론.")
    background: BackgroundT | None = Field(default=None, description="배경. null=자동.")
    expression: ExpressionT | None = Field(default=None, description="표정. null=자동.")
    prop: PropT | None = Field(
        default=None, description="소품(v0.3). null=없음. mic_stand=책상 마이크."
    )
    pose: PoseT | None = Field(
        default=None, description="손·팔 자세(v0.3). null=자동."
    )
    extra: str | None = Field(
        default=None, max_length=500, description="추가 자유 묘사(선택)."
    )
    prompt: str | None = Field(
        default=None, max_length=1000,
        description="레거시 자유 프롬프트(provider='heygen' 호환). v0.2 에선 미사용 가능.",
    )
    count: int = Field(
        default=3, ge=1,
        description="한 번에 생성할 룩 수. 서버가 PHOTO_AVATAR_LOOK_BATCH_MAX 로 상한 적용.",
    )


class LookGenerateResponse(BaseModel):
    """룩 생성 시작 응답."""

    generation_id: str | None = Field(default=None, description="HeyGen 생성 작업 id.")
    status: Literal["generating", "failed"] = Field(..., description="생성 시작 결과.")
    message: str | None = Field(default=None, description="사용자 표시용 메시지.")


class LookItem(BaseModel):
    """생성된 룩 1개."""

    look_id: str = Field(
        ..., description="룩 식별자. v0.2=내부 uuid 문자열, 레거시=heygen_look_id."
    )
    image_url: str | None = Field(
        default=None, description="v0.2 gpt 룩 이미지의 S3 URL(presigned)."
    )
    preview_image_url: str | None = Field(
        default=None, description="미리보기 썸네일(presigned)."
    )
    prompt: str | None = Field(default=None, description="생성에 쓴 프롬프트.")
    name: str | None = Field(
        default=None,
        description="교수자가 라이브러리에서 직접 붙인 룩 이름. 없으면 null.",
    )
    status: Literal["generating", "ready", "failed"] = Field(..., description="룩 상태.")
    is_default: bool = Field(
        default=False, description="교수자가 기본 룩으로 선택한 항목이면 true."
    )
    saved: bool = Field(
        default=False,
        description="라이브러리에 저장(확정)된 룩이면 true. 후보(미저장)는 false.",
    )
    created_at: datetime | None = Field(
        default=None,
        description=(
            "룩 행 생성 시각(ISO8601, UTC). 프론트가 generating 룩의 진행 막대 ETA 를 "
            "서버 기준으로 계산해, 탭을 닫았다 다시 열어도 경과 시간을 정확히 잇는다."
        ),
    )


class LookNameUpdate(BaseModel):
    """``PATCH /api/avatars/me/looks/{look_id}/name`` 요청 — 룩 이름 변경."""

    name: str | None = Field(
        default=None,
        max_length=80,
        description="새 룩 이름. 공백·빈 문자열이면 이름을 지운다(null).",
    )


class LookSelectResponse(BaseModel):
    """``POST /api/avatars/me/looks/{look_id}/select`` 응답."""

    default_look_id: str = Field(..., description="선택된 기본 룩 id.")
    message: str | None = Field(default=None, description="사용자 표시용 메시지.")


# ── 최근 선택한 아바타 (라이브러리에서 재생성 없이 바로 적용) ───────────────────


class RecentAvatarRequest(BaseModel):
    """``POST /api/avatars/me/recent`` 요청 — 가장 최근 선택한 아바타/룩 기록."""

    avatar_id: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="가장 최근에 고른 아바타/룩 id(표준 avatar_id 또는 본인 룩 id).",
    )


class RecentAvatarResponse(BaseModel):
    """``GET/POST /api/avatars/me/recent`` 응답 — 최근 선택 id.

    프론트가 이미 보유한 아바타 목록·룩 목록에서 이 id 로 항목을 해석해 "최근
    선택한 아바타" 박스를 그린다(없으면 null → 박스 미표시).
    """

    avatar_id: str | None = Field(
        default=None, description="가장 최근 선택한 아바타/룩 id (없으면 null)."
    )


# ── 내 아바타 (룩 + 음성 조합 라이브러리) ──────────────────────────────────────
#
# 룩만 저장하던 라이브러리(LookItem)의 상위 개념. 교수자가 고른 룩 + 음성을 한
# 묶음으로 저장해, 재방문 시 재선택·재렌더 없이 바로 강의에 적용한다. 말하는
# 미리보기 영상은 조합 단위로 보관(덮어쓰기 없음)해 갤러리에서 재생한다.


class SavedAvatarItem(BaseModel):
    """저장된 '룩 + 음성' 조합 아바타 1개 (갤러리 카드)."""

    id: str = Field(..., description="saved_avatar 행 id(uuid 문자열).")
    name: str = Field(..., description="교수자가 붙인 표시 이름.")
    look_id: str = Field(
        ..., description="렌더용 룩 식별자(룩 내부 uuid 또는 heygen_look_id)."
    )
    voice_id: str | None = Field(
        default=None, description="음성 id. null = 성별 기준 기본 보이스."
    )
    avatar_scale: float = Field(
        default=1.0, description="프레임 내 아바타 크기 배율(1.0 = 기본)."
    )
    preview_video_url: str | None = Field(
        default=None,
        description="이 조합 전용 말하는 미리보기 영상(presigned). 없으면 null.",
    )
    preview_status: Literal["none", "processing", "ready", "failed"] = Field(
        default="none",
        description=(
            "'none' = 미리보기 없음, 'processing' = 렌더 중, 'ready' = 영상 준비됨, "
            "'failed' = 렌더 실패."
        ),
    )
    created_at: datetime | None = Field(
        default=None, description="저장 시각(ISO8601, UTC)."
    )


class SavedAvatarCreate(BaseModel):
    """``POST /api/avatars/me/saved`` — 룩+음성 조합 저장."""

    name: str = Field(..., min_length=1, max_length=80, description="표시 이름.")
    look_id: str = Field(
        ..., min_length=1, max_length=255, description="저장할 룩 식별자."
    )
    voice_id: str | None = Field(
        default=None, max_length=255, description="음성 id(선택). null = 기본 보이스."
    )
    avatar_scale: float = Field(
        default=1.0, ge=0.3, le=2.0, description="아바타 크기 배율 [0.3, 2.0]."
    )


class SavedAvatarUpdate(BaseModel):
    """``PATCH /api/avatars/me/saved/{id}`` — 이름/음성 부분 변경.

    pydantic ``model_fields_set`` 으로 '미전송' 과 'null 전송' 을 구분한다 —
    voice_id 를 명시적으로 null 로 보내면 기본 보이스로 해제한다.
    """

    name: str | None = Field(
        default=None, max_length=80, description="새 표시 이름(공백이면 무시)."
    )
    voice_id: str | None = Field(
        default=None, max_length=255, description="새 음성 id. null = 기본 보이스로 해제."
    )


class SavedAvatarPreviewRequest(BaseModel):
    """``POST /api/avatars/me/saved/{id}/preview`` — 말하는 미리보기 렌더 시작."""

    text: str | None = Field(
        default=None, max_length=2000, description="아바타가 말할 대본. null = 기본 샘플."
    )
    force: bool = Field(
        default=False, description="true 면 캐시를 무시하고 다시 렌더한다."
    )


class SavedAvatarApply(BaseModel):
    """``POST /api/avatars/me/saved/{id}/apply`` — 강의에 적용."""

    lecture_id: str = Field(..., description="이 아바타(룩+음성)를 적용할 강의 id.")


# ── 표준 아바타 (HeyGen 웹 스튜디오에서 만든 Video Avatar 등록) ─────────────────


class StandardAvatarRegisterRequest(BaseModel):
    """``POST /api/avatars/me/standard`` 요청 — 표준 Video Avatar 등록.

    교수자가 HeyGen 웹 스튜디오에서 만든 Video Avatar 의 ``avatar_id`` 를 등록한다.
    서버가 HeyGen ``/v2/avatars`` 에서 그 id 를 조회해 미리보기·성별 메타데이터를
    함께 보관한다(계정에 없는 id 면 404).
    """

    avatar_id: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="HeyGen Video Avatar 의 avatar_id (웹 스튜디오 → Share/URL 에서 확인).",
    )
    name: str | None = Field(
        default=None,
        max_length=80,
        description="갤러리에 표시할 이름(선택). 비우면 HeyGen 아바타 이름을 쓴다.",
    )
    # 피커에서 고른 경우, 프론트가 이미 가진 메타데이터를 함께 보내 서버 재조회를
    # 건너뛰게 한다(빠른 등록). 출처가 우리 /api/avatars/heygen-account(=/v2/avatars)라
    # 신뢰 가능. 셋 중 하나라도 오면 "메타 제공"으로 보고 HeyGen 재조회를 생략한다.
    preview_image_url: str | None = Field(
        default=None, max_length=1024, description="피커가 가진 HeyGen 썸네일 URL(선택)."
    )
    preview_video_url: str | None = Field(
        default=None, max_length=1024, description="피커가 가진 HeyGen 샘플 영상 URL(선택)."
    )
    gender: str | None = Field(
        default=None, max_length=20, description="피커가 가진 성별 값(선택)."
    )


class StandardAvatarItem(BaseModel):
    """등록된 표준 아바타 1개 (``GET /api/avatars/me/standard``)."""

    id: str = Field(..., description="등록 레코드 내부 id (rename·delete 키).")
    avatar_id: str = Field(..., description="HeyGen avatar_id (강의 적용 시 lecture.avatar_id).")
    name: str | None = Field(default=None, description="교수자가 붙인 표시 이름(없으면 null).")
    preview_image_url: str | None = Field(
        default=None, description="HeyGen 정적 썸네일 URL."
    )
    preview_video_url: str | None = Field(
        default=None, description="HeyGen 동적 샘플 영상 URL(자연스러운 움직임 비교용)."
    )
    gender: str | None = Field(
        default=None, description='"male" | "female" | null (HeyGen 제공값).'
    )
    created_at: datetime | None = Field(default=None, description="등록 시각(ISO8601, UTC).")


class StandardAvatarNameUpdate(BaseModel):
    """``PATCH /api/avatars/me/standard/{id}/name`` 요청 — 표시 이름 변경."""

    name: str | None = Field(
        default=None,
        max_length=80,
        description="새 표시 이름. 공백·빈 문자열이면 이름을 지운다(null).",
    )
