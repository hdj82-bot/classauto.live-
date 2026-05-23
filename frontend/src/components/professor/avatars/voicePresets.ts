/**
 * 아바타 샘플과 함께 들려줄 음성 옵션.
 *
 * 1순위: 백엔드 ``GET /api/voices`` 의 실제 ElevenLabs 음성 카탈로그
 *        (studio "음성과 자막" 패널과 동일 소스). 각 음성마다 고유한
 *        ``preview_url`` 음원이 있어 실제로 서로 다르게 들린다.
 * 2순위: 백엔드 미응답 시, 외부 의존성 없는 브라우저 음성 합성(Web Speech)
 *        폴백 프리셋. (단일 시스템 음성만 있는 환경에선 톤만 달라진다.)
 *
 * studio 의 TtsVoice 를 ``fromTtsVoice`` 로 이 도메인 타입(VoiceOption)으로
 * 매핑해 useVoicePreview 가 일관되게 재생한다.
 */

import type { TtsVoice } from "@/components/professor/studio/studioTypes";

export type VoiceGender = "male" | "female";

export interface VoiceOption {
  /** 안정적인 식별자 (선택 상태·랜덤 선택 키). */
  id: string;
  /** 화면에 표시할 음성 이름. */
  name: string;
  gender: VoiceGender;
  /** 한국어 특성 설명 (예: "부드러운 목소리 · 영국"). */
  meta?: string | null;
  /** 실제 음원 미리듣기 URL (ElevenLabs preview). 있으면 합성 대신 재생. */
  previewUrl?: string | null;
  // ── 합성(Web Speech) 폴백 파라미터 (previewUrl 이 없을 때만 사용) ──
  ttsLang?: string;
  ttsPitch?: number;
  ttsRate?: number;
}

/** ElevenLabs 음성의 성별 정규화. "female" 에 "male" 이 포함되므로 여성 먼저. */
function normalizeGender(v: TtsVoice): VoiceGender {
  const s = `${v.gender ?? ""} ${v.gender_ko ?? ""}`.toLowerCase();
  if (s.includes("female") || s.includes("여")) return "female";
  if (s.includes("male") || s.includes("남")) return "male";
  return "female"; // 알 수 없으면 여성 그룹으로.
}

/** 백엔드 TtsVoice → VoiceOption. */
export function fromTtsVoice(v: TtsVoice): VoiceOption {
  const meta =
    [v.description_ko, v.accent_ko].filter((p): p is string => !!p).join(" · ") ||
    [v.description, v.accent].filter((p): p is string => !!p).join(" · ") ||
    null;
  return {
    id: v.voice_id,
    name: v.display_name || v.name,
    gender: normalizeGender(v),
    meta,
    previewUrl: v.preview_url ?? null,
  };
}

/**
 * 브라우저 음성 합성 폴백 (백엔드 미응답 시). 이름은 표시용이며 실제 합성은
 * 사용자 브라우저의 ko-KR(우선) 음성에 pitch/rate 를 적용해 톤을 구분한다.
 */
export const TTS_FALLBACK_VOICES: VoiceOption[] = [
  { id: "tts-ko-male-jihun", name: "지훈", gender: "male", meta: "남성 · 표준", ttsLang: "ko-KR", ttsPitch: 0.82, ttsRate: 1.0 },
  { id: "tts-ko-male-doyun", name: "도윤", gender: "male", meta: "남성 · 낮은 톤", ttsLang: "ko-KR", ttsPitch: 0.7, ttsRate: 0.96 },
  { id: "tts-ko-male-minjun", name: "민준", gender: "male", meta: "남성 · 밝은 톤", ttsLang: "ko-KR", ttsPitch: 0.92, ttsRate: 1.04 },
  { id: "tts-ko-female-seoyeon", name: "서연", gender: "female", meta: "여성 · 표준", ttsLang: "ko-KR", ttsPitch: 1.2, ttsRate: 1.0 },
  { id: "tts-ko-female-jiwoo", name: "지우", gender: "female", meta: "여성 · 높은 톤", ttsLang: "ko-KR", ttsPitch: 1.34, ttsRate: 1.03 },
  { id: "tts-ko-female-haeun", name: "하은", gender: "female", meta: "여성 · 차분한 톤", ttsLang: "ko-KR", ttsPitch: 1.12, ttsRate: 0.98 },
];

export function getVoiceById(
  voices: VoiceOption[],
  id: string | null | undefined,
): VoiceOption | null {
  if (!id) return null;
  return voices.find((v) => v.id === id) ?? null;
}

/** 목록 중 무작위 하나. 새 아바타 선택 시 음성을 랜덤 배정한다. */
export function randomVoice(voices: VoiceOption[]): VoiceOption | null {
  if (voices.length === 0) return null;
  return voices[Math.floor(Math.random() * voices.length)];
}
