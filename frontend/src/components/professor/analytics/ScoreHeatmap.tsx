"use client";

import { useId, useMemo } from "react";
import { useAnalyticsI18n } from "./useAnalyticsI18n";
import EmptyState from "./EmptyState";
import {
  ANALYTICS_PALETTE,
  HeatPatternDefs,
  bucketAccuracy,
  patternIdForBucket,
} from "./svg";
import type { ScoresData } from "./types";

/**
 * 정답률 히트맵.
 *
 * - 카테고리(byCategory) × 단일 행 매트릭스를 SVG 로 그린다. 각 셀은
 *   accuracy 값을 색 + 패턴(사선·도트·체크)으로 부호화 — colors.md §9.3
 *   "빨강 단독 사용 금지" 정책 준수.
 * - 카테고리 셀 하단에 accuracy 숫자(타블러)와 정/오답 비율 막대 보조.
 * - 빈 byCategory + 0 totalQuestions → EmptyState.
 *
 * 학습 분석 §7.2 "취약점 히트맵 (Pro)" 의 1차 구현 — Pro 매트릭스(학습자 ×
 * 챕터) 는 후속 PR 로 분리. 본 PR 은 chapter 기준 정답률만 시각화한다.
 */
interface ScoreHeatmapProps {
  data: ScoresData;
}

export default function ScoreHeatmap({ data }: ScoreHeatmapProps) {
  const { t } = useAnalyticsI18n();
  const idBase = useId().replace(/[:]/g, "-");

  const sorted = useMemo(
    () => [...(data.byCategory ?? [])].sort((a, b) => a.accuracy - b.accuracy),
    [data.byCategory],
  );

  if (!data.totalQuestions || sorted.length === 0) {
    return (
      <EmptyState
        title={t("scores.empty")}
        description={t("scores.emptyDesc")}
      />
    );
  }

  // SVG 좌표계
  const cellW = 96;
  const cellH = 56;
  const gap = 6;
  const padding = 12;
  const width = padding * 2 + sorted.length * cellW + (sorted.length - 1) * gap;
  const height = padding * 2 + cellH + 28; // +28 for label area

  return (
    <div className="space-y-6">
      <div>
        <p
          className="text-3xl font-semibold tabular-nums"
          style={{ color: ANALYTICS_PALETTE.gold }}
        >
          {data.overallAccuracy.toFixed(1)}%
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {t("scores.overall")} ·{" "}
          {t("scores.totalQuestions", { count: data.totalQuestions })}
        </p>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-gray-700">
          {t("scores.byCategoryTitle")}
        </p>
        <div className="overflow-x-auto -mx-2 px-2">
          <svg
            role="img"
            aria-label={t("scores.byCategoryTitle")}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="block"
          >
            <HeatPatternDefs prefix={idBase} />
            {sorted.map((row, i) => {
              const x = padding + i * (cellW + gap);
              const y = padding;
              const bucket = bucketAccuracy(row.accuracy);
              const fill = `url(#${patternIdForBucket(idBase, bucket)})`;
              const labelText =
                row.category === "uncategorized"
                  ? t("scores.noCategory")
                  : row.category;
              const truncated =
                labelText.length > 14
                  ? labelText.slice(0, 13) + "…"
                  : labelText;
              return (
                <g key={`${row.category}-${i}`}>
                  <rect
                    x={x}
                    y={y}
                    width={cellW}
                    height={cellH}
                    rx={10}
                    fill={fill}
                    stroke={ANALYTICS_PALETTE.border}
                  />
                  <text
                    x={x + cellW / 2}
                    y={y + cellH / 2 - 2}
                    textAnchor="middle"
                    fontSize={18}
                    fontWeight={600}
                    fill={ANALYTICS_PALETTE.text}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {row.accuracy.toFixed(0)}%
                  </text>
                  <text
                    x={x + cellW / 2}
                    y={y + cellH / 2 + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill={ANALYTICS_PALETTE.textMuted}
                  >
                    {row.correct}/{row.total}
                  </text>
                  <text
                    x={x + cellW / 2}
                    y={y + cellH + 18}
                    textAnchor="middle"
                    fontSize={11}
                    fill={ANALYTICS_PALETTE.text}
                  >
                    <title>{labelText}</title>
                    {truncated}
                  </text>
                  {/* 색약자 보조: aria 라벨 (스크린 리더용) */}
                  <desc>
                    {t("scores.ariaCell", {
                      category: labelText,
                      accuracy: row.accuracy.toFixed(1),
                    })}
                  </desc>
                </g>
              );
            })}
          </svg>
        </div>

        {/* 패턴 범례 */}
        <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-600">
          <LegendSwatch
            idBase={idBase}
            bucket="low"
            label={t("scores.patternLow")}
          />
          <LegendSwatch
            idBase={idBase}
            bucket="midLow"
            label={t("scores.patternMid")}
          />
          <LegendSwatch
            idBase={idBase}
            bucket="high"
            label={t("scores.patternHigh")}
          />
        </ul>
      </div>

      {data.byType.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-medium text-gray-700">
            {t("scores.byTypeTitle")}
          </p>
          <ul className="space-y-2">
            {data.byType.map((tr) => (
              <li key={tr.type} className="flex items-center gap-3">
                <span className="w-24 truncate text-sm text-gray-700">
                  {tr.type}
                </span>
                <div
                  role="progressbar"
                  aria-valuenow={tr.accuracy}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100"
                >
                  <div
                    className="h-full motion-safe:transition-[width] motion-safe:duration-300"
                    style={{
                      width: `${tr.accuracy}%`,
                      background: ANALYTICS_PALETTE.gold,
                    }}
                  />
                </div>
                <span className="w-14 text-right text-xs tabular-nums text-gray-500">
                  {tr.accuracy.toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.wrongAnswerTop.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-medium text-gray-700">
            {t("scores.wrongTopTitle")}
          </p>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {data.wrongAnswerTop.slice(0, 10).map((row, i) => (
              <li
                key={`${row.questionText}-${i}`}
                className="flex items-start gap-3 px-4 py-3"
              >
                <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-red-50 text-[11px] font-semibold text-red-700 tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm text-gray-900"
                    title={row.questionText}
                  >
                    {row.questionText}
                  </p>
                  <p className="text-xs text-gray-500">{row.questionType}</p>
                </div>
                <span className="flex-none text-xs font-medium text-red-600 tabular-nums">
                  {t("scores.wrongCount", { count: row.wrongCount })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LegendSwatch({
  idBase,
  bucket,
  label,
}: {
  idBase: string;
  bucket: "low" | "midLow" | "mid" | "high" | "veryHigh";
  label: string;
}) {
  return (
    <li className="inline-flex items-center gap-2">
      <svg
        width={16}
        height={16}
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="overflow-visible"
      >
        <HeatPatternDefs prefix={idBase + "-leg"} />
        <rect
          x="0"
          y="0"
          width="16"
          height="16"
          rx="3"
          fill={`url(#${patternIdForBucket(idBase + "-leg", bucket)})`}
          stroke={ANALYTICS_PALETTE.border}
        />
      </svg>
      {label}
    </li>
  );
}
