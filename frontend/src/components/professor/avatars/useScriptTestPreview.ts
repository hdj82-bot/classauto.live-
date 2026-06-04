"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAvatarPreview,
  startAvatarPreview,
  type AvatarPreview,
  type AvatarPreviewStatus,
} from "./avatarsApi";

/**
 * 아바타 페이지 "스크립트 테스트" 렌더 상태 훅.
 *
 * 본인(사진) 아바타 Talking Photo 로, 임의 대본(text)을 선택 음성으로 말하는 짧은
 * 영상을 HeyGen 으로 1회 렌더한다(`POST /api/avatars/me/preview`). 백엔드가 (음성·
 * 대본) 조합으로 캐시하므로 같은 조합은 재생성 없이 즉시 돌아온다(비용 0). 렌더는
 * 항상 사용자 명시 액션(`generate`)으로만 시작하고, 진행 중이면 4초 주기로 폴링한다.
 *
 * `enabled` 가 false(본인 아바타·음성 미선택)면 아무 것도 하지 않는다.
 */

const POLL_INTERVAL_MS = 4000;

export interface ScriptTestPreviewState {
  status: AvatarPreviewStatus;
  videoUrl: string | null;
  voiceId: string | null;
  message: string | null;
  /** voiceId 음성으로 text 대본을 렌더(또는 캐시 반환). force=true 면 재생성. */
  generate: (voiceId?: string | null, text?: string | null, force?: boolean) => void;
}

export function useScriptTestPreview(enabled: boolean): ScriptTestPreviewState {
  const [status, setStatus] = useState<AvatarPreviewStatus>("not_started");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const apply = useCallback((r: AvatarPreview) => {
    setStatus(r.status);
    setVideoUrl(r.video_url ?? null);
    setVoiceId(r.voice_id ?? null);
    setMessage(r.message ?? null);
  }, []);

  const startPolling = useCallback(() => {
    clearPoll();
    pollRef.current = setInterval(async () => {
      const r = await getAvatarPreview();
      apply(r);
      if (r.status === "ready" || r.status === "failed") clearPoll();
    }, POLL_INTERVAL_MS);
  }, [apply, clearPoll]);

  // 비활성화 시 상태 초기화(렌더는 시작하지 않는다 — 캐시 조회도 명시 액션 전까지 안 함).
  // 리셋은 비동기 IIFE 안에서 수행해 effect 본문의 동기 setState 를 피한다
  // (onboarding/usePhotoAvatarPreview 와 동일 패턴).
  useEffect(() => {
    clearPoll();
    let cancelled = false;
    (async () => {
      if (!enabled && !cancelled) {
        setStatus("not_started");
        setVideoUrl(null);
        setVoiceId(null);
        setMessage(null);
      }
    })();
    return () => {
      cancelled = true;
      clearPoll();
    };
  }, [enabled, clearPoll]);

  const generate = useCallback(
    (vId?: string | null, text?: string | null, force = false) => {
      setStatus("processing");
      setMessage(null);
      (async () => {
        const r = await startAvatarPreview(vId, force, text);
        apply(r);
        if (r.status === "processing") startPolling();
      })();
    },
    [apply, startPolling],
  );

  return { status, videoUrl, voiceId, message, generate };
}
