"use client";

import { useId, useState } from "react";
import { useCountUp } from "./useCountUp";
import { HUB_PALETTE } from "./palette";
import { useDashboardHubI18n } from "./useDashboardHubI18n";
import type { DonutSegments } from "./types";

/**
 * 학습자 진도 분포 도넛 차트 — animations.md §4.3.
 *
 * - stroke-dasharray 로 segment 진입 애니메이션 (drawn).
 * - 호버 segment 살짝 바깥으로 튀어나옴 + 중앙 숫자 카운트업.
 * - 색약자 친화: 색 + 글리프(✓ ⌛ ○) 이중 부호화 + 패턴 (사선 / 도트 / 무지).
 *
 * `prefers-reduced-motion`: dasharray transition 만 motion-safe 로 보호.
 */
interface DonutProps {
  data: DonutSegments;
}

const SIZE = 200;
const STROKE = 22;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

export default function Donut({ data }: DonutProps) {
  const { t } = useDashboardHubI18n();
  const idBase = useId().replace(/:/g, "-");
  const [hover, setHover] = useState<"completed" | "inProgress" | "notStarted" | null>(
    null,
  );
  const total = Math.max(data.total, 0);
  const center = useCountUp(total, { decimals: 0 });

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 px-6 py-10 text-center">
        <p className="text-sm font-medium text-gray-700">{t("donut.empty")}</p>
      </div>
    );
  }

  const completedPct = data.completed / total;
  const inProgressPct = data.inProgress / total;
  const notStartedPct = data.notStarted / total;

  // 누적 회전 — strokeDashoffset 로 segment 시작 위치를 잡는다.
  const segments = [
    {
      id: "completed" as const,
      value: data.completed,
      pct: completedPct,
      color: HUB_PALETTE.success,
      pattern: `${idBase}-pat-diag`,
      label: t("donut.completed"),
      glyph: "✓",
    },
    {
      id: "inProgress" as const,
      value: data.inProgress,
      pct: inProgressPct,
      color: HUB_PALETTE.gold,
      pattern: `${idBase}-pat-dots`,
      label: t("donut.inProgress"),
      glyph: "⌛",
    },
    {
      id: "notStarted" as const,
      value: data.notStarted,
      pct: notStartedPct,
      color: HUB_PALETTE.neutral,
      pattern: `${idBase}-pat-blank`,
      label: t("donut.notStarted"),
      glyph: "○",
    },
  ];

  let cumulative = 0;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div className="relative">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={t("donut.title")}
        >
          <defs>
            {/* 사선 패턴 (completed) */}
            <pattern
              id={`${idBase}-pat-diag`}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
            >
              <rect width="6" height="6" fill={HUB_PALETTE.success} />
              <path d="M0 6L6 0" stroke="rgba(6,78,59,0.45)" strokeWidth="0.8" />
            </pattern>
            {/* 도트 패턴 (inProgress) */}
            <pattern
              id={`${idBase}-pat-dots`}
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
            >
              <rect width="5" height="5" fill={HUB_PALETTE.gold} />
              <circle cx="2.5" cy="2.5" r="0.7" fill="rgba(120,53,15,0.55)" />
            </pattern>
            {/* 무지 (notStarted) */}
            <pattern
              id={`${idBase}-pat-blank`}
              width="4"
              height="4"
              patternUnits="userSpaceOnUse"
            >
              <rect width="4" height="4" fill={HUB_PALETTE.neutral} />
            </pattern>
          </defs>

          <g transform={`translate(${SIZE / 2} ${SIZE / 2}) rotate(-90)`}>
            {segments.map((seg) => {
              if (seg.value <= 0) return null;
              const segLen = C * seg.pct;
              const dashArray = `${segLen} ${C - segLen}`;
              const offset = -C * cumulative;
              cumulative += seg.pct;
              const isHover = hover === seg.id;
              return (
                <circle
                  key={seg.id}
                  r={R}
                  cx={0}
                  cy={0}
                  fill="none"
                  stroke={`url(#${seg.pattern})`}
                  strokeWidth={isHover ? STROKE + 4 : STROKE}
                  strokeDasharray={dashArray}
                  strokeDashoffset={offset}
                  strokeLinecap="butt"
                  className="motion-safe:transition-[stroke-width,stroke-dasharray] motion-safe:duration-500"
                  onMouseEnter={() => setHover(seg.id)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: "pointer" }}
                >
                  <title>
                    {t("donut.ariaSegment", {
                      label: seg.label,
                      count: seg.value,
                      pct: Math.round(seg.pct * 100),
                    })}
                  </title>
                </circle>
              );
            })}
          </g>

          {/* 중앙 숫자 — 카운트업 */}
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="22"
            fontWeight={600}
            fill={HUB_PALETTE.text}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {center.value}
          </text>
        </svg>
      </div>

      {/* 범례 */}
      <ul className="flex flex-1 flex-col gap-2 text-sm">
        {segments.map((seg) => {
          const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
          const active = hover === null || hover === seg.id;
          return (
            <li
              key={seg.id}
              onMouseEnter={() => setHover(seg.id)}
              onMouseLeave={() => setHover(null)}
              className={`flex items-center justify-between rounded-xl border px-3 py-2 motion-safe:transition ${
                active ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50/60"
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="text-base leading-none"
                  style={{ color: seg.color }}
                >
                  {seg.glyph}
                </span>
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ background: seg.color }}
                />
                <span className="text-gray-800">{seg.label}</span>
              </span>
              <span className="tabular-nums text-gray-700">
                {seg.value}{" "}
                <span className="text-xs text-gray-400">({pct}%)</span>
              </span>
            </li>
          );
        })}
        <li className="mt-1 text-center text-xs text-gray-500">
          {t("donut.centerLabel", { count: total })}
        </li>
      </ul>
    </div>
  );
}
