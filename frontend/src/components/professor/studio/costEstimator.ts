/**
 * 비용 미리보기 계산 — 순수 함수.
 *
 * 외부 API 단가가 빈번히 변할 가능성이 있어 단가는 상수로 분리. 통합 PR
 * 시점에 백엔드 cost_tracker 의 단가 (`pipeline/cost_log.py`) 와 동기화
 * 권장. 본 모듈은 UX 용 추정치 — 실제 결제는 백엔드가 record_once 로 정확히 기록.
 */

import type { CostBreakdown, ScriptSegment, TtsProvider } from "./studioTypes";

// 단가는 USD 기준. 출처: AVATAR_VOICE_FEATURE_ROADMAP.md / docs/planning/02-guardrails.md
// (정확한 값은 백엔드 cost_log.py 와 통합 시 동기화).
export const TTS_RATES: Record<TtsProvider, number> = {
  // ElevenLabs Creator: $22/100k chars → 약 $0.00022/char. 마진 보수적으로 0.0003.
  elevenlabs: 0.0003,
  // Google Cloud TTS Standard: $4/1M chars. 마진 포함 0.00001 (일부 음성은 더 높음).
  google: 0.00001,
};

// HeyGen Pro: $24/월 + 영상 분당 평균 약 $0.85 ~ $1.0 분당. 1초당 약 $0.017.
export const HEYGEN_PER_SECOND_USD = 0.017;

// Step3 의 비용 미터에 표시되는 추정. 글자수 = 모든 segment 의 text 합산.
// 영상 길이 = 마지막 segment.end_seconds (또는 합산).
export function estimateCost(
  segments: readonly ScriptSegment[],
  ttsProvider: TtsProvider,
): CostBreakdown {
  const ttsChars = segments.reduce((sum, s) => sum + s.text.length, 0);
  const avatarSeconds = segments.reduce(
    (sum, s) => sum + Math.max(0, s.end_seconds - s.start_seconds),
    0,
  );

  const ttsRate = TTS_RATES[ttsProvider] ?? TTS_RATES.elevenlabs;
  const ttsCost = ttsChars * ttsRate;
  const avatarCost = avatarSeconds * HEYGEN_PER_SECOND_USD;

  return {
    ttsChars,
    ttsCost: round2(ttsCost),
    avatarSeconds,
    avatarCost: round2(avatarCost),
    total: round2(ttsCost + avatarCost),
  };
}

// USD 표시용 — 0.01 단위. 너무 작은 값은 0.01 로 끌어올려 "$0.00 — 정상이지만
// 무료 같음" 인상 방지. 빈 스크립트 (총 0초) 는 0 그대로.
function round2(n: number): number {
  if (n <= 0) return 0;
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0.01 : r;
}

// 시·분·초 변환 — Step5 의 영상 길이 표시 등.
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}
