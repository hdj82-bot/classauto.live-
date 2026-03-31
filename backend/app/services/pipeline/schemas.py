"""파이프라인 내부 데이터 구조."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SlideContent:
    """PPTX 파싱 결과: 슬라이드 1장의 콘텐츠."""
    slide_number: int
    texts: list[str] = field(default_factory=list)
    speaker_notes: str = ""
    image_paths: list[str] = field(default_factory=list)


@dataclass
class SlideScript:
    """AI 생성 스크립트."""
    slide_number: int
    script: str = ""
