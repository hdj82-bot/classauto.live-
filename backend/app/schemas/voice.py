"""TTS 보이스 선택 스키마 (ElevenLabs 목록)."""
from pydantic import BaseModel, Field


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
