"use client";

import { useId, useMemo, useState } from "react";
import { HUB_PALETTE } from "./palette";
import { useDashboardHubI18n } from "./useDashboardHubI18n";
import type { MainChartLectureSeries } from "./types";

/**
 * 강의별 시청 추이 메인 차트 — animations.md §4.2.
 *
 * - 주차별 완료율을 라인 + gradient fill 영역으로 그린다.
 * - 강의 토글 (3~5개) — 디자인 §4.3 의 "강의 3~5개 토글".
 * - hover 시 데이터 포인트 글로우 + 툴팁(슬라이드인). 빈 데이터 fallback
 *   카드 골격 유지.
 * - 색약자 친화: 강의 토글 버튼은 컬러 + 글리프(●○) 이중 부호화.
 *
 * `prefers-reduced-motion`: stroke draw-line 애니메이션을 `motion-safe:`
 *   modifier 로 보호 (animations.md §7).
 */
interface MainChartProps {
  series: MainChartLectureSeries[];
}

const W = 720;
const H = 260;
const PAD_X = 36;
const PAD_Y = 24;

export default function MainChart({ series }: MainChartProps) {
  const { t } = useDashboardHubI18n();
  const idBase = useId().replace(/:/g, "-");

  const visible = useMemo(() => series.slice(0, 5), [series]);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(visible.map((s, i) => [s.lectureId, i < 3])),
  );
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const allValues = visible.flatMap((s) =>
    s.weeklyCompletion.filter((v): v is number => v !== null),
  );
  const hasData = allValues.length > 0;

  if (!hasData) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 px-6 py-12 text-center">
        <p className="text-sm font-medium text-gray-700">
          {t("mainChart.empty")}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {t("mainChart.emptyDesc")}
        </p>
      </div>
    );
  }

  const maxBuckets = Math.max(
    ...visible.map((s) => s.weeklyCompletion.length),
    1,
  );
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  const stepX = maxBuckets > 1 ? innerW / (maxBuckets - 1) : innerW;
  const yMax = Math.max(100, ...allValues);
  const yMin = 0;
  const yToPx = (v: number) =>
    PAD_Y + (1 - (v - yMin) / (yMax - yMin || 1)) * innerH;

  // 시리즈별 path 빌드
  const built = visible.map((s, idx) => {
    const points = s.weeklyCompletion;
    const lineParts: string[] = [];
    const fillParts: string[] = [];
    let started = false;
    // TS 5 의 closure CFA 가 outer `let` 의 narrowed 타입을 `null` 로 굳혀
    // 이후 `!== null` narrowing 결과가 `never` 가 되는 회귀를 우회하기 위해
    // 좌/우 끝 x 좌표를 배열로 누적 후 끝에서 한 번에 꺼낸다 (기능 동치).
    const xCoords: number[] = [];
    const validIdx: number[] = [];
    points.forEach((p, i) => {
      if (p === null || !Number.isFinite(p)) {
        started = false;
        return;
      }
      const x = PAD_X + i * stepX;
      const y = yToPx(p);
      lineParts.push(`${started ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`);
      fillParts.push(`${started ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`);
      xCoords.push(x);
      validIdx.push(i);
      started = true;
    });
    if (xCoords.length > 0) {
      const startX = xCoords[0];
      const endX = xCoords[xCoords.length - 1];
      const baseline = PAD_Y + innerH;
      fillParts.push(`L ${endX.toFixed(1)} ${baseline}`);
      fillParts.push(`L ${startX.toFixed(1)} ${baseline}`);
      fillParts.push("Z");
    }
    const seriesColor = palettePick(idx);
    return {
      lectureId: s.lectureId,
      title: s.title,
      idx,
      color: seriesColor,
      lineD: lineParts.join(" "),
      fillD: fillParts.join(" "),
      points,
      validIdx,
    };
  });

  return (
    <section
      aria-labelledby={`${idBase}-title`}
      className="rounded-2xl border border-gray-200 bg-white p-6"
    >
      <header className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3
            id={`${idBase}-title`}
            className="text-base font-semibold text-gray-900"
          >
            {t("mainChart.title")}
          </h3>
          <p className="text-xs text-gray-500">
            {t("mainChart.subtitle", { count: visible.length })}
          </p>
        </div>
        {/* 강의 토글 */}
        <ul
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={t("mainChart.title")}
        >
          {built.map((b) => {
            const on = enabled[b.lectureId] !== false;
            return (
              <li key={b.lectureId}>
                <button
                  type="button"
                  onClick={() =>
                    setEnabled((prev) => ({
                      ...prev,
                      [b.lectureId]: !on,
                    }))
                  }
                  aria-pressed={on}
                  className={[
                    "inline-flex max-w-[160px] items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-[11px] font-medium",
                    "border motion-safe:transition",
                    on
                      ? "border-gray-300 bg-white text-gray-900"
                      : "border-gray-200 bg-gray-50 text-gray-400 line-through",
                  ].join(" ")}
                  title={b.title}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2 flex-none rounded-full"
                    style={{ background: on ? b.color : HUB_PALETTE.neutral }}
                  />
                  <span aria-hidden="true" className="text-[10px]">
                    {on ? "●" : "○"}
                  </span>
                  <span className="truncate">{b.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </header>

      <div className="overflow-x-auto -mx-2 px-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="xMinYMid meet"
          role="img"
          aria-label={t("mainChart.title")}
          style={{ maxWidth: W * 1.4 }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            {built.map((b) => (
              <linearGradient
                key={b.lectureId}
                id={`${idBase}-fill-${b.idx}`}
                x1="0"
                x2="0"
                y1="0"
                y2="1"
              >
                <stop offset="0%" stopColor={b.color} stopOpacity="0.30" />
                <stop offset="100%" stopColor={b.color} stopOpacity="0.0" />
              </linearGradient>
            ))}
          </defs>

          {/* y 그리드 + 라벨 */}
          {[0, 25, 50, 75, 100].map((y) => (
            <g key={y}>
              <line
                x1={PAD_X}
                x2={PAD_X + innerW}
                y1={yToPx(y)}
                y2={yToPx(y)}
                stroke={HUB_PALETTE.border}
                strokeDasharray={y === 0 ? undefined : "2 4"}
              />
              <text
                x={PAD_X - 6}
                y={yToPx(y) + 3}
                textAnchor="end"
                fontSize={10}
                fill={HUB_PALETTE.textMuted}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {y}
              </text>
            </g>
          ))}

          {/* x 라벨 (주차) */}
          {Array.from({ length: maxBuckets }).map((_, i) => (
            <text
              key={i}
              x={PAD_X + i * stepX}
              y={H - 6}
              textAnchor="middle"
              fontSize={10}
              fill={HUB_PALETTE.textMuted}
            >
              W{i + 1}
            </text>
          ))}

          {/* hover guide */}
          {hoverIdx !== null && (
            <line
              x1={PAD_X + hoverIdx * stepX}
              x2={PAD_X + hoverIdx * stepX}
              y1={PAD_Y}
              y2={PAD_Y + innerH}
              stroke={HUB_PALETTE.gold}
              strokeOpacity="0.35"
              strokeDasharray="2 3"
            />
          )}

          {/* hover hit area (각 주차 컬럼) */}
          {Array.from({ length: maxBuckets }).map((_, i) => (
            <rect
              key={i}
              x={PAD_X + (i - 0.5) * stepX}
              y={PAD_Y}
              width={stepX}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
            />
          ))}

          {/* 시리즈 (영역 + 라인 + 점) */}
          {built.map((b) => {
            if (enabled[b.lectureId] === false) return null;
            return (
              <g key={b.lectureId}>
                <path
                  d={b.fillD}
                  fill={`url(#${idBase}-fill-${b.idx})`}
                  className="motion-safe:animate-fade-in"
                />
                <path
                  d={b.lineD}
                  fill="none"
                  stroke={b.color}
                  strokeWidth={hoverIdx !== null ? 2.5 : 2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {b.validIdx.map((vi) => {
                  const pt = b.points[vi];
                  if (pt === null) return null;
                  const x = PAD_X + vi * stepX;
                  const y = yToPx(pt);
                  return (
                    <circle
                      key={vi}
                      cx={x}
                      cy={y}
                      r={hoverIdx === vi ? 4.5 : 2.5}
                      fill={HUB_PALETTE.bgCard}
                      stroke={b.color}
                      strokeWidth={2}
                    >
                      <title>
                        {t("mainChart.tooltip", {
                          label: `${b.title} W${vi + 1}`,
                          value: pt.toFixed(1),
                        })}
                      </title>
                    </circle>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

/** 5색 팔레트 — 색약자 친화: 청록·골드·핑크·보라·녹색 (대비 충분). */
function palettePick(idx: number): string {
  const colors = [
    HUB_PALETTE.gold,
    "#22D3EE", // cyan
    "#A78BFA", // violet
    "#F472B6", // pink
    HUB_PALETTE.success, // green
  ];
  return colors[idx % colors.length];
}
