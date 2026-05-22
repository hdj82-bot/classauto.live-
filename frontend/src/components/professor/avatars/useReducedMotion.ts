"use client";

import { useSyncExternalStore } from "react";

/**
 * `prefers-reduced-motion: reduce` 미디어쿼리를 구독하는 훅.
 *
 * 영상 자동재생/hover 재생은 JS 로 제어하므로 globals.css 의 전역
 * reduce-motion 규칙(animation/transition duration 만 줄임) 으로는 막을 수
 * 없다. SSR 스냅샷은 false(모션 허용) 로 고정해 hydration 불일치를 피하고,
 * 마운트 후 실제 사용자 설정을 반영한다 (localStorage 미사용 — matchMedia).
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
