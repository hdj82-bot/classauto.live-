"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

interface StatCounterProps {
  target: number;
  // 표시 단위 (예: "+", "h", "%"). target 뒤에 붙는다.
  suffix?: string;
  label: string;
  // ms — animations.md §2.2 의 1500ms 기본
  durationMs?: number;
  // 천 단위 구분 (12,000) on/off
  groupDigits?: boolean;
  // 테스트 시 즉시 표시 강제 (IntersectionObserver mock 회피용)
  immediate?: boolean;
}

/**
 * 정수에 천 단위 구분(쉼표)을 넣는다 — locale 무관 결정적 포매터.
 *
 * `Number.prototype.toLocaleString()` 은 런타임의 기본 locale·ICU 데이터에
 * 의존한다. 서버(Node)와 브라우저의 기본 locale 이 다르면 `12,000` / `12.000`
 * / `12 000` 으로 갈려 React #418 (hydration text mismatch) 의 잠재 원인이
 * 된다. 디자인 스펙(천 단위 = `12,000`, 쉼표)은 고정이므로 locale 분기 없이
 * 직접 그룹핑하여 SSR === client 출력을 보장한다.
 */
function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * 카운트업 카운터 — docs/design-system/animations.md §2.2.
 *
 * IntersectionObserver 로 진입 시 1회만 실행. easeOutCubic 적용.
 * `prefers-reduced-motion` 일 때는 즉시 target 표시 (불연속 X — 그냥 스킵).
 *
 * 숫자는 Pretendard tabular-nums (typography.md §1) 로 칼럼 정렬.
 *
 * Hydration 안전성:
 *   - 초기 표시값은 `immediate ? target : 0` — prop 으로만 결정되므로 SSR 과
 *     client 첫 렌더가 동일. 카운트업은 client 전용 effect(IntersectionObserver
 *     /rAF) 안에서만 진행되어 hydration 시점엔 양쪽 모두 동일 값.
 *   - 표시 문자열은 `groupThousands`(locale 무관)로 생성 — toLocaleString 의
 *     서버/클라이언트 locale 차이로 인한 #418 제거.
 */
export default function StatCounter({
  target,
  suffix = "",
  label,
  durationMs = 1500,
  groupDigits = true,
  immediate = false,
}: StatCounterProps) {
  const [value, setValue] = useState(immediate ? target : 0);
  const ref = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(immediate);
  // R5: useSyncExternalStore helper 로 통일 (FadeInSection 등과 동일 패턴).
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (immediate) return;
    if (typeof window === "undefined") return;
    const node = ref.current;
    if (!node) return;

    const hasObserver = typeof IntersectionObserver !== "undefined";

    // react-hooks/set-state-in-effect 룰 회피: effect body 에서 동기 setState
    // 호출하지 않고, IntersectionObserver callback / rAF / 비동기 timer 등
    // "외부 신호" 안에서만 setState. reduced motion 또는 Observer 미지원
    // 환경의 즉시 fallback 도 rAF 한 번 거쳐 비동기화.
    if (reduced || !hasObserver) {
      const handle = requestAnimationFrame(() => {
        if (!startedRef.current) {
          startedRef.current = true;
          setValue(target);
        }
      });
      return () => cancelAnimationFrame(handle);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !startedRef.current) {
            startedRef.current = true;
            const startTs = performance.now();
            const tick = (now: number) => {
              const elapsed = now - startTs;
              const progress = Math.min(elapsed / durationMs, 1);
              const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
              setValue(Math.floor(target * eased));
              if (progress < 1) requestAnimationFrame(tick);
              else setValue(target);
            };
            requestAnimationFrame(tick);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [target, durationMs, immediate, reduced]);

  const display = groupDigits ? groupThousands(value) : String(value);

  return (
    <div ref={ref} className="text-center">
      <div
        className="text-3xl sm:text-4xl font-extrabold text-gray-900 tabular-nums"
        style={{
          fontFamily: "'Paperlogy', 'Pretendard Variable', sans-serif",
          fontVariantNumeric: "tabular-nums",
        }}
        aria-live="polite"
      >
        {display}
        {suffix && <span className="text-indigo-600">{suffix}</span>}
      </div>
      <p className="mt-2 text-sm text-gray-500">{label}</p>
    </div>
  );
}
