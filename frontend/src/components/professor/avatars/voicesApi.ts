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

// ── 공유 보이스 라이브러리 (GET /api/voices/library) ───────────────────────────

export interface LibraryVoice {
  voiceId: string;
  publicOwnerId: string;
  name: string;
  previewUrl: string | null;
  language: string | null;
  /** 성별/억양/설명은 모두 한국어로만 (백엔드가 영문은 숨김). */
  genderKo: string | null;
  accentKo: string | null;
  descriptionKo: string | null;
  favorite: boolean;
}

export interface LibraryResult {
  voices: LibraryVoice[];
  page: number;
  hasMore: boolean;
}

export interface LibraryQuery {
  page?: number;
  search?: string;
  gender?: "male" | "female" | "";
  language?: string;
}

interface SharedVoiceWire {
  voice_id: string;
  public_owner_id: string;
  name: string;
  preview_url?: string | null;
  language?: string | null;
  gender_ko?: string | null;
  accent_ko?: string | null;
  description_ko?: string | null;
  is_favorite: boolean;
}
interface SharedVoicesWire {
  voices: SharedVoiceWire[];
  page: number;
  has_more: boolean;
}

/** 공유 라이브러리 검색·페이지네이션. 실패 시 빈 결과로 degrade. */
export async function listLibraryVoices(
  q: LibraryQuery = {},
): Promise<LibraryResult> {
  const params: Record<string, string | number> = { page: q.page ?? 0 };
  if (q.search) params.search = q.search;
  if (q.gender) params.gender = q.gender;
  if (q.language) params.language = q.language;
  try {
    const { data } = await api.get<SharedVoicesWire>("/api/voices/library", {
      params,
    });
    return {
      voices: (data.voices ?? []).map((v) => ({
        voiceId: v.voice_id,
        publicOwnerId: v.public_owner_id,
        name: v.name,
        previewUrl: v.preview_url ?? null,
        language: v.language ?? null,
        genderKo: v.gender_ko ?? null,
        accentKo: v.accent_ko ?? null,
        descriptionKo: v.description_ko ?? null,
        favorite: v.is_favorite,
      })),
      page: data.page ?? q.page ?? 0,
      hasMore: !!data.has_more,
    };
  } catch {
    return { voices: [], page: q.page ?? 0, hasMore: false };
  }
}

/**
 * 공유 라이브러리 보이스를 내 계정에 추가 → 새 account voice_id 반환.
 * 요금제 보이스 한도 초과 등은 throw(호출부가 토스트로 안내).
 */
export async function addLibraryVoice(
  publicOwnerId: string,
  voiceId: string,
  name: string,
): Promise<string> {
  const { data } = await api.post<{ voice_id: string }>(
    `/api/voices/library/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(voiceId)}/add`,
    null,
    { params: { name } },
  );
  return data.voice_id;
}
