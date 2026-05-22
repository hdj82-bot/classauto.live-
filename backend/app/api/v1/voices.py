"""TTS 보이스 목록 API — 교수자 음성 선택 UI 용.

라우트는 lectures.py / avatars.py 와 동일하게 풀패스(``/api/voices``) 로 둔다.
ElevenLabs 보이스를 나열하되, 키 미설정·장애 시에는 빈 목록으로 degrade 해
음성 패널이 깨지지 않도록 한다 (보이스 선택은 보조 기능이라 502 보다 빈 목록이
적절하다 — 영상 생성은 voice_gender 기본 보이스로도 동작).
"""
from fastapi import APIRouter, Depends

from app.api.deps import require_professor
from app.models.user import User
from app.schemas.voice import TtsVoice, TtsVoicesResponse

router = APIRouter(tags=["voices"])


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

    voices: list[TtsVoice] = []
    for v in raw:
        vid = v.get("voice_id")
        if not vid:
            continue
        labels = v.get("labels") or {}
        voices.append(
            TtsVoice(
                voice_id=vid,
                name=v.get("name") or "Voice",
                gender=labels.get("gender"),
                accent=labels.get("accent"),
                description=v.get("description") or labels.get("description"),
                preview_url=v.get("preview_url"),
                category=v.get("category"),
            )
        )
    return TtsVoicesResponse(voices=voices, total=len(voices))
