"use client";

import { useEffect } from "react";
import { useA11y } from "./A11yContext";

interface Options {
  /** Disable shortcuts entirely (e.g. while a modal is open at the host level). */
  enabled?: boolean;
  /** Called when ? key is pressed — host opens the shortcut modal. */
  onShowHelp?: () => void;
}

/**
 * 영상 시청 화면 단축키 핸들러.
 *
 * 정책 (`docs/planning/06-student-pages.md` §11.1) — Space / ←/→ / F / C / ?.
 * (J/L/K/M 은 1차 PR 범위 외 — YouTube 호환 옵션으로 후속 PR 예정.)
 *
 * 본 PR 의 lecture/[slug] 본문 무수정 제약을 만족시키기 위해, video element
 * 는 DOM 에서 직접 찾는다 (`document.getElementsByTagName('video')[0]`).
 * 향후 lecture page 가 video ref 를 export 하기 시작하면 그쪽을 우선 사용하면
 * 된다 — 본 훅은 fallback 으로 동작.
 */
export function useVideoShortcuts({ enabled = true, onShowHelp }: Options = {}) {
  const a11y = useA11y();

  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;

    const handler = (e: KeyboardEvent) => {
      // 입력 필드 포커스 중에는 단축키 차단 — Q&A 입력을 깨면 안 된다.
      const tgt = e.target as HTMLElement | null;
      const tag = tgt?.tagName?.toLowerCase();
      const editable =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        tgt?.isContentEditable === true;
      if (editable) return;

      // 수정자 키 조합은 페이지 단축키와 충돌 가능 → 무시.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const video = document.getElementsByTagName("video")[0] as
        | HTMLVideoElement
        | undefined;

      switch (e.key) {
        case " ":
        case "Spacebar": {
          if (!video) return;
          e.preventDefault();
          if (video.paused) video.play().catch(() => {});
          else video.pause();
          break;
        }
        case "ArrowLeft": {
          if (!video) return;
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          break;
        }
        case "ArrowRight": {
          if (!video) return;
          e.preventDefault();
          video.currentTime = Math.min(
            video.duration || video.currentTime + 10,
            video.currentTime + 10,
          );
          break;
        }
        case "f":
        case "F": {
          if (!video) return;
          e.preventDefault();
          if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
          } else {
            video.requestFullscreen?.().catch(() => {});
          }
          break;
        }
        case "c":
        case "C": {
          e.preventDefault();
          a11y.setCaptions(!a11y.captions);
          break;
        }
        case "?":
        case "/": {
          // ? 키는 Shift+/ 로도 입력될 수 있어 두 키 모두 매핑.
          if (e.key === "/" && !e.shiftKey) return;
          e.preventDefault();
          onShowHelp?.();
          break;
        }
        default:
          return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [enabled, onShowHelp, a11y]);
}
