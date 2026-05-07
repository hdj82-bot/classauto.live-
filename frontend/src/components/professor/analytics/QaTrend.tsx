"use client";

import { useMemo } from "react";
import { useAnalyticsI18n } from "./useAnalyticsI18n";
import EmptyState from "./EmptyState";
import { ANALYTICS_PALETTE } from "./svg";
import type { QAData } from "./types";

/**
 * Q&A 트렌드 — 첫 페이지(최신 50건) 응답 기준 요약 + sparkline.
 *
 * - 4종 카드: 총 질문, 응답률, 범위 내, 범위 외 거부.
 * - 시점별 sparkline: 가장 오래된 → 최신 순으로 누적 응답률 추이.
 *   (백엔드가 `created_at` 으로 정렬해서 내려주므로 desc 를 reverse).
 */
interface QaTrendProps {
  data: QAData;
}

export default function QaTrend({ data }: QaTrendProps) {
  const { t } = useAnalyticsI18n();
  const logs = data?.logs ?? [];

  const stats = useMemo(() => {
    const total = data?.totalCount ?? logs.length;
    const responded = logs.filter((l) => l.responded).length;
    const inScope = logs.filter((l) => l.in_scope).length;
    const outOfScope = logs.length - inScope;
    const responseRate =
      logs.length > 0 ? Math.round((responded / logs.length) * 100) : 0;
    return { total, responded, inScope, outOfScope, responseRate };
  }, [data, logs]);

  // sparkline — 시점 누적 응답률 (정렬: 오래된 → 최신)
  const sparkPoints = useMemo(() => {
    if (logs.length < 2) return [];
    const ordered = [...logs].reverse();
    let respondedSoFar = 0;
    return ordered.map((l, i) => {
      if (l.responded) respondedSoFar += 1;
      const pct = ((respondedSoFar / (i + 1)) * 100) || 0;
      return pct;
    });
  }, [logs]);

  if (logs.length === 0 && (data?.totalCount ?? 0) === 0) {
    return (
      <EmptyState
        title={t("qa.empty")}
        description={t("qa.emptyDesc")}
      />
    );
  }

  const w = 360;
  const h = 60;
  const padX = 4;
  const padY = 6;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const stepX =
    sparkPoints.length > 1 ? innerW / (sparkPoints.length - 1) : innerW;

  const polyline = sparkPoints
    .map((v, i) => {
      const x = padX + i * stepX;
      const y = padY + (1 - v / 100) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={t("qa.totalQuestions")} value={stats.total} />
        <Tile
          label={t("qa.responded")}
          value={`${stats.responseRate}%`}
          color={ANALYTICS_PALETTE.success}
        />
        <Tile
          label={t("qa.inScope")}
          value={stats.inScope}
          color={ANALYTICS_PALETTE.info}
        />
        <Tile
          label={t("qa.outOfScope")}
          value={stats.outOfScope}
          color={
            stats.outOfScope > 0
              ? ANALYTICS_PALETTE.warning
              : ANALYTICS_PALETTE.text
          }
        />
      </div>

      {sparkPoints.length >= 2 && (
        <div>
          <p className="mb-1 text-xs text-gray-500">
            {t("qa.trend")} ·{" "}
            {t("qa.responseRate", { rate: stats.responseRate })}
          </p>
          <svg
            role="img"
            aria-label={t("qa.trend")}
            viewBox={`0 0 ${w} ${h}`}
            width="100%"
            height={h}
            preserveAspectRatio="none"
            style={{ maxWidth: 600 }}
          >
            <polyline
              points={polyline}
              fill="none"
              stroke={ANALYTICS_PALETTE.gold}
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p
        className="mt-1 text-xl font-semibold tabular-nums"
        style={{ color: color ?? ANALYTICS_PALETTE.text }}
      >
        {value}
      </p>
    </div>
  );
}
