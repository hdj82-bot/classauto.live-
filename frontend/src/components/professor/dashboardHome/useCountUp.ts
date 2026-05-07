"use client";

import { useEffect, useRef, useState } from "react";

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

  const [value, setValue] = useState<number>(immediate ? target : 0);
  const ref = useRef<HTMLElement | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (Number.isNaN(target) || !Number.isFinite(target)) {
      setValue(0);
      return;
    }

    // SSR / non-browser
    if (typeof window === "undefined") {
      setValue(target);
      return;
    }

    const reduceMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const run = () => {
      if (reduceMotion) {
        setValue(target);
        return;
      }
      const start = 0;
      const t0 = performance.now();
      let cancelled = false;

      const step = (now: number) => {
        if (cancelled) return;
        const elapsed = now - t0;
        const p = Math.min(elapsed / durationMs, 1);
        const easeOut = 1 - Math.pow(1 - p, 3);
        const current = start + (target - start) * easeOut;
        setValue(
          decimals !== undefined
            ? Number(current.toFixed(decimals))
            : Math.floor(current),
        );
        if (p < 1) requestAnimationFrame(step);
        else setValue(target);
      };
      requestAnimationFrame(step);
      return () => {
        cancelled = true;
      };
    };

    if (immediate || startedRef.current) {
      // 두 번째 이상의 target 변경 — 즉시 시작
      run();
      return;
    }

    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      startedRef.current = true;
      run();
      return;
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
  }, [target, durationMs, decimals, immediate]);

  return { value, ref };
}
