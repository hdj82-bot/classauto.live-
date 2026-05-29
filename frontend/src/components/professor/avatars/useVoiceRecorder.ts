"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/**
 * 브라우저 직접 녹음 훅 (MediaRecorder).
 *
 * "내 목소리로 음성 만들기" 카드에서 파일 업로드 대신 마이크로 1분 내외 샘플을
 * 녹음하기 위한 것. 녹음 결과는 기존 음성 클론 업로드(POST /api/avatars/me/voice)
 * 로 그대로 올라가도록 ``File`` 로 만들어 둔다.
 *
 * graceful 처리:
 *  - 미지원 브라우저(MediaRecorder/getUserMedia 부재) → state="unsupported".
 *  - 권한 거부(NotAllowedError/SecurityError) → state="denied".
 *  - 그 외 실패 → state="error".
 *
 * SSR/하이드레이션 안전: 지원 여부는 mount 후 effect 에서 판정한다(초기 렌더는
 * 미지원 가정 → 서버/클라 출력 일치). localStorage 미사용.
 */

export type RecorderState =
  | "idle" // 녹음 전(지원됨)
  | "requesting" // 마이크 권한 요청 중
  | "recording" // 녹음 중
  | "recorded" // 녹음 완료(미리듣기·제출 가능)
  | "denied" // 권한 거부
  | "unsupported" // 브라우저 미지원
  | "error"; // 기타 오류

export interface VoiceRecorder {
  state: RecorderState;
  /** 녹음 경과(ms). recording 중 100ms 단위 증가. */
  elapsedMs: number;
  /** 녹음 완료 후 재생용 object URL (없으면 null). */
  audioUrl: string | null;
  /** 녹음 결과 파일 — 기존 onSubmit(file) 으로 업로드. */
  file: File | null;
  /** 마운트 후 판정된 지원 여부. */
  supported: boolean;
  start: () => Promise<void>;
  stop: () => void;
  /** 녹음 결과를 비우고 idle 로 (다시 녹음). */
  reset: () => void;
}

// 브라우저별 지원 우선순위. ElevenLabs IVC 는 컨테이너에 관대하므로 가장 널리
// 쓰이는 webm/opus 를 우선하고, Safari 계열은 mp4 로 폴백한다.
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMimeType(): string | null {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return null;
  }
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return ""; // 빈 문자열 = 브라우저 기본 컨테이너 사용
}

function extForMime(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

/** 녹음 지원 여부 — 클라이언트에서만 true 일 수 있다. */
function detectSupport(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined"
  );
}

// 지원 여부는 변하지 않으므로 구독은 noop. useSyncExternalStore 로 서버=false,
// 클라=실제값을 주어 하이드레이션 불일치/effect-내-setState 를 모두 피한다.
const emptySubscribe = () => () => {};

export function useVoiceRecorder(): VoiceRecorder {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const supported = useSyncExternalStore(
    emptySubscribe,
    detectSupport,
    () => false,
  );

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlRef = useRef<string | null>(null);

  const clearTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
  }, []);

  const swapUrl = useCallback((next: string | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next;
    setAudioUrl(next);
  }, []);

  // 언마운트 정리.
  useEffect(
    () => () => {
      clearTick();
      stopStream();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [clearTick, stopStream],
  );

  const start = useCallback(async () => {
    if (!supported) {
      setState("unsupported");
      return;
    }
    // 이전 녹음 결과 정리.
    swapUrl(null);
    setFile(null);
    setElapsedMs(0);
    chunksRef.current = [];
    setState("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as { name?: string } | undefined)?.name;
      setState(
        name === "NotAllowedError" || name === "SecurityError"
          ? "denied"
          : "error",
      );
      return;
    }

    streamRef.current = stream;
    const mime = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
    } catch {
      stopStream();
      setState("error");
      return;
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      clearTick();
      stopStream();
      const actualMime = recorder.mimeType || mime || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: actualMime });
      chunksRef.current = [];
      if (blob.size === 0) {
        setState("error");
        return;
      }
      const ext = extForMime(actualMime);
      const recorded = new File([blob], `recording-${Date.now()}.${ext}`, {
        type: actualMime,
      });
      swapUrl(URL.createObjectURL(blob));
      setFile(recorded);
      setState("recorded");
    };
    recorder.onerror = () => {
      clearTick();
      stopStream();
      setState("error");
    };

    recorder.start();
    setState("recording");
    tickRef.current = setInterval(() => {
      setElapsedMs((ms) => ms + 100);
    }, 100);
  }, [supported, swapUrl, stopStream, clearTick]);

  const stop = useCallback(() => {
    clearTick();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // onstop 이 파일·상태를 마무리
    }
  }, [clearTick]);

  const reset = useCallback(() => {
    clearTick();
    stopStream();
    swapUrl(null);
    setFile(null);
    setElapsedMs(0);
    chunksRef.current = [];
    setState(supported ? "idle" : "unsupported");
  }, [clearTick, stopStream, swapUrl, supported]);

  return { state, elapsedMs, audioUrl, file, supported, start, stop, reset };
}
