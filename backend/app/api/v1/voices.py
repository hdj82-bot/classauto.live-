"""TTS 보이스 목록 API — 교수자 음성 선택 UI 용.

라우트는 lectures.py / avatars.py 와 동일하게 풀패스(``/api/voices``) 로 둔다.
ElevenLabs 보이스를 나열하되, 키 미설정·장애 시에는 빈 목록으로 degrade 해
음성 패널이 깨지지 않도록 한다 (보이스 선택은 보조 기능이라 502 보다 빈 목록이
적절하다 — 영상 생성은 voice_gender 기본 보이스로도 동작).

표기는 한국어로 제공한다: 성별/국적(억양)은 정적 맵으로, 보이스 특성 설명은
기존 번역기(DeepL→Google)로 영→한 번역한다. 보이스 목록은 거의 바뀌지 않으므로
설명 번역은 프로세스 메모리에 캐시해 매 요청 재번역을 피한다.
"""
import asyncio
import logging

from fastapi import APIRouter, Depends

from app.api.deps import require_professor
from app.models.user import User
from app.schemas.voice import TtsVoice, TtsVoicesResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["voices"])

# ElevenLabs labels.gender / labels.accent → 한국어. 미수록 값은 원문 유지.
_GENDER_KO = {"male": "남성", "female": "여성", "neutral": "중성", "non-binary": "중성"}
_ACCENT_KO = {
    "american": "미국",
    "british": "영국",
    "english": "영국",
    "australian": "호주",
    "irish": "아일랜드",
    "canadian": "캐나다",
    "indian": "인도",
    "scottish": "스코틀랜드",
    "us-southern": "미국 남부",
    "transatlantic": "대서양권",
    "african": "아프리카",
    "swedish": "스웨덴",
    "korean": "한국",
    "jamaican": "자메이카",
}

# 영문 보이스 설명 → 한국어 번역 캐시 (프로세스 수명). 목록이 거의 안 바뀌므로
# 첫 호출에만 번역 비용이 들고 이후엔 캐시 히트.
_DESC_KO_CACHE: dict[str, str] = {}


def _split_name(name: str) -> tuple[str, str]:
    """'Charlie - Deep, Confident, Energetic' → ('Charlie', 'Deep, Confident, Energetic').

    ' - ' 구분자가 없으면 (고유명, '') 로 반환.
    """
    if " - " in name:
        proper, desc = name.split(" - ", 1)
        return proper.strip(), desc.strip()
    return name.strip(), ""


async def _translate_descriptions(descs: list[str]) -> dict[str, str]:
    """영문 설명 리스트를 한국어로 번역. 캐시 우선, 실패 시 원문 폴백.

    반환: {영문 설명: 한국어(또는 원문)}.
    """
    todo = sorted({d for d in descs if d and d not in _DESC_KO_CACHE})
    if todo:
        try:
            from app.services.pipeline.translator import translate_batch

            results = await asyncio.to_thread(translate_batch, todo, "ko", "en")
            for src, res in zip(todo, results):
                _DESC_KO_CACHE[src] = (res.text or src).strip()
        except Exception as exc:  # 번역기 미설정/장애 — 원문으로 폴백
            logger.warning("보이스 설명 번역 실패, 원문 유지: %s", exc)
            for src in todo:
                _DESC_KO_CACHE[src] = src
    return {d: _DESC_KO_CACHE.get(d, d) for d in descs if d}


@router.get(
    "/api/voices",
    response_model=TtsVoicesResponse,
    summary="ElevenLabs TTS 보이스 목록 (교수자 음성 선택용)",
)
async def list_tts_voices(user: User = Depends(require_professor)):
    from app.services.pipeline.elevenlabs_client import ElevenLabsError, list_voices

    try:
        raw = await list_voices()
    except ElevenLabsError:
        return TtsVoicesResponse(voices=[], total=0)

    # 1) 1차 파싱: voice_id 있는 항목만, 이름 분리.
    parsed: list[dict] = []
    for v in raw:
        vid = v.get("voice_id")
        if not vid:
            continue
        labels = v.get("labels") or {}
        name = v.get("name") or "Voice"
        proper, desc = _split_name(name)
        # 설명은 name 의 descriptor 우선, 없으면 labels/description.
        desc = desc or v.get("description") or labels.get("description") or ""
        parsed.append(
            {
                "voice_id": vid,
                "name": name,
                "display_name": proper or "Voice",
                "desc_en": desc,
                "gender": labels.get("gender"),
                "accent": labels.get("accent"),
                "preview_url": v.get("preview_url"),
                "category": v.get("category"),
            }
        )

    # 2) 설명 한국어 번역 (캐시).
    desc_ko_map = await _translate_descriptions([p["desc_en"] for p in parsed])

    # 3) 응답 조립.
    voices: list[TtsVoice] = []
    for p in parsed:
        gender = p["gender"]
        accent = p["accent"]
        voices.append(
            TtsVoice(
                voice_id=p["voice_id"],
                name=p["name"],
                display_name=p["display_name"],
                gender=gender,
                accent=accent,
                description=p["desc_en"] or None,
                description_ko=desc_ko_map.get(p["desc_en"]) if p["desc_en"] else None,
                gender_ko=_GENDER_KO.get((gender or "").lower()) if gender else None,
                accent_ko=_ACCENT_KO.get((accent or "").lower(), accent) if accent else None,
                preview_url=p["preview_url"],
                category=p["category"],
            )
        )
    return TtsVoicesResponse(voices=voices, total=len(voices))
