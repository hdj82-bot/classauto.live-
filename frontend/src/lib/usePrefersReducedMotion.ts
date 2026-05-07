"use client";

import { useSyncExternalStore } from "react";

/**
 * `prefers-reduced-motion: reduce` 사용자 여부 — `useSyncExternalStore`
 * 기반 React 19 권장 패턴.
 *
 * 장점 (effect + matchMedia + state 패턴 대비):
 *   - effect body 안 sync setState 가 없어 `react-hooks/set-state-in-effect`
 *     룰 위반 0
 *   - 사용자가 OS 설정을 페이지 머무는 중 토글하면 즉시 반영 (런타임 반응)
 *   - SSR snapshot 분리로 hydration mismatch 위험 0 (서버는 항상 false)
 *
 * 원본 패턴은 R4W2 의 `ProgressShimmer.tsx` 가 inline 구현. 본 helper 는
 * 그것을 모든 motion-aware 컴포넌트에서 재사용 가능하도록 단일 진실로 분리한
 * 결과물 — R5 코드 정리 PR 의 chunk B.
 *
 * 호출:
 *   const reduced = usePrefersReducedMotion();
 *   if (reduced) return <StaticVariant />;
 */

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener?.("change", callback);
  return () => mq.removeEventListener?.("change", callback);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
