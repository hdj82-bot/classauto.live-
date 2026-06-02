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

import asyncio
import base64
import io
import logging

import openai

from app.core.config import settings

logger = logging.getLogger(__name__)

# 16:9 목표 비율(가로/세로).
_TARGET_16_9 = 16 / 9


def crop_to_16_9(png_bytes: bytes, top_bias: float | None = None) -> bytes:
    """3:2(1536x1024) 룩을 **선명하게** 16:9 로 크롭한다(흐림·여백 없음).

    gpt-image-2 는 16:9 를 직접 만들지 못해 1536x1024(3:2) 로 생성한다. 이 함수는
    그 고화질 결과를 그대로 살린 채 세로를 16:9 에 맞게 잘라(=확대 효과) 강의
    영상 톤에 맞춘다. 잘리는 세로 초과분은 ``top_bias`` 만큼 **위쪽 여백에서 우선**
    덜어내 하단(손·허리)을 보존한다(사용자 핵심 요구: "하단이 짤리지 않게").

    실패하면(이미지 파싱 등) 원본 bytes 를 그대로 돌려준다(생성 자체를 막지 않음).
    """
    if top_bias is None:
        top_bias = settings.PHOTO_AVATAR_16_9_TOP_BIAS
    top_bias = max(0.0, min(1.0, top_bias))
    try:
        from PIL import Image

        with Image.open(io.BytesIO(png_bytes)) as im:
            im = im.convert("RGB")
            w, h = im.size
            if w <= 0 or h <= 0:
                return png_bytes
            ratio = w / h
            if abs(ratio - _TARGET_16_9) < 1e-3:
                return png_bytes  # 이미 16:9
            if ratio < _TARGET_16_9:
                # 세로가 16:9 보다 길다(3:2 등) → 세로를 줄여 16:9. 위쪽에서 우선 자른다.
                target_h = round(w / _TARGET_16_9)
                excess = h - target_h
                top = int(round(excess * top_bias))
                box = (0, top, w, top + target_h)
            else:
                # 가로가 16:9 보다 넓다 → 좌우를 균등하게 자른다(드문 경우).
                target_w = round(h * _TARGET_16_9)
                left = (w - target_w) // 2
                box = (left, 0, left + target_w, h)
            cropped = im.crop(box)
            out = io.BytesIO()
            cropped.save(out, format="PNG")
            return out.getvalue()
    except Exception:  # pragma: no cover - 방어적: 후처리 실패는 원본으로 폴백
        logger.warning("16:9 크롭 실패 — 원본 비율 그대로 사용", exc_info=True)
        return png_bytes


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
# Background: 사용자 요청(2026-06-01) "배경도 선명하게 생성" — 이전엔 softly
# blurred / shallow depth of field 로 인물 뒤가 흐릿했다. 이번엔 deep DOF·환경
# 디테일 가시·선명한 가장자리로 전환해 강의실/연구실 등이 실제로 보이게 한다.
# (인물 분리는 입체감·조명으로 충분히 살릴 수 있다.)
BACKGROUND_PROMPTS: dict[str, str] = {
    "lecture": (
        "a bright modern university lecture hall behind the subject — rows of empty "
        "seats, a large whiteboard or chalkboard, ceiling lights, all clearly visible "
        "and rendered in sharp focus with readable detail"
    ),
    "lab": (
        "a tidy well-lit research laboratory behind the subject — glassware, monitors "
        "with charts, lab benches and shelves, all clearly visible and rendered in "
        "sharp focus with readable detail"
    ),
    "study": (
        "a warm private study behind the subject — floor-to-ceiling walnut bookshelves "
        "with visible book spines, a desk lamp and small artifacts, all clearly "
        "visible and rendered in sharp focus with readable detail"
    ),
    "studio": (
        "a contemporary podcast / broadcast recording studio behind the subject — "
        "a visible professional condenser microphone on a boom arm, studio headphones, "
        "acoustic foam panels on the walls, an LED ring light, monitors and audio mixer, "
        "ambient warm accent lighting (subtle teal-and-orange or warm RGB), all clearly "
        "visible and rendered in sharp focus with readable detail. Not a plain photo "
        "backdrop — a working recording space."
    ),
    "lounge": (
        "a warm contemporary lounge behind the subject — potted greenery, a couch, "
        "wall art, and a window with natural daylight, all clearly visible and "
        "rendered in sharp focus with readable detail"
    ),
    "cafe": (
        "a cozy specialty-coffee cafe interior behind the subject — warm wood tones, "
        "hanging lights, a counter with cups and a chalkboard menu, all clearly "
        "visible and rendered in sharp focus with readable detail"
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
# Prop (v0.3): 장면에 보이는 소품. 핸드헬드 마이크는 별도 POSE("holding_mic")가
# 책임지므로 여기는 스탠드 마이크만 둔다.
PROP_PROMPTS: dict[str, str] = {
    "mic_stand": (
        "a professional black broadcast/podcast condenser microphone on a desk arm "
        "stand clearly visible in the foreground beside the subject (camera left or "
        "right), tasteful and not blocking the face"
    ),
}
# Pose (v0.3): 손·팔의 자세. HeyGen 갤러리 류 다양성 — 발화 제스처·팔짱·마이크
# 잡기 등. "holding_mic" 은 핸드헬드 마이크의 존재까지 함께 강제한다.
POSE_PROMPTS: dict[str, str] = {
    "crossed_arms": (
        "with both arms crossed comfortably over the chest, hands and forearms clearly "
        "visible in the frame, confident relaxed stance"
    ),
    "gesturing": (
        "both hands raised mid-gesture in front of the chest as if naturally "
        "explaining a concept while speaking, expressive open hand position, hands "
        "clearly visible in the frame"
    ),
    "holding_mic": (
        "holding a professional handheld podcast microphone with one hand near the "
        "mouth; the handheld microphone must be clearly visible in the scene"
    ),
    "relaxed_at_sides": (
        "with arms relaxed naturally at the sides or one hand resting comfortably "
        "on a surface, posture composed and unforced"
    ),
}

# 사용자에게 노출하지 않는 HeyGen 최적화 레이어 — 항상 주입(docs §0.5 ①·③).
# 2026-06-01 v2 정교화: 사용자 보고 "얼굴이 너무 타이트하게 잡혀 머리 위가 잘리고
# 몸이 안 보임" → 와이드 가로(landscape 16:9 계열) + 인물 작게 + 어깨/상체 충분히
# 보이는 프레이밍으로 전환. 정체성은 얼굴 한정 보존 유지(머리 정돈·의상·배경 교체).
# 2026-06-02: 생성은 3:2(1536x1024)지만 후처리로 위쪽을 잘라 16:9 로 만든다. 그래서
# 머리 위 여백을 넉넉히, 손·허리는 하단에서 조금 띄워 크롭 후에도 둘 다 살아남게 한다.
_HIDDEN_HEYGEN_RULES = (
    "PRESERVE EXACTLY (face only): the same person's identical facial identity, age, "
    "gender, ethnicity, facial proportions, skin tone, eye shape and color, eyebrows, "
    "nose, lips, and overall facial features as in the reference photo. "
    "Do NOT beautify, slim, smooth, or alter the face. "
    "Hairstyle should remain the same person's natural hair but may be neatly groomed. "
    "FRAMING (mandatory, must follow exactly): waist-up portrait in a wide landscape "
    "composition. IMPORTANT: this image will be cropped to 16:9 by trimming the TOP, "
    "so leave GENEROUS empty headroom above the hair (about 20% of the image height is "
    "empty space above the head) and keep the waist and BOTH hands comfortably ABOVE "
    "the very bottom edge (a small margin, about 8-10% of the height, below the hands). "
    "The subject's head-and-torso should occupy roughly the central 70% of the vertical "
    "frame. BOTH hands and forearms MUST be clearly visible in the frame — never crop "
    "above the chest, never crop the hands out. Single person only, centered or slightly "
    "off-center with the background clearly visible on both sides. Head occupies roughly "
    "15-18% of the frame WIDTH (small enough that the full upper body and hands fit "
    "comfortably). Eye level, direct frontal view, mouth and jawline unobstructed. "
    "Natural relaxed posture. "
    "Soft, even frontal lighting with no harsh shadows. "
    "Render style: ultra photorealistic, DSLR environmental portrait look at "
    "35mm f/5.6 (deeper depth of field — both the subject and the entire background "
    "are clearly in focus and readable). Avoid background blur and bokeh. "
    "Natural detailed skin texture with visible pores, sharp focus on the face. "
    "This still will be animated as a HeyGen talking-head avatar, so the mouth area "
    "must be unobstructed and lighting must be even and forward."
)


def build_prompt(
    persona: str,
    outfit: str | None,
    background: str | None,
    expression: str | None,
    extra: str | None,
    prop: str | None = None,
    pose: str | None = None,
) -> str:
    """구조화 옵션 → gpt-image-2 영어 프롬프트.

    2026-06-01 정교화: 명령형 구조(REPLACE / DRESS / PLACE / SHOW)로 재구성해
    reference 사진의 의상·배경이 그대로 유지되던 회귀를 해소한다. 얼굴은 PRESERVE,
    의상/배경/표정은 REPLACE/RENDER 로 의미를 분리한다.
    v0.3: prop(소품)·pose(손·팔 자세) 추가 — HeyGen 갤러리 류 다양성을 위해.
    holding_mic 자세는 핸드헬드 마이크의 존재까지 함께 강제한다.
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
    if prop and prop in PROP_PROMPTS:
        directives.append(f"INCLUDE in the scene: {PROP_PROMPTS[prop]}.")
    if pose and pose in POSE_PROMPTS:
        directives.append(f"POSE the subject {POSE_PROMPTS[pose]}.")
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


# v0.3 (2026-06-01): pose 미지정 시 N장 사이에 자동 로테이션 — 사용자 요청
# "3장 그림 생성인데 하나는 가만 정자세, 하나는 팔짱, 하나는 말하는 역동적인 제스처".
# 사용자가 pose 를 명시했으면 모든 N 에 동일 적용(기존 contract 보존).
_POSE_ROTATION: list[str] = ["relaxed_at_sides", "crossed_arms", "gesturing"]


def _is_moderation_refusal(exc: BaseException) -> bool:
    """gpt-image 의 BadRequest 가 moderation/content_policy 거부인지."""
    if not isinstance(exc, openai.BadRequestError):
        return False
    code = str(getattr(exc, "code", "") or "")
    msg = str(exc).lower()
    return (
        "moderation" in code
        or "content_policy" in code
        or "safety" in code
        or "moderation" in msg
        or "content_policy" in msg
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
    prop: str | None = None,
    pose: str | None = None,
) -> list[bytes]:
    """업로드 사진 reference 로 룩 이미지 ``count`` 개를 생성해 bytes 목록을 반환.

    v0.3 (2026-06-01): ``count`` 개를 **각각 별도 호출** 로 만든다(이전엔 n=count
    단일 호출이라 결과가 서로 닮은 사고가 있었음). ``pose`` 가 None 이면 호출별로
    ``_POSE_ROTATION`` 을 순환 적용 — 사용자가 "각기 따로 적용" 요청한 동작.

    - MOCK(``OPENAI_IMAGE_MOCK=True``): 외부 호출 없이 더미 PNG ``count`` 개 반환.
    - 모더레이션 거부가 모든 호출에서 발생: ``OpenAIModerationRefused``.
    - 부분 실패: 성공한 N' < count 만 반환(태스크가 남은 placeholder 를 failed 처리).
    - 모두 실패(비-moderation): ``OpenAIImageError``.
    """
    if count < 1:
        return []

    if settings.OPENAI_IMAGE_MOCK:
        logger.warning(
            "[OPENAI_IMAGE_MOCK] generate_instructor_looks 생략 — persona=%s, count=%d",
            persona, count,
        )
        return [_DUMMY_PNG for _ in range(count)]

    # 호출별 pose 결정 — 명시 pose 가 있으면 모두 동일, 없으면 rotation.
    per_call_poses: list[str | None] = (
        [pose] * count if pose else [_POSE_ROTATION[i % len(_POSE_ROTATION)] for i in range(count)]
    )
    prompts = [
        build_prompt(persona, outfit, background, expression, extra, prop, p)
        for p in per_call_poses
    ]
    logger.info(
        "gpt-image-2 룩 생성 요청(N 분할): model=%s, quality=%s, fidelity=%s, count=%d, prop=%s, poses=%s",
        settings.OPENAI_IMAGE_MODEL,
        settings.PHOTO_AVATAR_IMAGE_QUALITY,
        settings.PHOTO_AVATAR_INPUT_FIDELITY,
        count,
        prop,
        per_call_poses,
    )

    ext = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}.get(
        content_type, "png"
    )

    # high quality + 1536x1024 면 호출당 30-60초까지 걸린다. 병렬 호출이라 각자
    # 독립적으로 타임아웃이 적용되므로 SDK 의 기본 60초보다 여유 있는 값으로 명시.
    client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY, timeout=180.0)

    async def _one_call(idx: int, prompt: str) -> bytes:
        kwargs: dict = {
            "model": settings.OPENAI_IMAGE_MODEL,
            # 매 호출마다 동일 reference 를 새 tuple 로 전달(SDK 가 내부에서 소비할 수 있어).
            "image": (f"reference.{ext}", image_bytes, content_type),
            "prompt": prompt,
            "n": 1,
            "size": "1536x1024",  # 3:2 가로 (강의 영상 16:9 톤과 정합).
            "quality": settings.PHOTO_AVATAR_IMAGE_QUALITY,
        }
        if settings.PHOTO_AVATAR_INPUT_FIDELITY:
            kwargs["input_fidelity"] = settings.PHOTO_AVATAR_INPUT_FIDELITY
        response = await client.images.edit(**kwargs)
        data = getattr(response, "data", None) or []
        if not data:
            raise OpenAIImageError(f"#{idx}: gpt-image-2 응답에 이미지가 없습니다.")
        b64 = getattr(data[0], "b64_json", None)
        if not b64:
            raise OpenAIImageError(f"#{idx}: gpt-image-2 응답에 b64_json 이 없습니다.")
        usage = getattr(response, "usage", None)
        if usage is not None:
            logger.info(
                "gpt-image-2 사용량(#%d): input_tokens=%s, output_tokens=%s, total_tokens=%s, pose=%s",
                idx,
                getattr(usage, "input_tokens", None),
                getattr(usage, "output_tokens", None),
                getattr(usage, "total_tokens", None),
                per_call_poses[idx],
            )
        return base64.b64decode(b64)

    results = await asyncio.gather(
        *[_one_call(i, p) for i, p in enumerate(prompts)],
        return_exceptions=True,
    )

    images: list[bytes] = []
    moderation_count = 0
    error_count = 0
    for idx, res in enumerate(results):
        if isinstance(res, BaseException):
            if _is_moderation_refusal(res):
                logger.warning("gpt-image-2 #%d 모더레이션 거부: %s", idx, res)
                moderation_count += 1
            else:
                logger.warning("gpt-image-2 #%d 호출 실패: %s", idx, res)
                error_count += 1
            continue
        images.append(res)  # type: ignore[arg-type]

    if not images and moderation_count > 0:
        # 부분 성공이 전혀 없고 적어도 한 건이 moderation → fallback 신호.
        raise OpenAIModerationRefused(
            "gpt-image-2 가 실존 인물 얼굴 생성을 정책상 거부했습니다."
        )
    if not images:
        raise OpenAIImageError(
            f"gpt-image-2 호출 전부 실패(count={count}, errors={error_count})."
        )
    if len(images) < count:
        logger.warning(
            "gpt-image-2 부분 성공: 요청=%d, 성공=%d, 실패=%d, moderation=%d",
            count, len(images), error_count, moderation_count,
        )
    return images
