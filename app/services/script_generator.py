"""Claude API를 사용한 슬라이드별 발화 스크립트 생성 서비스."""

from __future__ import annotations

import logging
import mimetypes
from pathlib import Path

import anthropic

from app.config import settings
from app.models.schemas import SlideContent, SlideScript
from app.services.parser import encode_image_base64

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
당신은 전문 프레젠테이션 발표 코치입니다.
주어진 슬라이드 정보를 바탕으로 자연스러운 한국어 발화 스크립트를 작성하세요.

규칙:
1. 발표자 노트가 있으면 이를 1순위로 참고하여 스크립트를 작성합니다.
2. 발표자 노트가 없으면 슬라이드 텍스트와 이미지를 분석하여 스크립트를 생성합니다.
3. 구어체로 자연스럽게 작성합니다. (예: "~입니다", "~하겠습니다")
4. 슬라이드 전환 멘트는 포함하지 않습니다.
5. 1~2분 분량으로 작성합니다.
"""


def generate_scripts(slides: list[SlideContent]) -> list[SlideScript]:
    """모든 슬라이드에 대해 발화 스크립트를 생성한다."""
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    scripts: list[SlideScript] = []

    for slide in slides:
        script = _generate_single_script(client, slide)
        scripts.append(SlideScript(slide_number=slide.slide_number, script=script))
        logger.info("슬라이드 %d 스크립트 생성 완료", slide.slide_number)

    return scripts


def _generate_single_script(client: anthropic.Anthropic, slide: SlideContent) -> str:
    """단일 슬라이드의 발화 스크립트를 생성한다."""
    content_blocks: list[dict] = []

    # 이미지가 있으면 vision으로 전달
    for img_path in slide.image_paths:
        path = Path(img_path)
        if path.exists():
            mime_type = mimetypes.guess_type(img_path)[0] or "image/png"
            data = encode_image_base64(img_path)
            content_blocks.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": mime_type,
                        "data": data,
                    },
                }
            )

    # 텍스트 프롬프트 구성
    prompt_parts: list[str] = [f"## 슬라이드 {slide.slide_number}"]

    if slide.speaker_notes:
        prompt_parts.append(f"\n### 발표자 노트 (1순위 참고)\n{slide.speaker_notes}")

    if slide.texts:
        prompt_parts.append(f"\n### 슬라이드 텍스트\n" + "\n".join(slide.texts))

    if not slide.speaker_notes and not slide.texts and not slide.image_paths:
        prompt_parts.append("\n(빈 슬라이드입니다. 간단한 전환 멘트만 작성하세요.)")

    prompt_parts.append("\n위 내용을 바탕으로 발화 스크립트를 작성해주세요.")

    content_blocks.append({"type": "text", "text": "\n".join(prompt_parts)})

    response = client.messages.create(
        model=settings.claude_model,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content_blocks}],
    )

    return response.content[0].text
