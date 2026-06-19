"use client";

import { useMemo } from "react";
import { useAnalyticsI18n } from "./useAnalyticsI18n";
import EmptyState from "./EmptyState";
import { ANALYTICS_PALETTE } from "./svg";
import type { TrendData } from "./types";

/**
 * 성취율 추이 (스펙 11 §C) — 일자별 누적 지표 다지표 라인 차트.
 *
 * - 학습 완료율·출석 인정율·평균 정답률 3종을 0~100% 공통 축에 라인으로 겹쳐
 *   그린다. 차트 라이브러리 없이 SVG 직접 렌더(DEPS 도입 금지 정책, svg.tsx 참조).
 * - 색약자 친화: 각 라인은 색 + dash 패턴 이중 부호화.
 * - 우측 상단 타일에 최신 스냅샷의 누적 질문 수·학습자 수.
 * - 점이 2개 미만이면 "추이" 가 성립하지 않으므로 수집 중 EmptyState.
 *   (일배치가 하루 1행씩 쌓고 소급 수집 불가 — 09 §3.)
 *
 * `prefers-reduced-motion` 사용자에겐 모션 비활성( motion-safe: 만 사용 ).
 */
interface AchievementTrendProps {
  data: TrendData | null;
}

const SVG_W = 520;
const SVG_H = 200;
const PAD_X = 36;
const PAD_Y = 16;
const AXIS_H = 18;

type SeriesKey = "completionRate" | "attendanceRate" | "avgAccuracy";

export default function AchievementTrend({ data }: AchievementTrendProps) {
  const { t } = useAnalyticsI18n();
  const points = useMemo(() => data?.points ?? [], [data?.points]);

  const series: { key: SeriesKey; labelKey: string; color: string; dash?: string }[] =
    useMemo(
      () => [
        { key: "completionRate", labelKey: "trend.legendCompletion", color: ANALYTICS_PALETTE.gold },
        { key: "attendanceRate", labelKey: "trend.legendAttendance", color: ANALYTICS_PALETTE.info, dash: "5 4" },
        { key: "avgAccuracy", labelKey: "trend.legendAccuracy", color: ANALYTICS_PALETTE.success, dash: "1 4" },
      ],
      [],
    );

  if (points.length < 2) {
    return (
      <EmptyState title={t("trend.empty")} description={t("trend.emptyDesc")} />
    );
  }

  const innerW = SVG_W - PAD_X * 2;
  const innerH = SVG_H - PAD_Y * 2 - AXIS_H;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const latest = points[points.length - 1];

  const xAt = (i: number) => PAD_X + i * stepX;
  const yAt = (pct: number) =>
    PAD_Y + (1 - Math.max(0, Math.min(100, pct)) / 100) * innerH;

  const linePath = (key: SeriesKey) =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(Number(p[key] ?? 0))}`)
      .join(" ");

  // x축 라벨은 과밀 방지를 위해 최대 6개만(균등 샘플링 + 마지막 항상 포함).
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* 범례 */}
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 text-xs text-gray-600">
              <svg width={20} height={8} aria-hidden="true">
                <line
                  x1={0}
                  y1={4}
                  x2={20}
                  y2={4}
                  stroke={s.color}
                  strokeWidth={2.5}
                  strokeDasharray={s.dash}
                />
              </svg>
              {t(s.labelKey)}
            </li>
          ))}
        </ul>
        {/* 최신 스냅샷 카운트 타일 */}
        <div className="flex gap-2">
          <CountTile label={t("trend.latestQa")} value={latest.qaCount} />
          <CountTile label={t("trend.latestLearners")} value={latest.activeLearners} />
        </div>
      </div>

      <div className="overflow-x-auto -mx-2 px-2">
        <svg
          role="img"
          aria-label={t("section.trend")}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width="100%"
          height={SVG_H}
          preserveAspectRatio="xMinYMid meet"
          style={{ maxWidth: SVG_W * 1.4 }}
        >
          {/* 가로 그리드 + y축 % 라벨 */}
          {[0, 25, 50, 75, 100].map((g) => {
            const y = yAt(g);
            return (
              <g key={g}>
                <line
                  x1={PAD_X}
                  x2={PAD_X + innerW}
                  y1={y}
                  y2={y}
                  stroke={ANALYTICS_PALETTE.border}
                  strokeDasharray={g === 0 ? undefined : "2 4"}
                />
                <text
                  x={PAD_X - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize={9}
                  fill={ANALYTICS_PALETTE.textMuted}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {g}
                </text>
              </g>
            );
          })}

          {/* x축 날짜 라벨 */}
          {points.map((p, i) =>
            i % labelEvery === 0 || i === points.length - 1 ? (
              <text
                key={p.date}
                x={xAt(i)}
                y={PAD_Y + innerH + 14}
                textAnchor="middle"
                fontSize={9}
                fill={ANALYTICS_PALETTE.textMuted}
              >
                {p.date.slice(5)}
              </text>
            ) : null,
          )}

          {/* 라인 3종 */}
          {series.map((s) => (
            <path
              key={s.key}
              d={linePath(s.key)}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dash}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="motion-safe:transition-opacity motion-safe:duration-500"
            />
          ))}

          {/* 정점 마커(최신 점만 강조) */}
          {series.map((s) => (
            <circle
              key={`dot-${s.key}`}
              cx={xAt(points.length - 1)}
              cy={yAt(Number(latest[s.key] ?? 0))}
              r={3.5}
              fill={s.color}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-center">
      <p className="text-[10px] text-gray-500">{label}</p>
      <p
        className="mt-0.5 text-lg font-semibold tabular-nums"
        style={{ color: ANALYTICS_PALETTE.text }}
      >
        {value}
      </p>
    </div>
  );
}
