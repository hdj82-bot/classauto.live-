"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAvatarPreview,
  startAvatarPreview,
  type AvatarPreview,
  type AvatarPreviewStatus,
} from "./avatarsApi";

/**
 * 본인(사진) 아바타의 "움직이는 미리보기" 상태를 관리하는 훅.
 *
 * Talking Photo 는 정지 사진이라 아이들 영상이 없다. 백엔드가 HeyGen 으로 짧은
 * 샘플을 1회 렌더해 캐시하므로, 이 훅은 캐시 확인 → 생성 시작 → 완료까지 폴링을
 * 담당한다. ``enabled`` 가 false(본인 아바타 미선택)면 아무 것도 하지 않는다.
 *
 * 비용: 생성은 HeyGen 렌더 1회를 소모하므로 항상 사용자 명시 액션(generate)으로만
 * 시작한다. 활성화 시점에는 이미 만들어진 캐시가 있는지만 조회한다.
 */

const POLL_INTERVAL_MS = 4000;

export interface CustomAvatarPreviewState {
  status: AvatarPreviewStatus;
  videoUrl: string | null;
  voiceId: string | null;
  message: string | null;
  /**
   * voiceId 음성으로 렌더 시작(또는 캐시 반환). force=true 면 재생성.
   * text 를 주면 아바타가 그 대본을 말한다(빌더 스크립트 테스트).
   */
  generate: (voiceId?: string | null, force?: boolean, text?: string | null) => void;
}

export function useCustomAvatarPreview(
  enabled: boolean,
): CustomAvatarPreviewState {
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

  // 활성화/비활성화 시: 캐시 상태만 조회(생성은 하지 않음).
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
      const r = await getAvatarPreview();
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
    (vId?: string | null, force = false, text?: string | null) => {
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
