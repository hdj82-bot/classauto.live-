"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

/**
 * 진입 시 1회 카운트업 — animations.md §2.2 / §4.1 의 `animateCount` 포팅.
 *
 * - rAF + ease-out cubic. 기본 1500ms.
 * - **`prefers-reduced-motion: reduce`** 사용자에게는 즉시 target 표시
 *   (animations.md §7 의무 정책).
 * - IntersectionObserver 로 화면 진입 시 1회만 실행 (animations.md §8.3
 *   "화면 밖 요소는 멈춤" 권고 — 진입 1회만 트리거하는 형태로 적용).
 * - `target` 변동 시 새 값으로 부드럽게 이행 (애니메이션 재실행).
 *
 * 반환:
 *   { value, ref }
 *   - `ref` 를 카운트업 표시 element 에 부착(IntersectionObserver 대상).
 *   - `value` 를 그대로 렌더링 (소수점은 호출자가 toFixed/format).
 */
export function useCountUp(
  target: number,
  options?: {
    durationMs?: number;
    /** 정수만 표시하고 싶을 때 false. 기본 true 는 입력값을 그대로 lerp */
    decimals?: number;
    /** 비활성 — IntersectionObserver 우회. 테스트나 항시 표시용 */
    immediate?: boolean;
  },
) {
  const durationMs = options?.durationMs ?? 1500;
  const decimals = options?.decimals;
  const immediate = options?.immediate ?? false;

  // target 자체가 NaN/Infinity 일 때는 0 으로 정상화하여 effect 안에서
  // 추가 setState 호출을 회피한다 (react-hooks/set-state-in-effect 룰).
  const safeTarget =
    Number.isFinite(target) && !Number.isNaN(target) ? target : 0;

  const [value, setValue] = useState<number>(immediate ? safeTarget : 0);
  const ref = useRef<HTMLElement | null>(null);
  const startedRef = useRef(false);
  // R5: useSyncExternalStore helper 통일. 사용자가 OS 설정을 토글하면 즉시
  // 카운트업 동작이 바뀐다 (이전에는 mount 시점 한 번만 evaluate).
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    // SSR / non-browser — effect 자체가 client 에서만 실행되므로 보통 도달 X.
    // 도달 시 rAF 로 비동기화하여 set-state-in-effect 룰을 회피.
    if (typeof window === "undefined") {
      const handle = requestAnimationFrame(() => setValue(safeTarget));
      return () => cancelAnimationFrame(handle);
    }

    const run = (): (() => void) | void => {
      if (reduceMotion) {
        const h = requestAnimationFrame(() => setValue(safeTarget));
        return () => cancelAnimationFrame(h);
      }
      const start = 0;
      const t0 = performance.now();
      let cancelled = false;
      let rafHandle = 0;

      const step = (now: number) => {
        if (cancelled) return;
        const elapsed = now - t0;
        const p = Math.min(elapsed / durationMs, 1);
        const easeOut = 1 - Math.pow(1 - p, 3);
        const current = start + (safeTarget - start) * easeOut;
        setValue(
          decimals !== undefined
            ? Number(current.toFixed(decimals))
            : Math.floor(current),
        );
        if (p < 1) rafHandle = requestAnimationFrame(step);
        else setValue(safeTarget);
      };
      rafHandle = requestAnimationFrame(step);
      return () => {
        cancelled = true;
        cancelAnimationFrame(rafHandle);
      };
    };

    if (immediate || startedRef.current) {
      // 두 번째 이상의 target 변경 — 즉시 시작
      return run();
    }

    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      startedRef.current = true;
      return run();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !startedRef.current) {
            startedRef.current = true;
            run();
            observer.disconnect();
          }
        });
      },
      { threshold: 0.1 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [safeTarget, durationMs, decimals, immediate, reduceMotion]);

  return { value, ref };
}
