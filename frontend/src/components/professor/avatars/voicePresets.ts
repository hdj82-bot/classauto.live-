/**
 * 아바타 샘플과 함께 들려줄 음성 프리셋.
 *
 * 백엔드(ElevenLabs voice 라이브러리)가 아직 배포되지 않아, 미리보기 단계에서는
 * 브라우저 내장 음성 합성(Web Speech API)으로 남/여 음성을 들려준다. 외부 오디오
 * 자산이나 네트워크 의존이 없어 Vercel 배포 환경에서 그대로 동작한다.
 *
 * 추후 창1 백엔드가 voice 목록을 내려주면, 각 프리셋에 ``sampleUrl`` (ElevenLabs
 * preview MP3)을 채우는 것만으로 useVoicePreview 가 합성 대신 실제 음원을 재생한다.
 */

export type VoiceGender = "male" | "female";

export interface VoicePreset {
  /** 안정적인 식별자 (선택 상태·랜덤 선택 키). */
  id: string;
  /** 화면에 표시할 음성 이름. */
  name: string;
  gender: VoiceGender;
  /** 우선 적용할 합성 언어 (없으면 ko-KR 우선). */
  lang: string;
  /** Web Speech 합성 시 음높이 — 같은 시스템 음성이라도 남/여 톤을 구분한다. */
  pitch: number;
  /** Web Speech 합성 시 말하기 속도. */
  rate: number;
  /**
   * 실제 음원 미리보기 URL (ElevenLabs preview 등). 채워지면 합성 대신
   * 이 음원을 재생한다. 현재는 미배포라 비워 둔다.
   */
  sampleUrl?: string | null;
}

/**
 * 남 3 · 여 3. 이름은 한국어 강의 맥락에 맞춘 표시용이며, 실제 합성은 사용자
 * 브라우저가 보유한 ko-KR(우선) 음성에 pitch/rate 를 적용해 구분한다.
 */
export const VOICE_PRESETS: VoicePreset[] = [
  { id: "ko-male-jihun", name: "지훈", gender: "male", lang: "ko-KR", pitch: 0.82, rate: 1.0 },
  { id: "ko-male-doyun", name: "도윤", gender: "male", lang: "ko-KR", pitch: 0.7, rate: 0.96 },
  { id: "ko-male-minjun", name: "민준", gender: "male", lang: "ko-KR", pitch: 0.92, rate: 1.04 },
  { id: "ko-female-seoyeon", name: "서연", gender: "female", lang: "ko-KR", pitch: 1.2, rate: 1.0 },
  { id: "ko-female-jiwoo", name: "지우", gender: "female", lang: "ko-KR", pitch: 1.34, rate: 1.03 },
  { id: "ko-female-haeun", name: "하은", gender: "female", lang: "ko-KR", pitch: 1.12, rate: 0.98 },
];

export function getVoicePreset(id: string | null | undefined): VoicePreset | null {
  if (!id) return null;
  return VOICE_PRESETS.find((v) => v.id === id) ?? null;
}

/** 전체 프리셋 중 무작위 하나. 새 아바타 선택 시 음성을 랜덤 배정한다. */
export function randomVoicePreset(): VoicePreset {
  return VOICE_PRESETS[Math.floor(Math.random() * VOICE_PRESETS.length)];
}
