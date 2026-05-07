"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface FadeInSectionProps {
  children: ReactNode;
  // 자식 stagger delay (ms). FadeInSection 안에서 여러 형제를 staggering 하고
  // 싶을 때 호출자가 각자 wrap 후 다른 delayMs 를 주면 된다.
  delayMs?: number;
  // 시각 영역 비율. 0.1 이면 10% 보일 때 트리거.
  threshold?: number;
  // 테스트 시 즉시 visible 강제.
  immediate?: boolean;
  // wrapper element.
  as?: "div" | "section" | "article";
  className?: string;
}

/**
 * 스크롤 트리거 페이드인 — animations.md §2.6.
 *
 * IntersectionObserver 기반. 한 번 visible 되면 unobserve (재진입 시 다시
 * 동작하지 않음 — 자연스러움 우선).
 *
 * `prefers-reduced-motion: reduce` 시 transition 자동 비활성 — 즉시 visible
 * 처리하여 콘텐츠가 빈 공간으로 사라지지 않게.
 */
export default function FadeInSection({
  children,
  delayMs = 0,
  threshold = 0.1,
  immediate = false,
  as = "div",
  className,
}: FadeInSectionProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(immediate);

  useEffect(() => {
    if (immediate) return;
    if (typeof window === "undefined") return;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const node = ref.current;
    const hasObserver = typeof IntersectionObserver !== "undefined";

    // react-hooks/set-state-in-effect 룰 회피: effect body 에서 동기 setState
    // 호출 X. reduced motion / Observer 미지원 fallback 도 rAF 비동기화.
    if (reduced || !node || !hasObserver) {
      const handle = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(handle);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, immediate]);

  const Tag = as;
  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      data-visible={visible ? "true" : "false"}
      className={
        (className ? className + " " : "") +
        "transition-[opacity,transform] duration-700 ease-out " +
        (visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-6 motion-reduce:opacity-100 motion-reduce:translate-y-0")
      }
      style={delayMs > 0 ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
