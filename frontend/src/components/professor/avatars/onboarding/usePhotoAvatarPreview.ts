"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPhotoAvatarPreview,
  startPhotoAvatarPreview,
  type PhotoAvatarPreview,
  type PhotoAvatarPreviewStatus,
} from "./photoAvatarApi";

/**
 * ⑤ 움직이는 미리보기 상태 훅 — 기존 `useCustomAvatarPreview` 와 같은 구조.
 *
 * 활성화(``enabled``, = preview 단계 진입) 시 캐시된 렌더가 있는지 조회만 하고,
 * 실제 렌더는 항상 사용자 명시 액션(``generate``)으로만 시작한다(HeyGen 렌더 1회
 * 비용). 진행 중이면 4초 주기로 폴링한다.
 */

const POLL_INTERVAL_MS = 4000;

export interface PhotoAvatarPreviewState {
  status: PhotoAvatarPreviewStatus;
  videoUrl: string | null;
  voiceId: string | null;
  message: string | null;
  deferred: boolean;
  /** voiceId 음성으로 렌더 시작(또는 캐시 반환). force=true 면 재생성. */
  generate: (voiceId?: string | null, force?: boolean) => void;
}

export function usePhotoAvatarPreview(
  enabled: boolean,
): PhotoAvatarPreviewState {
  const [status, setStatus] = useState<PhotoAvatarPreviewStatus>("not_started");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deferred, setDeferred] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const apply = useCallback((r: PhotoAvatarPreview) => {
    setStatus(r.status);
    setVideoUrl(r.videoUrl);
    setVoiceId(r.voiceId);
    setMessage(r.message);
    setDeferred(!!r.deferred);
  }, []);

  const startPolling = useCallback(() => {
    clearPoll();
    pollRef.current = setInterval(async () => {
      const r = await getPhotoAvatarPreview();
      apply(r);
      if (r.status === "ready" || r.status === "failed") clearPoll();
    }, POLL_INTERVAL_MS);
  }, [apply, clearPoll]);

  // 활성/비활성 시: 캐시 상태만 조회(생성은 안 함).
  useEffect(() => {
    clearPoll();
    let cancelled = false;
    (async () => {
      if (!enabled) {
        if (!cancelled) {
          setStatus("not_started");
          setVideoUrl(null);
          setVoiceId(null);
          setMessage(null);
        }
        return;
      }
      const r = await getPhotoAvatarPreview();
      if (cancelled) return;
      apply(r);
      if (r.status === "processing") startPolling();
    })();
    return () => {
      cancelled = true;
      clearPoll();
    };
  }, [enabled, apply, startPolling, clearPoll]);

  const generate = useCallback(
    (vId?: string | null, force = false) => {
      setStatus("processing");
      setMessage(null);
      (async () => {
        const r = await startPhotoAvatarPreview(vId, force);
        apply(r);
        if (r.status === "processing") startPolling();
      })();
    },
    [apply, startPolling],
  );

  return { status, videoUrl, voiceId, message, deferred, generate };
}
