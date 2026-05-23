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

from fastapi import APIRouter, Depends, HTTPException, Response

from app.api.deps import require_professor
from app.core.config import settings
from app.models.user import User
from app.schemas.voice import (
    VOICE_PREVIEW_MAX_CHARS,
    TtsVoice,
    TtsVoicesResponse,
    VoicePreviewRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["voices"])

# 한국어 강의에 두루 쓰기 좋은 ElevenLabs 기본(premade) 보이스 20종.
# 모두 eleven_multilingual_v2 로 한국어 발화가 가능하고, 계정에 별도 등록 없이도
# 합성(POST /v1/text-to-speech/{id})에 바로 쓸 수 있다. 한국어 네이티브 보이스는
# 추후 settings.CURATED_VOICE_IDS 환경변수로 차차 추가(코드 배포 불필요).
DEFAULT_CURATED_VOICE_IDS: tuple[str, ...] = (
    "9BWtsMINqrJLrRacOk9x",  # Aria (여성)
    "EXAVITQu4vr4xnSDxMaL",  # Sarah (여성)
    "FGY2WhTYpPnrIDTdsKH5",  # Laura (여성)
    "XB0fDUnXU5powFXDhCwa",  # Charlotte (여성)
    "Xb7hH8MSUJpSbSDYk0k2",  # Alice (여성)
    "XrExE9yKIg1WjnnlVkGX",  # Matilda (여성)
    "cgSgspJ2msm6clMCkdW9",  # Jessica (여성)
    "pFZP5JQG7iQjIQuC4Bku",  # Lily (여성)
    "CwhRBWXzGAHq8TQ4Fs17",  # Roger (남성)
    "IKne3meq5aSn9XLyUdCD",  # Charlie (남성)
    "JBFqnCBsd6RMkjVDRZzb",  # George (남성)
    "N2lVS1w4EtoT3dr4eOWO",  # Callum (남성)
    "TX3LPaxmHKxFdv7VOQHJ",  # Liam (남성)
    "bIHbv24MWmeRgasZH58o",  # Will (남성)
    "cjVigY5qzO86Huf0OWal",  # Eric (남성)
    "iP95p4xoKVk53GoZ742B",  # Chris (남성)
    "nPczCjzI2devNBz1zQrb",  # Brian (남성)
    "onwK4e9ZLuTAKqWW03F9",  # Daniel (남성)
    "pqHfZKP75CvOlQylNhV4",  # Bill (남성)
    "SAz9YHcvj6GT2YYXdXww",  # River (중성)
)

# 개별 조회한 큐레이션 보이스 raw 메타 캐시 (프로세스 수명). 보이스 목록은 거의
# 안 바뀌므로 첫 성공 이후엔 ElevenLabs 재호출 없이 재사용한다.
_CURATED_RAW_CACHE: dict[str, dict] = {}


def _curated_voice_ids() -> list[str]:
    """노출할 큐레이션 보이스 ID 목록(순서 보존·중복 제거).

    settings.CURATED_VOICE_IDS(쉼표 구분)가 있으면 그것을, 없으면 기본 20종.
    """
    raw = (settings.CURATED_VOICE_IDS or "").strip()
    source = [x.strip() for x in raw.split(",") if x.strip()] if raw else list(
        DEFAULT_CURATED_VOICE_IDS
    )
    seen: set[str] = set()
    ordered: list[str] = []
    for vid in source:
        if vid not in seen:
            seen.add(vid)
            ordered.append(vid)
    return ordered


async def _fetch_voices_by_id(ids: list[str]) -> dict[str, dict]:
    """주어진 보이스 ID 들의 raw 메타를 개별 조회(캐시 우선). 실패 항목은 제외.

    {voice_id: raw dict} 반환. ELEVENLABS_API_KEY 미설정·장애 시 빈 dict 로 degrade.
    """
    from app.services.pipeline.elevenlabs_client import get_voice

    todo = [i for i in ids if i not in _CURATED_RAW_CACHE]
    if todo:
        results = await asyncio.gather(
            *(get_voice(i) for i in todo), return_exceptions=True
        )
        for vid, res in zip(todo, results):
            if isinstance(res, dict) and res.get("voice_id"):
                _CURATED_RAW_CACHE[vid] = res
            # 예외(키 미설정/조회 실패)는 스킵 — 다음 요청에 재시도.
    return {i: _CURATED_RAW_CACHE[i] for i in ids if i in _CURATED_RAW_CACHE}


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

    # 0) 계정 보이스(교수자 커스텀 포함). 실패해도 빈 목록으로 진행 — 큐레이션
    #    보이스만으로도 목록을 구성할 수 있다.
    try:
        account_raw = await list_voices()
    except ElevenLabsError:
        account_raw = []
    account_by_id: dict[str, dict] = {
        v["voice_id"]: v for v in account_raw if v.get("voice_id")
    }

    # 1) 노출 순서 결정: 큐레이션 목록을 앞에(계정에 없으면 개별 조회로 보충),
    #    그 뒤에 계정 커스텀 보이스(큐레이션에 없는 것)를 덧붙인다.
    #    큐레이션이 비어 있으면 계정 보이스 전체(기존 동작).
    curated_ids = _curated_voice_ids()
    ordered_raw: list[dict] = []
    seen: set[str] = set()

    if curated_ids:
        missing = [cid for cid in curated_ids if cid not in account_by_id]
        fetched = await _fetch_voices_by_id(missing)
        for cid in curated_ids:
            entry = account_by_id.get(cid) or fetched.get(cid)
            if entry and cid not in seen:
                ordered_raw.append(entry)
                seen.add(cid)

    for vid, entry in account_by_id.items():
        if vid not in seen:
            ordered_raw.append(entry)
            seen.add(vid)

    if not ordered_raw:
        return TtsVoicesResponse(voices=[], total=0)

    # 2) 1차 파싱: voice_id 있는 항목만, 이름 분리.
    parsed: list[dict] = []
    for v in ordered_raw:
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


@router.post(
    "/api/voices/preview",
    summary="발화 내용 미리듣기 합성 (선택 보이스·속도로 실제 TTS)",
    responses={200: {"content": {"audio/mpeg": {}}}},
)
async def preview_voice(
    req: VoicePreviewRequest,
    user: User = Depends(require_professor),
) -> Response:
    """주어진 발화 내용을 선택한 보이스·속도로 실제 합성해 mp3 로 돌려준다.

    스튜디오의 'AI 발화 내용' 미리듣기 버튼이 호출 — 보이스 고정 샘플이 아니라
    실제 스크립트를 그 보이스/속도로 들려주기 위함. 비용·지연 보호로 텍스트는
    ``VOICE_PREVIEW_MAX_CHARS`` 로 잘라서 합성한다(영상 본 렌더와 무관, 미리듣기 전용).
    """
    from app.services.pipeline.tts import TTSError, synthesize

    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="미리들을 발화 내용이 비어 있습니다.")
    text = text[:VOICE_PREVIEW_MAX_CHARS]

    try:
        result = await synthesize(
            text,
            voice_id=req.voice_id or None,
            gender=req.gender,
            speed=req.speed,
        )
    except TTSError as exc:
        logger.warning("음성 미리듣기 합성 실패(TTS): %s", exc)
        raise HTTPException(
            status_code=502,
            detail="미리듣기 합성에 실패했습니다(TTS). 잠시 후 다시 시도해 주세요.",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        # 예기치 못한 예외(예: 외부 연결오류)가 핸들링 안 된 500 으로 새면, 그 응답엔
        # CORS 헤더가 안 붙어 브라우저가 "서버 연결 불가"로 막아버린다. 여기서 잡아
        # HTTPException(502)으로 변환하면 CORS 가 적용돼 프론트가 사유를 표시할 수 있다.
        # detail 에 예외 클래스명을 담아 운영 진단을 돕는다(스택/메시지는 로그에만).
        logger.exception("음성 미리듣기 예기치 못한 오류")
        raise HTTPException(
            status_code=502, detail=f"미리듣기 합성 오류: {type(exc).__name__}"
        ) from exc

    return Response(
        content=result.audio_bytes,
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )
