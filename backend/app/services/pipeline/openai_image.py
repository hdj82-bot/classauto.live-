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

import openai

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
    "educator": (
        "a friendly university professor with an approachable, trustworthy academic "
        "presence, looking directly at the camera as if teaching a class"
    ),
    "researcher": (
        "a focused researcher with a scholarly, precise and composed demeanor, "
        "intellectual and credible"
    ),
    "mentor": (
        "a warm, encouraging mentor with a reassuring and supportive presence, "
        "patient and attentive"
    ),
    "podcast_host": (
        "a conversational podcast host with an engaging, relaxed and personable "
        "presence, naturally expressive"
    ),
}
OUTFIT_PROMPTS: dict[str, str] = {
    "suit": "a well-fitted tailored business suit with a clean shirt",
    "blazer": "a smart blazer worn over a collared shirt",
    "shirt": "a crisp, clean collared dress shirt",
    "knit": "a tidy, refined knit sweater",
    "tee": "a plain, good-quality fitted t-shirt",
    "hoodie": "a clean, smart-casual hoodie",
}
BACKGROUND_PROMPTS: dict[str, str] = {
    "lecture": "a bright modern lecture hall, softly blurred behind the subject",
    "lab": "a tidy, well-lit research laboratory, softly blurred behind the subject",
    "study": "a warm study lined with bookshelves, softly blurred behind the subject",
    "studio": "a clean, evenly lit neutral studio backdrop",
    "lounge": "a warm lounge with greenery, softly blurred behind the subject",
    "cafe": "a softly lit, cozy cafe interior, gently blurred behind the subject",
}
EXPRESSION_PROMPTS: dict[str, str] = {
    "neutral": "a calm, composed neutral expression",
    "friendly": "a friendly, open expression with a light smile",
    "warm": "a warm, gentle and welcoming smile",
    "confident": "a confident, self-assured expression",
    "thoughtful": "a thoughtful, attentive expression",
}

# 사용자에게 노출하지 않는 HeyGen 최적화 레이어 — 항상 주입(docs §0.5 ①·③, PRD Hidden Layer).
# 정체성 보존(같은 인물)·talking-head 적합 프레이밍(정면·인물 중심 1:1~포트레이트·
# 머리 ~30% 프레임·입/턱 비가림)을 강제한다. 정체성의 1차 보증은 images/edits +
# input_fidelity:high 이고, 이 문장은 프레이밍·조명·화질을 보조한다.
_HIDDEN_HEYGEN_RULES = (
    "Preserve the exact same person from the reference image — identical identity, "
    "age, gender, ethnicity, facial proportions, hairstyle, and facial features. "
    "Do not beautify, slim, or alter the face. "
    "Single person only, upper-body portrait, direct frontal view at eye level, "
    "face centered and fully visible with the mouth and jawline unobstructed, "
    "head occupying about 30% of the frame with comfortable headroom. "
    "Soft, even frontal lighting with no harsh shadows. "
    "Ultra photorealistic, DSLR portrait quality, natural and detailed skin texture, "
    "sharp focus on the face. "
    "Optimized as a still reference for a HeyGen talking-head avatar and lip-sync animation."
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

    # ── 실제 gpt-image-2 호출 (images/edits) ────────────────────────────────
    # 업로드 사진을 reference 로 전달해 인물 룩을 생성한다. content_type 에서
    # 확장자를 유도해 SDK 의 멀티파트 업로드 파일명에 반영한다.
    ext = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}.get(
        content_type, "png"
    )
    image_file = (f"reference.{ext}", image_bytes, content_type)

    client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    # input_fidelity 는 gpt-image-1 전용 파라미터다. gpt-image-2 처럼 지원하지 않는
    # 모델에 보내면 OpenAI 가 400 `invalid_input_fidelity_model` 로 거부한다.
    # PHOTO_AVATAR_INPUT_FIDELITY 가 빈 문자열이면 파라미터 자체를 생략해
    # 모델 전환이 env 만으로 가능하도록 한다.
    edit_kwargs: dict = {
        "model": settings.OPENAI_IMAGE_MODEL,
        "image": image_file,
        "prompt": prompt,
        "n": count,
        "size": "1024x1024",  # 인물 중심 정사각 (HeyGen talking-head 적합)
        "quality": settings.PHOTO_AVATAR_IMAGE_QUALITY,
    }
    if settings.PHOTO_AVATAR_INPUT_FIDELITY:
        edit_kwargs["input_fidelity"] = settings.PHOTO_AVATAR_INPUT_FIDELITY
    try:
        response = await client.images.edit(**edit_kwargs)
    except openai.BadRequestError as exc:
        # gpt-image 모더레이션/정책 거부는 BadRequest 로 온다(code=moderation_blocked 등).
        code = str(getattr(exc, "code", "") or "")
        if (
            "moderation" in code
            or "content_policy" in code
            or "safety" in code
            or "moderation" in str(exc).lower()
            or "content_policy" in str(exc).lower()
        ):
            logger.warning("gpt-image-2 모더레이션 거부: %s", exc)
            raise OpenAIModerationRefused(
                "gpt-image-2 가 실존 인물 얼굴 생성을 정책상 거부했습니다."
            ) from exc
        logger.error("gpt-image-2 요청 거부(BadRequest): %s", exc)
        raise OpenAIImageError(f"gpt-image-2 요청 실패: {exc}") from exc
    except openai.APIError as exc:
        logger.error("gpt-image-2 API 오류: %s", exc)
        raise OpenAIImageError(f"gpt-image-2 호출 실패: {exc}") from exc

    # ── 비용/사용량 계측 (차별점 #2 비용 투명성) ────────────────────────────
    usage = getattr(response, "usage", None)
    if usage is not None:
        logger.info(
            "gpt-image-2 사용량: input_tokens=%s, output_tokens=%s, total_tokens=%s, count=%d",
            getattr(usage, "input_tokens", None),
            getattr(usage, "output_tokens", None),
            getattr(usage, "total_tokens", None),
            count,
        )

    # ── 응답 → bytes 목록 ───────────────────────────────────────────────────
    data = getattr(response, "data", None) or []
    images: list[bytes] = []
    for item in data:
        b64 = getattr(item, "b64_json", None)
        if not b64:
            raise OpenAIImageError("gpt-image-2 응답에 이미지 데이터(b64_json)가 없습니다.")
        images.append(base64.b64decode(b64))

    if not images:
        raise OpenAIImageError("gpt-image-2 가 이미지를 반환하지 않았습니다.")
    if len(images) < count:
        logger.warning(
            "gpt-image-2 요청 %d 개 중 %d 개만 반환됨", count, len(images)
        )
    return images
