"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { VoiceGender, VoiceOption } from "./voicePresets";

/**
 * 아바타 샘플과 함께 음성을 들려주는 훅.
 *
 * 우선순위:
 *  1. option.previewUrl 이 있으면 ``<audio>`` 로 그 음원(ElevenLabs preview)을
 *     재생 — 실제 voice 미리듣기.
 *  2. 없으면 브라우저 음성 합성(Web Speech API)으로 샘플 문장을 읽어 준다.
 *
 * 둘 다 사용 불가한 환경(SSR·jsdom·미지원 브라우저)에서는 ``supported=false`` 로
 * 안전하게 무력화되며, UI 는 음성 없이 그대로 렌더된다.
 *
 * 재생은 항상 사용자 제스처(아바타 클릭·음성 변경·재생 버튼) 안에서 시작되므로
 * 브라우저 자동재생 정책에 걸리지 않는다.
 */

// 흔한 시스템 음성 이름 → 성별 추정 (ko/en/Windows·macOS·Chrome). 정확한 매칭이
// 안 되면 pitch 로 남/여 톤을 구분하므로 best-effort 로 충분하다.
const FEMALE_HINTS = [
  "heami", "sunhi", "sun-hi", "sun hi", "yuna", "kyoko", "zira", "hazel",
  "susan", "samantha", "victoria", "female", "여성", "여자",
];
const MALE_HINTS = [
  "injoon", "in-joon", "david", "mark", "george", "daniel", "alex", "fred",
  "male", "남성", "남자",
];

function guessGender(name: string): VoiceGender | null {
  const n = name.toLowerCase();
  if (FEMALE_HINTS.some((h) => n.includes(h))) return "female";
  if (MALE_HINTS.some((h) => n.includes(h))) return "male";
  return null;
}

/** option 에 가장 잘 맞는 시스템 음성 선택: 언어 우선 → 성별 매칭 → 폴백. */
function resolveSystemVoice(
  option: VoiceOption,
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const langBase = (option.ttsLang ?? "ko-KR").split("-")[0].toLowerCase();
  const sameLang = voices.filter((v) =>
    v.lang.toLowerCase().startsWith(langBase),
  );
  const pool = sameLang.length > 0 ? sameLang : voices;
  const genderMatch = pool.find((v) => guessGender(v.name) === option.gender);
  // 성별 매칭 음성 > 같은 언어 첫 음성 > 기본(default) > 첫 음성.
  return genderMatch ?? pool[0] ?? voices.find((v) => v.default) ?? voices[0];
}

// ── 음성 재생 지원 여부 (useSyncExternalStore 로 SSR/hydration 안전) ───────────
function supportSubscribe(): () => void {
  return () => {}; // 지원 여부는 런타임 중 바뀌지 않음.
}
function supportSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.speechSynthesis || typeof window.Audio !== "undefined";
}
function supportServerSnapshot(): boolean {
  return false;
}

export interface VoicePreviewState {
  /** 이 환경에서 음성 재생이 가능한지 (false 면 UI 가 음성 컨트롤을 숨김). */
  supported: boolean;
  /** 현재 재생(합성/음원) 중인지. */
  speaking: boolean;
  /** option 음성으로 재생. previewUrl 이 있으면 음원, 없으면 sampleText 합성.
   *  loop=true 면 끝난 뒤 자동 반복. */
  play: (option: VoiceOption, sampleText: string, loop?: boolean) => void;
  /** 재생 중지. */
  stop: () => void;
}

export function useVoicePreview(): VoicePreviewState {
  const supported = useSyncExternalStore(
    supportSubscribe,
    supportSnapshot,
    supportServerSnapshot,
  );
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // 현재 재생 세션 토큰 — 반복/중지 시 오래된 onend 콜백을 무시한다.
  const sessionRef = useRef(0);

  const stop = useCallback(() => {
    sessionRef.current += 1; // 진행 중 세션 무효화.
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* no-op */
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeaking(false);
  }, []);

  const play = useCallback(
    (option: VoiceOption, sampleText: string, loop = false) => {
      if (typeof window === "undefined") return;
      stop();
      const session = sessionRef.current;

      // 1) 실제 음원(ElevenLabs preview)이 있으면 그것을 재생.
      if (option.previewUrl && typeof window.Audio !== "undefined") {
        const audio = new Audio(option.previewUrl);
        audio.loop = loop;
        audioRef.current = audio;
        audio.onended = () => {
          if (sessionRef.current === session && !loop) setSpeaking(false);
        };
        audio.onerror = () => {
          if (sessionRef.current === session) setSpeaking(false);
        };
        const p = audio.play();
        if (p && typeof p.catch === "function") p.catch(() => setSpeaking(false));
        setSpeaking(true);
        return;
      }

      // 2) 음성 합성 폴백.
      const synth = window.speechSynthesis;
      if (!synth || typeof window.SpeechSynthesisUtterance === "undefined") {
        return;
      }
      // getVoices() 는 호출 시점에 읽는다(브라우저에 따라 늦게 채워짐).
      const voices = synth.getVoices();
      const speakOnce = () => {
        if (sessionRef.current !== session) return;
        const utter = new SpeechSynthesisUtterance(sampleText);
        const voice = resolveSystemVoice(option, voices);
        if (voice) {
          utter.voice = voice;
          utter.lang = voice.lang;
        } else {
          utter.lang = option.ttsLang ?? "ko-KR";
        }
        utter.pitch = option.ttsPitch ?? 1;
        utter.rate = option.ttsRate ?? 1;
        utter.onend = () => {
          if (sessionRef.current !== session) return;
          if (loop) {
            speakOnce();
          } else {
            setSpeaking(false);
          }
        };
        utter.onerror = () => {
          if (sessionRef.current === session) setSpeaking(false);
        };
        try {
          synth.speak(utter);
        } catch {
          setSpeaking(false);
        }
      };
      setSpeaking(true);
      speakOnce();
    },
    [stop],
  );

  // 언마운트 시 재생을 정리한다(상태 갱신 없이 외부 리소스만 해제).
  useEffect(
    () => () => {
      sessionRef.current += 1;
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* no-op */
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    },
    [],
  );

  return { supported, speaking, play, stop };
}
