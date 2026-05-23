"""TTS 보이스 선택 스키마 (ElevenLabs 목록)."""
from pydantic import BaseModel, Field

# 미리듣기 합성 요청 시 받는 텍스트 상한 — 비용·지연 보호.
# 슬라이드 1장 발화(통상 수백 자)는 충분히 담되, 그 이상은 잘라 합성한다.
VOICE_PREVIEW_MAX_CHARS = 1500


class TtsVoice(BaseModel):
    """음성 선택 UI 의 보이스 1개. ElevenLabs ``GET /v1/voices`` 항목에서 추림."""

    voice_id: str
    name: str = Field(default="Voice")
    gender: str | None = Field(default=None, description="labels.gender (male/female/neutral 등).")
    accent: str | None = Field(default=None, description="labels.accent.")
    description: str | None = Field(default=None, description="보이스 설명/특성.")
    preview_url: str | None = Field(default=None, description="미리듣기 mp3 URL.")
    category: str | None = Field(default=None, description="premade / cloned / professional 등.")
    # ── 한국어 표기 (선택 UI 용) ────────────────────────────────────────────────
    display_name: str = Field(
        default="Voice",
        description="보이스 고유명만 (예: 'Charlie'). name 의 ' - ' 앞부분.",
    )
    description_ko: str | None = Field(
        default=None, description="보이스 특성 설명의 한국어 번역."
    )
    gender_ko: str | None = Field(default=None, description="성별 한국어 (남성/여성/중성).")
    accent_ko: str | None = Field(default=None, description="국적/억양 한국어 (미국/영국/호주 등).")


class TtsVoicesResponse(BaseModel):
    voices: list[TtsVoice]
    total: int


class VoicePreviewRequest(BaseModel):
    """음성 미리듣기 합성 요청 — 선택한 보이스·속도로 발화 내용을 실제 합성."""

    text: str = Field(..., min_length=1, description="합성할 발화 내용(슬라이드 스크립트).")
    voice_id: str | None = Field(
        default=None,
        max_length=255,
        description="ElevenLabs 보이스 ID. null = 성별 기준 기본 보이스.",
    )
    gender: str | None = Field(
        default=None,
        description="voice_id 가 null 일 때 기본 보이스 분기 키 (male/female).",
    )
    speed: float = Field(
        default=1.0,
        ge=0.5,
        le=2.0,
        description="발화 속도 배율(1.0 = 기본). 합성 시 0.7~1.2 로 클램프.",
    )
