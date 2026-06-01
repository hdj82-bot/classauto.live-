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

# 키(enum 값)는 schemas/avatar.py 의 PersonaT/OutfitT/BackgroundT/ExpressionT 와
# 1:1 로 유지(계약). 값은 영어 직접 — 별도 번역 LLM 호출 금지.
#
# 2026-06-01 정교화: 기존 매핑이 persona/outfit/background/expression 을 전혀
# 반영하지 못하고 원본 사진의 배경만 바꾸는 결과가 나왔다(사용자 보고). 원인은
# (1) 매핑 문장이 묘사적(passive — "wearing a blazer")이라 gpt-image-2 가
# reference 사진의 의상을 그대로 유지했고, (2) HIDDEN_RULES 의 "Do not alter"
# 어조가 의상·배경 교체보다 우선 적용된 것. 아래 매핑은 "REPLACE / DRESS /
# PLACE / SHOW" 류 동작 동사 + 구체적 컬러·재질 디테일로 강화한다.

PERSONA_PROMPTS: dict[str, str] = {
    "educator": (
        "an approachable university professor mid-lecture, projecting warm academic "
        "authority, body slightly angled toward camera, hands relaxed"
    ),
    "researcher": (
        "a focused academic researcher in deep concentration, scholarly and precise, "
        "intellectual gravitas, steady eye contact"
    ),
    "mentor": (
        "a warm encouraging mentor in a one-on-one conversation, reassuring and "
        "supportive presence, attentive posture leaning slightly in"
    ),
    "podcast_host": (
        "a charismatic podcast host mid-conversation, relaxed and personable, "
        "engaging body language, naturally expressive face"
    ),
}
# Outfit: 단순 명칭(blazer) → 구체적 컬러·재질·실루엣까지 지정해 reference 의
# 원본 의상을 확실히 덮어쓰도록 강화. 색은 의도적으로 ‘짙은 네이비’류로 고정해
# 강의 영상 톤에 자연스럽게 맞춘다.
OUTFIT_PROMPTS: dict[str, str] = {
    "suit": (
        "a sharply tailored charcoal-grey two-piece business suit with a crisp white "
        "dress shirt and a subtle dark tie, clean lapels and visible shoulder line"
    ),
    "blazer": (
        "a structured navy-blue wool blazer worn over a clean light-blue collared "
        "shirt, no tie, smart-casual cut"
    ),
    "shirt": (
        "a crisply pressed sky-blue Oxford dress shirt with the top button undone, "
        "no jacket, clean collar lines"
    ),
    "knit": (
        "a soft warm-beige fine-knit crewneck sweater layered over a thin white "
        "shirt collar, refined and tidy texture"
    ),
    "tee": (
        "a clean fitted heather-grey premium cotton t-shirt with a tidy crew neckline"
    ),
    "hoodie": (
        "a clean charcoal full-zip hoodie worn unzipped over a plain dark tee, "
        "smart-casual but composed"
    ),
}
# Background: 단순 위치(lecture hall) → 인물 뒤로 보이는 구체적 디테일 + 부드러운
# bokeh. 너무 화려하면 인물이 묻히므로 ‘softly blurred / shallow depth of field’
# 를 일관되게 깐다.
BACKGROUND_PROMPTS: dict[str, str] = {
    "lecture": (
        "a bright modern university lecture hall with rows of empty seats and a large "
        "whiteboard, softly out-of-focus behind the subject (shallow depth of field)"
    ),
    "lab": (
        "a tidy well-lit research laboratory with glassware, monitors, and lab "
        "benches gently bokeh'd behind the subject"
    ),
    "study": (
        "a warm private study with floor-to-ceiling walnut bookshelves and a soft "
        "warm lamp, softly out-of-focus behind the subject"
    ),
    "studio": (
        "a clean evenly-lit neutral grey studio backdrop, professional headshot "
        "context, no clutter"
    ),
    "lounge": (
        "a warm contemporary lounge with potted greenery and soft natural daylight, "
        "softly out-of-focus behind the subject"
    ),
    "cafe": (
        "a softly lit cozy specialty-coffee cafe interior with warm wood tones and "
        "subtle hanging lights, gently bokeh'd behind the subject"
    ),
}
# Expression: 단순 형용사 → 입꼬리/눈가 등 구체적 표정 근육 묘사로 강화.
EXPRESSION_PROMPTS: dict[str, str] = {
    "neutral": "a calm composed neutral expression, relaxed mouth, steady eyes",
    "friendly": (
        "a friendly open expression with a gentle natural light smile and warm eyes"
    ),
    "warm": "a warm welcoming smile, soft crinkle at the eyes, kind and inviting",
    "confident": (
        "a confident self-assured expression, steady direct gaze, subtle composed "
        "smile of authority"
    ),
    "thoughtful": (
        "a thoughtful attentive expression, slight tilt of the head, subtly furrowed "
        "brow as if listening intently"
    ),
}

# 사용자에게 노출하지 않는 HeyGen 최적화 레이어 — 항상 주입(docs §0.5 ①·③).
# 2026-06-01 v2 정교화: 사용자 보고 "얼굴이 너무 타이트하게 잡혀 머리 위가 잘리고
# 몸이 안 보임" → 와이드 가로(landscape 16:9 계열) + 인물 작게 + 어깨/상체 충분히
# 보이는 프레이밍으로 전환. 정체성은 얼굴 한정 보존 유지(머리 정돈·의상·배경 교체).
_HIDDEN_HEYGEN_RULES = (
    "PRESERVE EXACTLY (face only): the same person's identical facial identity, age, "
    "gender, ethnicity, facial proportions, skin tone, eye shape and color, eyebrows, "
    "nose, lips, and overall facial features as in the reference photo. "
    "Do NOT beautify, slim, smooth, or alter the face. "
    "Hairstyle should remain the same person's natural hair but may be neatly groomed. "
    "FRAMING (critical, must follow): wide landscape composition. Single person only, "
    "centered or slightly off-center, with the new background clearly visible on both "
    "sides of the subject. Show the full head with generous headroom above the hair "
    "(roughly 12-18% of the frame height above the head), and the upper body including "
    "both shoulders and the upper chest. The head should occupy roughly 20-25% of the "
    "frame WIDTH (not more) — do NOT zoom in tight on the face. Eye level, direct "
    "frontal view, mouth and jawline unobstructed. Natural relaxed posture. "
    "Soft, even frontal lighting with no harsh shadows. "
    "Render style: ultra photorealistic, DSLR portrait quality (50mm f/2.8 environmental "
    "portrait look — context visible, not a tight headshot), natural detailed skin "
    "texture with visible pores, sharp focus on the face. "
    "This still will be animated as a HeyGen talking-head avatar, so the mouth area "
    "must be unobstructed and lighting must be even and forward."
)


def build_prompt(
    persona: str,
    outfit: str | None,
    background: str | None,
    expression: str | None,
    extra: str | None,
) -> str:
    """구조화 옵션 → gpt-image-2 영어 프롬프트.

    2026-06-01 정교화: 명령형 구조(REPLACE / DRESS / PLACE / SHOW)로 재구성해
    reference 사진의 의상·배경이 그대로 유지되던 회귀를 해소한다. 얼굴은 PRESERVE,
    의상/배경/표정은 REPLACE/RENDER 로 의미를 분리한다.
    """
    persona_desc = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS["educator"])
    # 의상·배경·표정은 사용자가 명시한 항목만 강제 교체 지시문으로 포함한다.
    # 자동(None) 인 항목은 모델이 persona 에 어울리게 알아서 채우게 둔다.
    directives: list[str] = []
    if outfit and outfit in OUTFIT_PROMPTS:
        directives.append(
            f"REPLACE the clothing entirely — dress the subject in {OUTFIT_PROMPTS[outfit]}, "
            f"overriding any clothing visible in the reference photo."
        )
    if background and background in BACKGROUND_PROMPTS:
        directives.append(
            f"REPLACE the background entirely — place the subject in {BACKGROUND_PROMPTS[background]}, "
            f"overriding any background visible in the reference photo."
        )
    if expression and expression in EXPRESSION_PROMPTS:
        directives.append(
            f"RENDER the subject with {EXPRESSION_PROMPTS[expression]}."
        )
    directive_block = " ".join(directives)
    extra_block = f" Additional user request: {extra.strip()}." if extra and extra.strip() else ""
    return (
        f"Generate a photorealistic upper-body portrait of {persona_desc}. "
        f"{directive_block}"
        f"{extra_block} "
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

    # high quality + 1536x1024 면 호출당 30-60초까지 걸린다. n>=3 동시 처리 시
    # SDK 기본 60초 타임아웃을 넘어 ReadTimeout 으로 떨어질 수 있어 명시 상향.
    client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY, timeout=180.0)
    # input_fidelity 는 gpt-image-1 전용 파라미터다. gpt-image-2 처럼 지원하지 않는
    # 모델에 보내면 OpenAI 가 400 `invalid_input_fidelity_model` 로 거부한다.
    # PHOTO_AVATAR_INPUT_FIDELITY 가 빈 문자열이면 파라미터 자체를 생략해
    # 모델 전환이 env 만으로 가능하도록 한다.
    edit_kwargs: dict = {
        "model": settings.OPENAI_IMAGE_MODEL,
        "image": image_file,
        "prompt": prompt,
        "n": count,
        # 1536x1024 (3:2 landscape — gpt-image-2 지원). 사용자 보고 "16:9 를 기대했는데
        # 정사각으로 만들고 얼굴이 잘려 보인다" → 가로형으로 전환해 와이드 컴포지션
        # + 인물 작게 + 배경 양옆 노출. 강의 영상(16:9)에 합성될 때도 자연스럽다.
        # (gpt-image-2 의 정확한 16:9 사이즈는 미지원이라 3:2 가 최선 근사.)
        "size": "1536x1024",
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
