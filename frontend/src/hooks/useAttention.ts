"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

interface UseAttentionOptions {
  sessionId: string;
  heartbeatInterval?: number;
  noResponseTimeout?: number;
}

export function useAttention({ sessionId, heartbeatInterval = 10_000, noResponseTimeout = 30_000 }: UseAttentionOptions) {
  const [warningLevel, setWarningLevel] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const progressRef = useRef(0);
  const lastResponseRef = useRef(Date.now());
  const heartbeatTimer = useRef<ReturnType<typeof setInterval>>();
  const noResponseTimer = useRef<ReturnType<typeof setInterval>>();

  const setProgress = useCallback((seconds: number) => {
    progressRef.current = seconds;
    lastResponseRef.current = Date.now();
  }, []);

  // 하트비트 전송
  useEffect(() => {
    heartbeatTimer.current = setInterval(async () => {
      if (isPaused) return;
      try {
        await api.post("/api/v1/attention/heartbeat", {
          session_id: sessionId,
          progress_seconds: progressRef.current,
          is_network_unstable: !navigator.onLine,
        });
      } catch { /* 네트워크 오류 무시 */ }
    }, heartbeatInterval);

    return () => clearInterval(heartbeatTimer.current);
  }, [sessionId, heartbeatInterval, isPaused]);

  // 무반응 감지
  useEffect(() => {
    noResponseTimer.current = setInterval(async () => {
      if (isPaused) return;
      const elapsed = Date.now() - lastResponseRef.current;
      if (elapsed > noResponseTimeout) {
        try {
          const { data } = await api.post("/api/v1/attention/no-response", { session_id: sessionId });
          setWarningLevel(data.warning_level);
          setMessage(data.message);
          if (data.should_pause) setIsPaused(true);
        } catch { /* ignore */ }
        lastResponseRef.current = Date.now();
      }
    }, 5_000);

    return () => clearInterval(noResponseTimer.current);
  }, [sessionId, noResponseTimeout, isPaused]);

  const resume = useCallback(async () => {
    try {
      const { data } = await api.post("/api/v1/attention/resume", { session_id: sessionId });
      setWarningLevel(data.warning_level);
      setIsPaused(false);
      setMessage(null);
    } catch { /* ignore */ }
  }, [sessionId]);

  return { warningLevel, isPaused, message, setProgress, resume };
}
