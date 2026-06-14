import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.lecture import VoiceGender


# ── 슬라이드 메타 ─────────────────────────────────────────────────────────────

SlideStatus = Literal["pending", "ready"]

# 음성·자막 지원 언어 (ISO 639-1). translator.py(DeepL) 지원 범위 안의 7종.
VoiceLang = Literal["ko", "zh", "en", "ja", "de", "fr", "ru"]


class SubtitlePosition(BaseModel):
    """교수자가 드래그로 정한 자막 위치 — 영상 영역 기준 정규화 좌표(자막 박스 중심).

    x/y 는 0~1 (0=좌/상, 1=우/하). 화면 크기와 무관하게 적용되도록 정규화한다.
    NULL = 기본(하단 중앙). 범위 밖 값은 0~1 로 클램프해 저장/적용한다.
    """

    model_config = ConfigDict(extra="ignore")

    x: float = Field(..., ge=0, le=1)
    y: float = Field(..., ge=0, le=1)


class SlideMeta(BaseModel):
    """편집기 좌측 패널 + 중앙 미리보기에서 즉시 렌더하기 위한 슬라이드 메타.

    백엔드 ``GET /api/lectures/{lecture_id}/slides`` 응답에 1:1 대응.
    스크립트 생성을 기다리지 않고 1) PPTX 파싱 직후 (embeddings 저장 시) 또는
    2) 부분 스크립트만 있는 상태에서도 슬라이드 카드 + 순번 + 임시 제목을
    내려줄 수 있도록 한다.

    - ``status="pending"``: AI 다듬은 스크립트가 아직 없음 → 프론트가 skeleton
      과 "AI 생성 중…" 인디케이터를 표시한다.
    - ``status="ready"``: 해당 슬라이드의 스크립트 세그먼트가 도착함.
    """

    model_config = ConfigDict(from_attributes=True)

    index: int = Field(..., ge=0, description="슬라이드 인덱스 (0-based)")
    title: str | None = Field(
        default=None,
        description="썸네일 라벨용 짧은 제목 — 노트/본문에서 추출. 없으면 null.",
    )
    status: SlideStatus = Field(
        default="pending",
        description="'pending' = 아직 AI 스크립트 생성 전, 'ready' = 세그먼트 도착.",
    )
    image_url: str | None = Field(
        default=None,
        description=(
            "PPTX 를 페이지별로 PNG 로 렌더해 S3 에 올린 미리보기 이미지의 https URL. "
            "studio 편집기 중앙 미리보기가 ``<img>`` 로 즉시 노출한다. 슬라이드 렌더 "
            "인프라(창 1) 와 DB 컬럼(창 2) 가 아직 배포되지 않은 환경에서는 항상 None — "
            "프론트는 DefaultSlideMock 으로 fallback."
        ),
    )


class SlidesResponse(BaseModel):
    """``GET /api/lectures/{lecture_id}/slides`` 응답 래퍼.

    리스트만 내려도 충분하지만 향후 ``total_pending`` / ``last_updated_at``
    같은 메타를 추가할 여지를 두기 위해 객체로 감싼다.
    """

    lecture_id: uuid.UUID
    slides: list[SlideMeta]


class SlideshowSlide(BaseModel):
    """클라이언트 슬라이드쇼 재생용 슬라이드 1장 — 이미지 + 구간 TTS 음성 + 타임라인.

    학생 플레이어는 본문 영상(MP4) 대신 슬라이드 이미지 + 이 구간 음성을 타임라인에
    맞춰 동기 재생한다(docs/planning/08-cost-optimization.md). ``audio_url`` 이 아직
    null 이면 해당 슬라이드의 TTS 가 아직 생성되지 않은 것이다.
    """

    model_config = ConfigDict(from_attributes=True)

    slide_index: int = Field(..., ge=0, description="슬라이드 인덱스 (0-based)")
    image_url: str | None = Field(
        default=None, description="슬라이드 PNG presigned URL. 없으면 null."
    )
    audio_url: str | None = Field(
        default=None,
        description="이 슬라이드 구간 TTS 음성 presigned URL. 생성 전이면 null.",
    )
    start_seconds: float = Field(default=0, description="강의 타임라인상 시작 초.")
    end_seconds: float = Field(default=0, description="강의 타임라인상 끝 초.")
    text: str = Field(default="", description="발화 텍스트(자막=음성과 동일일 때).")
    subtitle_text: str | None = Field(
        default=None,
        description="자막 언어가 음성과 다를 때의 번역 자막. null = 음성과 동일.",
    )
    subtitle_cues: list[dict] | None = Field(
        default=None,
        description=(
            "자막 정밀 싱크 cue [{start,end,text}, ...]. 발성 시각(이 슬라이드 "
            "음성 자체 타임라인, 초) 기준. null = 정렬 미수행/실패 → 플레이어가 "
            "글자수 균등분배로 폴백."
        ),
    )


class SlideshowResponse(BaseModel):
    """``GET /api/lectures/{slug}/slideshow`` 응답 — 학생 플레이어가 슬라이드쇼로 재생."""

    lecture_id: uuid.UUID
    is_expired: bool = False
    is_ready: bool = Field(
        default=True,
        description=(
            "본문 렌더 완료 여부. 강의가 공개됐지만 아직 본문 TTS 렌더가 끝나지 "
            "않았으면(Video.status != done) False — 학생 플레이어는 무음 재생 대신 "
            "'준비 중'을 표시한다. 기본 True 로 두어 done 강의는 종전과 동일하게 재생."
        ),
    )
    total_seconds: float = Field(default=0, description="전체 타임라인 길이(초).")
    subtitle_position: SubtitlePosition | None = Field(
        default=None,
        description=(
            "교수자가 정한 자막 위치(영상 영역 기준 정규화 좌표). null = 기본"
            "(하단 중앙). 플레이어가 이 값으로 자막 위치를 적용한다."
        ),
    )
    slides: list[SlideshowSlide]


class LectureDownloadResponse(BaseModel):
    """``POST/GET /api/lectures/{id}/download`` — on-demand mp4 합성 상태/URL.

    status: none(미요청) | building(합성 중) | ready(완료) | failed.
    url 은 ready 일 때만 presigned 다운로드 URL.
    """

    status: str
    url: str | None = None


class LectureCreate(BaseModel):
    course_id: uuid.UUID
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    video_url: str | None = None
    thumbnail_url: str | None = None
    order: int = Field(default=0, ge=0)
    expires_at: datetime | None = None
    voice_gender: VoiceGender = Field(
        default=VoiceGender.male,
        description="HeyGen 아바타·ElevenLabs 보이스 성별. 'male' | 'female'. 기본 male.",
    )


class LectureUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    video_url: str | None = None
    thumbnail_url: str | None = None
    order: int | None = Field(None, ge=0)
    expires_at: datetime | None = None
    is_published: bool | None = None
    voice_gender: VoiceGender | None = Field(
        default=None,
        description="변경 시 다음 렌더부터 적용. 기존 렌더된 영상은 재생성 전까지 유지.",
    )
    avatar_id: str | None = Field(
        default=None,
        max_length=255,
        description="강의에 선택된 HeyGen 아바타 ID. 다음 렌더부터 적용.",
    )
    avatar_name: str | None = Field(
        default=None,
        max_length=100,
        description="강의별 아바타 표시 이름 (라벨 전용, 영상 생성과 무관).",
    )
    avatar_scale: float | None = Field(
        default=None,
        ge=0.3,
        le=2.0,
        description=(
            "영상에서 아바타 크기 배율(1.0 = 기본). 렌더 시 HeyGen character.scale 로 "
            "전달(0.3~2.0 클램프). 다음 렌더부터 적용."
        ),
    )
    voice_lang: VoiceLang | None = Field(
        default=None,
        description="영상 음성(TTS) 언어. ko/zh/en/ja/de/fr/ru.",
    )
    subtitle_lang: VoiceLang | None = Field(
        default=None,
        description="영상 자막 언어. null = 음성과 동일(별도 번역 없음).",
    )
    voice_id: str | None = Field(
        default=None,
        max_length=255,
        description="선택한 ElevenLabs 보이스 ID. null = 성별 기준 기본 보이스.",
    )
    voice_speed: float | None = Field(
        default=None,
        ge=0.7,
        le=1.2,
        description=(
            "영상 발화 속도 배율(1.0 = 기본, 유효범위 0.7~1.2). 합성 시 ElevenLabs "
            "voice_settings.speed 로 전달. 다음 렌더부터 적용."
        ),
    )
    subtitle_position: SubtitlePosition | None = Field(
        default=None,
        description=(
            "자막 위치(영상 영역 기준 정규화 좌표, 자막 박스 중심). null 로 보내면 "
            "기본(하단 중앙)으로 초기화. 학생 플레이어에 즉시 반영."
        ),
    )


class LectureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_id: uuid.UUID
    folder_id: uuid.UUID | None = None
    title: str
    description: str | None
    video_url: str | None
    thumbnail_url: str | None
    slug: str
    order: int
    expires_at: datetime | None
    is_published: bool
    voice_gender: VoiceGender
    avatar_id: str | None = None
    avatar_name: str | None = None
    avatar_scale: float = 1.0
    voice_lang: str = "ko"
    subtitle_lang: str | None = None
    voice_id: str | None = None
    voice_speed: float = 1.0
    subtitle_position: SubtitlePosition | None = None
    created_at: datetime
    updated_at: datetime


class LecturePublicResponse(BaseModel):
    """시청 만료 여부에 따라 video_url을 숨기는 공개 응답.

    BACKEND_ASKS.W4 #1·#2: ``/v/[slug]`` 학생 진입 페이지가 "○○○ 교수님이 보낸
    강의입니다" / 강좌명 / mm:ss 길이 표시를 위해 다음 세 필드를 추가로 노출.
    데이터가 없으면 ``None`` — 기존 호출자는 키 무시로 동작 호환 유지.
    """

    id: uuid.UUID
    course_id: uuid.UUID
    title: str
    description: str | None
    thumbnail_url: str | None
    slug: str
    is_expired: bool
    # 만료된 경우 None 반환
    video_url: str | None

    # ── R2W2: 학생 진입 화면용 부가 정보 (모두 Optional) ────────────────
    professor_name: str | None = Field(
        default=None,
        description="강좌 소유 교수자의 표시명 (course → instructor.name).",
        examples=["하두진"],
    )
    course_name: str | None = Field(
        default=None,
        description="이 강의가 속한 강좌의 제목 (course.title).",
        examples=["현대중국사회의이해"],
    )
    duration_sec: int | None = Field(
        default=None,
        description=(
            "강의에 연결된 최신 Video.duration_seconds. 영상이 아직 렌더되지 "
            "않았거나 길이 메타가 없으면 None."
        ),
        examples=[312],
    )
