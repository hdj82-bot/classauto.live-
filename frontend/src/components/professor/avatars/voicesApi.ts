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

/**
 * POST /api/voices/preview — 주어진 보이스로 샘플 문장을 실제 합성(mp3 Blob).
 *
 * 클론 음성처럼 preview_url 이 없는 보이스도 실제 음색으로 들려주기 위해 서버
 * TTS 를 쓴다(studio 'AI 발화 내용 미리듣기'와 동일 엔드포인트). 에러 시 throw.
 */
export async function previewVoice(voiceId: string, text: string): Promise<Blob> {
  const { data } = await api.post<Blob>(
    "/api/voices/preview",
    { text, voice_id: voiceId },
    { responseType: "blob" },
  );
  return data;
}

/**
 * 보이스 즐겨찾기 추가/해제 (교수자별).
 * PUT/DELETE /api/voices/{voice_id}/favorite. 둘 다 204. 합성 폴백 보이스
 * (id 가 "tts-" 로 시작)는 백엔드에 없으므로 호출하지 않는다.
 */
export async function setVoiceFavorite(
  voiceId: string,
  favorite: boolean,
): Promise<void> {
  const path = `/api/voices/${encodeURIComponent(voiceId)}/favorite`;
  if (favorite) await api.put(path);
  else await api.delete(path);
}
