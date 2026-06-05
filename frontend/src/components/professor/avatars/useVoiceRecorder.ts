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
 * 실패 원인을 ``errorReason`` 으로 구분해 카드가 사용자에게 구체적 안내를 한다:
 *  - 미지원 브라우저(MediaRecorder/getUserMedia 부재) → supported=false.
 *  - 비보안 컨텍스트(HTTP) → secureContext=false (getUserMedia 자체가 막힘).
 *  - 권한 거부(NotAllowedError/SecurityError) → state="denied".
 *  - 장치 없음(NotFoundError 등) → state="error", reason="no-device".
 *  - 장치 사용 중(NotReadableError 등) → reason="device-busy".
 *  - 코덱/컨테이너 미지원 → reason="mime" (후보 MIME 를 순차 폴백 후에도 실패).
 *  - 빈 녹음 → reason="empty".
 *
 * SSR/하이드레이션 안전: 지원 여부·보안 컨텍스트는 useSyncExternalStore 로
 * 서버 스냅샷과 분리한다(effect-내 setState 회피). localStorage 미사용.
 */

export type RecorderState =
  | "idle" // 녹음 전(지원됨)
  | "requesting" // 마이크 권한 요청 중
  | "recording" // 녹음 중
  | "recorded" // 녹음 완료(미리듣기·제출 가능)
  | "denied" // 권한 거부
  | "unsupported" // 브라우저 미지원
  | "error"; // 기타 오류

/** state="error"/"denied" 일 때 사용자 안내를 고르기 위한 세부 사유. */
export type RecorderErrorReason =
  | "denied"
  | "insecure"
  | "no-device"
  | "device-busy"
  | "mime"
  | "empty"
  | "unknown";

export interface VoiceRecorderOptions {
  /** 녹음이 끝나 파일이 만들어지면 호출 — 카드가 "현재 샘플"로 받는다. */
  onRecorded?: (file: File) => void;
}

export interface VoiceRecorder {
  state: RecorderState;
  /** 실패 세부 사유(없으면 null). */
  errorReason: RecorderErrorReason | null;
  /** 녹음 경과(ms). recording 중 100ms 단위 증가. */
  elapsedMs: number;
  /** 녹음 완료 후 재생용 object URL (없으면 null). */
  audioUrl: string | null;
  /** 녹음 결과 파일 — 기존 onSubmit(file) 으로 업로드. */
  file: File | null;
  /** MediaRecorder/getUserMedia 가 존재하는지(마운트 후 클라 판정). */
  supported: boolean;
  /** 보안 컨텍스트(HTTPS·localhost)인지. false 면 getUserMedia 가 막힌다. */
  secureContext: boolean;
  start: () => Promise<void>;
  stop: () => void;
  /** 녹음 결과를 비우고 idle 로 (다시 녹음). */
  reset: () => void;
}

// 브라우저별 지원 우선순위. ElevenLabs IVC 는 컨테이너에 관대하므로 가장 널리
// 쓰이는 webm/opus 를 우선하고, Safari 계열은 mp4 로 폴백한다. 마지막 ""(빈
// 문자열)은 "브라우저 기본 컨테이너" — 위 후보가 모두 막혀도 녹음되게 한다.
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "",
];

function extForMime(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("mpeg")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

/**
 * 후보 MIME 를 순서대로 시도해 실제로 생성되는 MediaRecorder 를 반환한다.
 * ``isTypeSupported`` 가 true 라 해도 일부 브라우저는 생성 시 throw 하므로,
 * try/catch 로 다음 후보로 넘어간다(녹음이 "에러 뜨고 안 됨"의 핵심 원인).
 */
// 클론(IVC) 입력 샘플 품질 ↑ — opus 기본 비트레이트는 가변·저비트일 수 있어
// 128kbps 로 고정해 또렷한 샘플을 만든다(ElevenLabs 클론 정확도↑). 인코딩 옵션이라
// 장치 제약(OverconstrainedError)을 유발하지 않아 호환성 위험이 없다.
const RECORD_AUDIO_BPS = 128_000;

function createRecorder(
  stream: MediaStream,
): { recorder: MediaRecorder; mime: string } | null {
  const canTest = typeof MediaRecorder.isTypeSupported === "function";
  for (const m of MIME_CANDIDATES) {
    if (m && canTest && !MediaRecorder.isTypeSupported(m)) continue;
    try {
      const opts: MediaRecorderOptions = { audioBitsPerSecond: RECORD_AUDIO_BPS };
      if (m) opts.mimeType = m;
      const recorder = new MediaRecorder(stream, opts);
      return { recorder, mime: recorder.mimeType || m };
    } catch {
      /* 다음 후보 시도 */
    }
  }
  return null;
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

/** 보안 컨텍스트(HTTPS·localhost) 인지. SSR 은 true(경고 비표시)로 가정. */
function detectSecure(): boolean {
  if (typeof window === "undefined") return true;
  return window.isSecureContext !== false;
}

// 지원/보안 여부는 변하지 않으므로 구독은 noop. useSyncExternalStore 로 서버
// 스냅샷을 분리해 하이드레이션 불일치/effect-내-setState 를 모두 피한다.
const emptySubscribe = () => () => {};

export function useVoiceRecorder(
  options: VoiceRecorderOptions = {},
): VoiceRecorder {
  const [state, setState] = useState<RecorderState>("idle");
  const [errorReason, setErrorReason] = useState<RecorderErrorReason | null>(
    null,
  );
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const supported = useSyncExternalStore(
    emptySubscribe,
    detectSupport,
    () => false,
  );
  const secureContext = useSyncExternalStore(
    emptySubscribe,
    detectSecure,
    () => true,
  );

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlRef = useRef<string | null>(null);

  // 최신 onRecorded 를 effect-setState 없이 참조하기 위한 ref.
  const onRecordedRef = useRef(options.onRecorded);
  useEffect(() => {
    onRecordedRef.current = options.onRecorded;
  }, [options.onRecorded]);

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
    if (!secureContext) {
      // HTTP 등 비보안 컨텍스트 — getUserMedia 가 거부되므로 사전 차단.
      setState("error");
      setErrorReason("insecure");
      return;
    }
    // 이전 녹음 결과 정리.
    swapUrl(null);
    setFile(null);
    setElapsedMs(0);
    setErrorReason(null);
    chunksRef.current = [];
    setState("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as { name?: string } | undefined)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setState("denied");
        setErrorReason("denied");
      } else if (
        name === "NotFoundError" ||
        name === "DevicesNotFoundError" ||
        name === "OverconstrainedError"
      ) {
        setState("error");
        setErrorReason("no-device");
      } else if (
        name === "NotReadableError" ||
        name === "TrackStartError" ||
        name === "AbortError"
      ) {
        setState("error");
        setErrorReason("device-busy");
      } else {
        setState("error");
        setErrorReason("unknown");
      }
      return;
    }

    streamRef.current = stream;
    const created = createRecorder(stream);
    if (!created) {
      stopStream();
      setState("error");
      setErrorReason("mime");
      return;
    }
    const { recorder, mime } = created;
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
        setErrorReason("empty");
        return;
      }
      const ext = extForMime(actualMime);
      const recorded = new File([blob], `recording-${Date.now()}.${ext}`, {
        type: actualMime,
      });
      swapUrl(URL.createObjectURL(blob));
      setFile(recorded);
      setState("recorded");
      onRecordedRef.current?.(recorded);
    };
    recorder.onerror = () => {
      clearTick();
      stopStream();
      setState("error");
      setErrorReason("unknown");
    };

    // timeslice 를 줘 주기적으로 dataavailable 이 flush 되게 한다(일부 브라우저는
    // timeslice 없이 stop 시 데이터가 비어 빈 녹음으로 끝나는 경우가 있음).
    try {
      recorder.start(1000);
    } catch {
      stopStream();
      setState("error");
      setErrorReason("unknown");
      return;
    }
    setState("recording");
    tickRef.current = setInterval(() => {
      setElapsedMs((ms) => ms + 100);
    }, 100);
  }, [supported, secureContext, swapUrl, stopStream, clearTick]);

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
    setErrorReason(null);
    chunksRef.current = [];
    setState(supported ? "idle" : "unsupported");
  }, [clearTick, stopStream, swapUrl, supported]);

  return {
    state,
    errorReason,
    elapsedMs,
    audioUrl,
    file,
    supported,
    secureContext,
    start,
    stop,
    reset,
  };
}
