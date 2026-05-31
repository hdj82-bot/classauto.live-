"""OpenAI gpt-image-2 기반 교수자 룩 생성 (Photo Avatar v0.2).

업로드 사진을 reference 로 gpt-image-2(`images/edits`)를 호출해 Persona/Outfit/
Background 스타일의 인물 룩 이미지를 생성한다. HeyGen Design with AI 풀코스의
train(최대 15분) 병목을 제거하기 위한 전환 (docs/planning/12-self-avatar-onboarding §0).

책임 경계: 이 서비스는 **이미지 bytes 생성까지만** 한다. 생성 결과의 S3 저장과
``PhotoAvatarLook`` 행 생성은 호출부(``tasks/photo_avatar``)가 맡는다.

────────────────────────────────────────────────────────────────────────────
⚠️ 계약 스텁 (창1 작성, 2026-05-31)
  - 예외 클래스, ``generate_instructor_looks`` 시그니처, MOCK 경로는 **확정**이다.
  - 실제 OpenAI 호출부(`images/edits` + input_fidelity)와 프롬프트 매핑 정교화는
    **창2(feat/pa-backend-core)** 가 구현한다. 아래 ``_TODO_REAL_CALL`` 지점 참조.
  - 시그니처/예외/enum 을 바꿔야 하면 창1에 먼저 보고할 것(다른 창이 의존).
────────────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import base64
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


class OpenAIImageError(Exception):
    """gpt-image 호출 실패(통신·5xx·응답 파싱 등)."""


class OpenAIModerationRefused(OpenAIImageError):
    """모더레이션 거부 — 실존 인물 얼굴 생성을 정책상 거절.

    호출부는 이 예외를 받으면 '원본 사진 그대로 Talking Photo 직행' fallback 으로
    처리한다(docs §0.6 D). 일반 실패(OpenAIImageError)와 구분한다.
    """


# ── 프롬프트 매핑 (영어 직접 — 별도 번역 LLM 호출 금지) ───────────────────────
# 창2: 아래 매핑을 실제 룩 품질에 맞게 정교화할 것. 키(enum 값)는 schemas/avatar.py
# 의 PersonaT/OutfitT/BackgroundT/ExpressionT 와 1:1 로 유지(계약).

PERSONA_PROMPTS: dict[str, str] = {
    "educator": "a friendly university professor, approachable academic presence",
    "researcher": "a focused researcher, scholarly and precise demeanor",
    "mentor": "a warm mentor, encouraging and trustworthy presence",
    "podcast_host": "a conversational podcast host, engaging and relaxed",
}
OUTFIT_PROMPTS: dict[str, str] = {
    "suit": "a well-fitted business suit",
    "blazer": "a smart blazer over a shirt",
    "shirt": "a clean collared shirt",
    "knit": "a tidy knit sweater",
    "tee": "a plain quality t-shirt",
    "hoodie": "a clean casual hoodie",
}
BACKGROUND_PROMPTS: dict[str, str] = {
    "lecture": "a bright lecture hall background",
    "lab": "a tidy research lab background",
    "study": "a study with bookshelves",
    "studio": "a clean bright studio backdrop",
    "lounge": "a warm lounge with plants",
    "cafe": "a softly lit cafe background",
}
EXPRESSION_PROMPTS: dict[str, str] = {
    "neutral": "a calm neutral expression",
    "friendly": "a friendly expression",
    "warm": "a warm gentle smile",
    "confident": "a confident expression",
    "thoughtful": "a thoughtful expression",
}

# 사용자에게 노출하지 않는 HeyGen 최적화 레이어 — 항상 주입(docs §0.5 ①, PRD Hidden Layer).
_HIDDEN_HEYGEN_RULES = (
    "Keep the exact same person, identity, age, ethnicity, facial proportions, "
    "hairstyle, and facial features from the reference image. "
    "Direct frontal view, eye-level camera, face centered and fully visible, "
    "mouth and jawline unobstructed, head occupies about 30% of frame, comfortable "
    "headroom. Soft even frontal lighting, no harsh shadows. Ultra photorealistic, "
    "DSLR portrait quality, natural skin texture. "
    "Designed specifically for HeyGen talking-head avatar and lip-sync animation."
)


def build_prompt(
    persona: str,
    outfit: str | None,
    background: str | None,
    expression: str | None,
    extra: str | None,
) -> str:
    """구조화 옵션 → gpt-image-2 영어 프롬프트. (창2: 문구 정교화 가능, 구조 유지.)"""
    parts = [PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS["educator"])]
    if outfit and outfit in OUTFIT_PROMPTS:
        parts.append(f"wearing {OUTFIT_PROMPTS[outfit]}")
    if background and background in BACKGROUND_PROMPTS:
        parts.append(f"in {BACKGROUND_PROMPTS[background]}")
    if expression and expression in EXPRESSION_PROMPTS:
        parts.append(EXPRESSION_PROMPTS[expression])
    if extra:
        parts.append(extra.strip())
    subject = ", ".join(parts)
    return (
        f"Create a photorealistic professional instructor avatar: {subject}. "
        f"{_HIDDEN_HEYGEN_RULES}"
    )


# 1x1 투명 PNG (MOCK 더미). 실제 바이트는 무의미하나 PNG magic 으로 유효.
_DUMMY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


async def generate_instructor_looks(
    image_bytes: bytes,
    content_type: str,
    persona: str,
    outfit: str | None,
    background: str | None,
    expression: str | None,
    extra: str | None,
    count: int,
) -> list[bytes]:
    """업로드 사진 reference 로 룩 이미지 ``count`` 개를 생성해 bytes 목록을 반환.

    - MOCK(``OPENAI_IMAGE_MOCK=True``): 외부 호출 없이 더미 PNG ``count`` 개 반환.
    - 모더레이션 거부: ``OpenAIModerationRefused``.
    - 그 외 실패: ``OpenAIImageError``.
    """
    if count < 1:
        return []

    if settings.OPENAI_IMAGE_MOCK:
        logger.warning(
            "[OPENAI_IMAGE_MOCK] generate_instructor_looks 생략 — persona=%s, count=%d",
            persona, count,
        )
        return [_DUMMY_PNG for _ in range(count)]

    prompt = build_prompt(persona, outfit, background, expression, extra)
    logger.info(
        "gpt-image-2 룩 생성 요청: model=%s, quality=%s, fidelity=%s, count=%d",
        settings.OPENAI_IMAGE_MODEL,
        settings.PHOTO_AVATAR_IMAGE_QUALITY,
        settings.PHOTO_AVATAR_INPUT_FIDELITY,
        count,
    )

    # ── _TODO_REAL_CALL (창2 구현) ──────────────────────────────────────────
    # OpenAI 공식 SDK 로 images/edits 호출:
    #   - image=업로드 사진(image_bytes), prompt=prompt
    #   - model=settings.OPENAI_IMAGE_MODEL
    #   - quality=settings.PHOTO_AVATAR_IMAGE_QUALITY
    #   - input_fidelity=settings.PHOTO_AVATAR_INPUT_FIDELITY
    #   - size=인물 중심(예: "1024x1024"), n=count
    # 응답에서 b64_json 디코드 → list[bytes] 반환.
    # 모더레이션/정책 거부 응답은 OpenAIModerationRefused 로, 그 외 오류는
    # OpenAIImageError 로 래핑. 토큰/비용은 logger.info 로 계측(차별점 #2).
    raise NotImplementedError(
        "실제 gpt-image-2 호출은 창2(feat/pa-backend-core)에서 구현 예정. "
        "현재는 OPENAI_IMAGE_MOCK=True 경로만 동작한다."
    )
