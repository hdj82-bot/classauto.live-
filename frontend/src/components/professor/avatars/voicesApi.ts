import { api } from "@/lib/api";
import type { TtsVoice } from "@/components/professor/studio/studioTypes";
import {
  fromTtsVoice,
  TTS_FALLBACK_VOICES,
  type VoiceOption,
} from "./voicePresets";

/**
 * 음성 카탈로그 API 래퍼.
 *
 * studio "음성과 자막" 패널과 동일하게 ``GET /api/voices`` 를 사용한다
 * (백엔드 schemas/voice.py TtsVoice, ElevenLabs 라이브러리). 키 미설정·장애·
 * 빈 목록일 때만 브라우저 합성 폴백 프리셋으로 대체해 UI 가 비지 않도록 한다.
 */

interface VoicesResponseWire {
  voices: TtsVoice[];
  total: number;
}

export interface VoiceListResult {
  voices: VoiceOption[];
  /** 백엔드 미응답/빈 목록으로 합성 폴백을 쓰는 중인지. */
  deferred: boolean;
}

export async function listVoiceOptions(): Promise<VoiceListResult> {
  try {
    const { data } = await api.get<VoicesResponseWire>("/api/voices");
    const mapped = (data.voices ?? []).map(fromTtsVoice);
    if (mapped.length === 0) {
      return { voices: TTS_FALLBACK_VOICES, deferred: true };
    }
    return { voices: mapped, deferred: false };
  } catch {
    // 키 미설정·404·네트워크 실패 — 합성 폴백.
    return { voices: TTS_FALLBACK_VOICES, deferred: true };
  }
}
