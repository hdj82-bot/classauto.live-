"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

// 기본값 (API 호출 실패 시 폴백)
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000;
const DEFAULT_NO_RESPONSE_TIMEOUT_MS = 30_000;

interface AttentionConfig {
  heartbeat_interval_ms: number;
  no_response_timeout_ms: number;
}

interface UseAttentionOptions {
  sessionId: string;
}

export function useAttention({ sessionId }: UseAttentionOptions) {
  const [warningLevel, setWarningLevel] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const progressRef = useRef(0);
  const lastResponseRef = useRef(Date.now());
  const heartbeatTimer = useRef<ReturnType<typeof setInterval>>(undefined);
  const noResponseTimer = useRef<ReturnType<typeof setInterval>>(undefined);
  const configRef = useRef<AttentionConfig>({
    heartbeat_interval_ms: DEFAULT_HEARTBEAT_INTERVAL_MS,
    no_response_timeout_ms: DEFAULT_NO_RESPONSE_TIMEOUT_MS,
  });
  const configLoaded = useRef(false);
  const consecutiveFailuresRef = useRef(0);

  // 서버에서 설정 로드 (한 번만)
  useEffect(() => {
    if (configLoaded.current) return;
    configLoaded.current = true;

    api
      .get<AttentionConfig>("/api/v1/attention/config")
      .then(({ data }) => {
        configRef.current = data;
      })
      .catch(() => {
        // 실패 시 기본값 유지
      });
  }, []);

  const setProgress = useCallback((seconds: number) => {
    progressRef.current = seconds;
    lastResponseRef.current = Date.now();
  }, []);

  // 하트비트 전송
  useEffect(() => {
    heartbeatTimer.current = setInterval(async () => {
      if (isPaused) return;
      try {
        const params = new URLSearchParams({
          session_id: sessionId,
          progress_seconds: String(progressRef.current),
        });
        if (consecutiveFailuresRef.current >= 2) {
          params.set("is_network_unstable", "true");
        }
        await api.post(`/api/v1/attention/heartbeat?${params}`);
        consecutiveFailuresRef.current = 0;
      } catch { /* 네트워크 오류 무시 */ consecutiveFailuresRef.current += 1; }
    }, configRef.current.heartbeat_interval_ms);

    return () => clearInterval(heartbeatTimer.current);
  }, [sessionId, isPaused]);

  // 무반응 감지
  useEffect(() => {
    noResponseTimer.current = setInterval(async () => {
      if (isPaused) return;
      const elapsed = Date.now() - lastResponseRef.current;
      if (elapsed > configRef.current.no_response_timeout_ms) {
        try {
          const { data } = await api.post(`/api/v1/attention/no-response?session_id=${sessionId}`);
          setWarningLevel(data.warning_level);
          setMessage(data.message);
          if (data.should_pause) setIsPaused(true);
        } catch { /* ignore */ }
        lastResponseRef.current = Date.now();
      }
    }, 5_000);

    return () => clearInterval(noResponseTimer.current);
  }, [sessionId, isPaused]);

  const resume = useCallback(async () => {
    try {
      const { data } = await api.post(`/api/v1/attention/resume?session_id=${sessionId}`);
      setWarningLevel(data.warning_level);
      setIsPaused(false);
      setMessage(null);
    } catch { /* ignore */ }
  }, [sessionId]);

  return { warningLevel, isPaused, message, setProgress, resume };
}
