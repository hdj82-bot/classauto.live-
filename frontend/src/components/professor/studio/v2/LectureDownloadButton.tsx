"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { api } from "@/lib/api";

interface DownloadStatus {
  status: "none" | "building" | "ready" | "failed";
  url: string | null;
}

/**
 * 강의 본문 mp4 다운로드 버튼 (on-demand 합성).
 *
 * 본문은 슬라이드쇼로 재생하므로 평소 mp4 가 없다. 누르면 서버가 슬라이드 이미지 +
 * 구간 음성을 ffmpeg 로 합성(캐시)하고, 완료되면 브라우저 다운로드를 띄운다.
 * POST 로 요청 → 진행 중이면 GET 으로 폴링 → ready 면 presigned URL 로 내려받는다.
 */
export default function LectureDownloadButton({
  lectureId,
  title,
}: {
  lectureId: string;
  title?: string | null;
}) {
  const [state, setState] = useState<"idle" | "building" | "ready" | "failed">(
    "idle",
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPoll, [stopPoll]);

  const triggerDownload = useCallback(
    (url: string) => {
      const safe = (title || "lecture").replace(/[^\w가-힣 .-]/g, "").trim();
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safe || "lecture"}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    [title],
  );

  const poll = useCallback(() => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get<DownloadStatus>(
          `/api/lectures/${lectureId}/download`,
        );
        if (data.status === "ready" && data.url) {
          stopPoll();
          setState("ready");
          triggerDownload(data.url);
        } else if (data.status === "failed") {
          stopPoll();
          setState("failed");
        }
      } catch {
        /* 일시 오류 — 다음 폴링에서 재시도 */
      }
    }, 3000);
  }, [lectureId, stopPoll, triggerDownload]);

  const handleClick = useCallback(async () => {
    if (state === "building") return;
    setState("building");
    try {
      const { data } = await api.post<DownloadStatus>(
        `/api/lectures/${lectureId}/download`,
      );
      if (data.status === "ready" && data.url) {
        setState("ready");
        triggerDownload(data.url);
      } else {
        poll();
      }
    } catch {
      setState("failed");
    }
  }, [lectureId, state, poll, triggerDownload]);

  const label =
    state === "building"
      ? "MP4 만드는 중…"
      : state === "failed"
        ? "다시 시도"
        : state === "ready"
          ? "다시 다운로드"
          : "MP4 다운로드";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === "building"}
      style={{
        ...btnStyle,
        opacity: state === "building" ? 0.6 : 1,
        cursor: state === "building" ? "wait" : "pointer",
      }}
      data-testid="lecture-download-mp4"
    >
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3v12" />
        <path d="M7 10l5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
      {label}
    </button>
  );
}

const btnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontFamily: "inherit",
};
