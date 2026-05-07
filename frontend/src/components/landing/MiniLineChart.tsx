"use client";

import { useEffect, useRef, useState } from "react";
import { useLandingI18n } from "./useLandingI18n";

interface MiniLineChartProps {
  // 0~100 비율 데이터 두 시리즈 (주차별).
  completion: readonly number[];
  participation: readonly number[];
  // 테스트 시 즉시 표시 강제.
  immediate?: boolean;
}

/**
 * 시청 완료율 / Q&A 참여 추이 미니 차트 — animations.md §2.4.
 *
 * - 라인은 stroke-dasharray + dashoffset 으로 진입 시 draw 애니메이션 (2s).
 * - 데이터 포인트는 stagger 로 등장 (0.1s 간격).
 * - 호버 시 점이 강조 + 값 툴팁.
 * - SVG 직접 — dependency 0.
 *
 * `prefers-reduced-motion` 시 즉시 완성 상태 표시.
 */
export default function MiniLineChart({
  completion,
  participation,
  immediate = false,
}: MiniLineChartProps) {
  const { t } = useLandingI18n();
  const ref = useRef<SVGSVGElement | null>(null);
  const [drawn, setDrawn] = useState(immediate);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (immediate || drawn) return;
    if (typeof window === "undefined") return;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const node = ref.current;
    const hasObserver = typeof IntersectionObserver !== "undefined";

    // react-hooks/set-state-in-effect 룰 회피 — rAF 비동기화 fallback.
    if (reduced || !node || !hasObserver) {
      const handle = requestAnimationFrame(() => setDrawn(true));
      return () => cancelAnimationFrame(handle);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setDrawn(true);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [immediate, drawn]);

  // 정규화: 데이터 길이를 chart width 에 매핑
  const W = 480;
  const H = 180;
  const padX = 32;
  const padY = 20;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  const len = Math.max(completion.length, participation.length);
  const xAt = (i: number) => padX + (innerW * i) / Math.max(1, len - 1);
  const yAt = (v: number) => padY + innerH * (1 - Math.min(100, Math.max(0, v)) / 100);

  const polyline = (data: readonly number[]) =>
    data.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");

  // 라인 길이 추정 (animation 의 stroke-dasharray 에 사용). 실제 path
  // length 는 ref 로 측정해야 정확하지만, 시각 효과상 충분히 큰 값으로 통일.
  const DASH = 1000;

  return (
    <figure
      className="mini-chart bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm"
      role="img"
      aria-label={t("a11y.chartDescription")}
    >
      <style>{`
        .mini-chart .chart-line {
          stroke-dasharray: ${DASH};
          stroke-dashoffset: ${DASH};
          transition: stroke-dashoffset 2s ease-out;
        }
        .mini-chart .chart-line.drawn {
          stroke-dashoffset: 0;
        }
        .mini-chart .chart-dot {
          opacity: 0;
          transition: opacity 300ms ease-out;
        }
        .mini-chart .chart-dot.drawn {
          opacity: 1;
        }
        @media (prefers-reduced-motion: reduce) {
          .mini-chart .chart-line,
          .mini-chart .chart-dot {
            transition: none;
          }
        }
      `}</style>

      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="presentation"
        aria-hidden="true"
      >
        {/* y 축 가이드 (25/50/75/100) */}
        {[0, 25, 50, 75, 100].map((g) => (
          <line
            key={g}
            x1={padX}
            y1={yAt(g)}
            x2={W - padX}
            y2={yAt(g)}
            stroke="rgba(10,10,10,0.06)"
            strokeWidth="1"
          />
        ))}

        {/* completion line */}
        <polyline
          className={`chart-line ${drawn ? "drawn" : ""}`}
          points={polyline(completion)}
          stroke="url(#grad-electric)"
          strokeWidth="2.5"
          fill="none"
        />
        {/* participation line */}
        <polyline
          className={`chart-line ${drawn ? "drawn" : ""}`}
          points={polyline(participation)}
          stroke="url(#grad-cyan)"
          strokeWidth="2.5"
          fill="none"
          style={{ transitionDelay: "300ms" }}
        />

        {/* completion 데이터 점 */}
        {completion.map((v, i) => (
          <circle
            key={`c-${i}`}
            className={`chart-dot ${drawn ? "drawn" : ""}`}
            cx={xAt(i)}
            cy={yAt(v)}
            r={hover === i ? 5 : 3.5}
            fill="#FFB627"
            style={{ transitionDelay: `${800 + i * 80}ms` }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {/* participation 데이터 점 */}
        {participation.map((v, i) => (
          <circle
            key={`p-${i}`}
            className={`chart-dot ${drawn ? "drawn" : ""}`}
            cx={xAt(i)}
            cy={yAt(v)}
            r={3.5}
            fill="#22D3EE"
            style={{ transitionDelay: `${1100 + i * 80}ms` }}
          />
        ))}

        {/* 호버 툴팁 */}
        {hover !== null && completion[hover] != null && (
          <g>
            <rect
              x={xAt(hover) + 8}
              y={yAt(completion[hover]) - 26}
              rx={4}
              ry={4}
              width={64}
              height={20}
              fill="#0A0A0A"
            />
            <text
              x={xAt(hover) + 40}
              y={yAt(completion[hover]) - 12}
              textAnchor="middle"
              className="text-[10px] fill-white tabular-nums"
              style={{ fontFamily: "'Pretendard Variable', sans-serif" }}
            >
              {t("adoption.chart.weekLabel", { n: hover + 1 })} · {completion[hover]}%
            </text>
          </g>
        )}
      </svg>

      {/* 범례 */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="w-3 h-3 rounded-full"
            style={{ background: "linear-gradient(135deg,#FFB627,#F59E0B)" }}
          />
          {t("adoption.chart.completionLabel")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="w-3 h-3 rounded-full"
            style={{ background: "linear-gradient(135deg,#22D3EE,#0EA5E9)" }}
          />
          {t("adoption.chart.participationLabel")}
        </span>
      </div>
    </figure>
  );
}
