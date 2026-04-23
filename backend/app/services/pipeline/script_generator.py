"""Claude API를 사용한 슬라이드별 발화 스크립트 생성."""
from __future__ import annotations

import logging
import mimetypes
from pathlib import Path

import anthropic

from app.core.config import settings
from app.services.pipeline.parser import encode_image_base64
from app.services.pipeline.schemas import SlideContent, SlideScript

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
    """모든 슬라이드에 대해 발화 스크립트를 생성."""
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    scripts: list[SlideScript] = []

    for slide in slides:
        script = _generate_single_script(client, slide)
        scripts.append(SlideScript(slide_number=slide.slide_number, script=script))
        logger.info("슬라이드 %d 스크립트 생성 완료", slide.slide_number)

    return scripts


def _generate_single_script(client: anthropic.Anthropic, slide: SlideContent) -> str:
    content_blocks: list[dict] = []

    for img_path in slide.image_paths:
        path = Path(img_path)
        if path.exists():
            try:
                mime_type = mimetypes.guess_type(img_path)[0] or "image/png"
                data = encode_image_base64(img_path)
                content_blocks.append({
                    "type": "image",
                    "source": {"type": "base64", "media_type": mime_type, "data": data},
                })
            except Exception:
                logger.warning("이미지 인코딩 실패, 건너뜀: %s", img_path)

    prompt_parts: list[str] = [f"## 슬라이드 {slide.slide_number}"]
    if slide.speaker_notes:
        prompt_parts.append(f"\n### 발표자 노트 (1순위 참고)\n{slide.speaker_notes}")
    if slide.texts:
        prompt_parts.append(f"\n### 슬라이드 텍스트\n" + "\n".join(slide.texts))
    if not slide.speaker_notes and not slide.texts and not slide.image_paths:
        prompt_parts.append("\n(빈 슬라이드입니다. 간단한 전환 멘트만 작성하세요.)")
    prompt_parts.append("\n위 내용을 바탕으로 발화 스크립트를 작성해주세요.")

    content_blocks.append({"type": "text", "text": "\n".join(prompt_parts)})

    try:
        response = client.messages.create(
            model=settings.SCRIPT_MODEL,
            max_tokens=settings.SCRIPT_MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content_blocks}],
        )
    except anthropic.APIError as exc:
        logger.error("슬라이드 %d 스크립트 생성 실패: %s", slide.slide_number, exc)
        raise RuntimeError(
            f"슬라이드 {slide.slide_number} 스크립트 생성 실패: {exc}"
        ) from exc

    if not response.content:
        logger.warning("슬라이드 %d: 빈 응답", slide.slide_number)
        return "(스크립트를 생성할 수 없었습니다.)"

    text_block = next((b for b in response.content if b.type == "text"), None)
    if text_block is None:
        logger.warning("슬라이드 %d: 텍스트 블록 없음", slide.slide_number)
        return "(스크립트를 생성할 수 없었습니다.)"

    return text_block.text
