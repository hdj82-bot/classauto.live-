"""TTS 호출 비용 산정 + 기록 헬퍼.

``app.services.pipeline.cost_log.record_once_committed`` 의 thin wrapper —
provider 별 단가 산정과 metadata 표준화만 담당한다. 실제 행 INSERT 와
UNIQUE(video_render_id, operation) 충돌 처리는 cost_log 가 한다.

가격 (2026-05 기준 공식 페이지 추정값):
- ElevenLabs Multilingual v2: 약 $0.30 / 1K chars (Starter 환산)
- Google Cloud TTS Neural2/Wavenet: $16 / 1M chars = $0.016 / 1K chars

실제 결제 청구액과 차이가 나면 admin 대시보드에서 metadata.text_chars 로
재계산할 수 있도록 raw 글자수와 provider 를 함께 저장한다.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from app.services.pipeline import cost_log

if TYPE_CHECKING:
    import uuid

logger = logging.getLogger(__name__)


# ── 단가 (USD per 1,000 chars). 보수적 상한값. ──────────────────────────────
ELEVENLABS_USD_PER_1K_CHARS = 0.30        # multilingual_v2 Starter 기준
GOOGLE_TTS_USD_PER_1K_CHARS = 0.016        # Neural2/Wavenet 16 USD / M chars
# 글자수 단가가 0 인 알 수 없는 provider 의 폴백 — 비용 0 으로 기록.
_UNKNOWN_PROVIDER_USD_PER_1K_CHARS = 0.0


def estimate_tts_cost_usd(provider: str, text_chars: int) -> float:
    """provider 와 글자수로 단가 추정."""
    if text_chars <= 0:
        return 0.0
    if provider == "elevenlabs":
        rate = ELEVENLABS_USD_PER_1K_CHARS
    elif provider == "google_tts":
        rate = GOOGLE_TTS_USD_PER_1K_CHARS
    else:
        rate = _UNKNOWN_PROVIDER_USD_PER_1K_CHARS
    return text_chars * rate / 1000.0


def record_tts_cost(
    sessionmaker,
    video_render_id: uuid.UUID,
    *,
    provider: str,
    text_chars: int,
    duration_seconds: float | None = None,
    fallback_reason: str | None = None,
    extra: dict[str, Any] | None = None,
) -> bool:
    """TTS 합성 결과를 cost_logs 에 기록.

    operation 은 ``"tts_synthesize"`` 로 고정 — render_slide 의 후속
    record_once_committed(operation="tts_synthesize") 호출과 충돌 시
    UNIQUE 제약에 의해 idempotent skip 으로 처리된다 (먼저 INSERT 한 쪽이 승리).

    ``fallback_reason`` 이 주어지면 metadata 에 ``fallback_from=elevenlabs`` 와
    예외 클래스명을 함께 기록 — 운영 대시보드에서 폴백 빈도 추적용.
    """
    cost = estimate_tts_cost_usd(provider, text_chars)
    metadata: dict[str, Any] = {
        "text_chars": text_chars,
        "provider": provider,
    }
    if fallback_reason:
        metadata["fallback_from"] = "elevenlabs"
        metadata["fallback_reason"] = fallback_reason
    if extra:
        metadata.update(extra)

    logger.info(
        "TTS 비용 산정: provider=%s, chars=%d, cost=$%.4f, fallback=%s",
        provider, text_chars, cost, bool(fallback_reason),
    )
    return cost_log.record_once_committed(
        sessionmaker=sessionmaker,
        video_render_id=video_render_id,
        service=provider,
        operation="tts_synthesize",
        cost_usd=cost,
        duration_seconds=duration_seconds,
        metadata=metadata,
    )
