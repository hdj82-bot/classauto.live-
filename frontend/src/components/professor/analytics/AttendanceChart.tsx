"use client";

import { useMemo } from "react";
import { useAnalyticsI18n } from "./useAnalyticsI18n";
import EmptyState from "./EmptyState";
import { ANALYTICS_PALETTE } from "./svg";
import type { AttendanceData } from "./types";

/**
 * 출석 분포 차트.
 *
 * - 상단: live / vod 비율을 가로 누적 막대로 시각화. tabular-nums + 비율 텍스트
 *   라벨로 색약자 친화 (색상 단독 의존 X).
 * - 하단: 학생별 진행률 분포를 4단계 buckets (0–25 / 25–50 / 50–75 / 75–100)
 *   로 작은 히스토그램으로 보여줌 — 정원 대비 진도 분포 한눈에.
 *
 * 빈 데이터 fallback: students.length === 0 → EmptyState.
 *
 * 모션: 가로 막대는 CSS transition (300ms) 으로 진입 애니메이션 — 단,
 * `prefers-reduced-motion` 사용자에게는 transition 미적용 (globals.css 보다
 * 컴포넌트 레벨에서 inline media query 보호).
 */
interface AttendanceChartProps {
  data: AttendanceData;
}

export default function AttendanceChart({ data }: AttendanceChartProps) {
  const { t } = useAnalyticsI18n();
  const { summary, students } = data;
  const total = summary?.total ?? 0;
  const live = summary?.live ?? 0;
  const vod = summary?.vod ?? 0;

  const livePct = total > 0 ? Math.round((live / total) * 100) : 0;
  const vodPct = total > 0 ? Math.round((vod / total) * 100) : 0;

  const buckets = useMemo(() => {
    const out = [0, 0, 0, 0];
    for (const s of students) {
      const p = Number(s.progress_pct ?? 0);
      if (p < 25) out[0] += 1;
      else if (p < 50) out[1] += 1;
      else if (p < 75) out[2] += 1;
      else out[3] += 1;
    }
    return out;
  }, [students]);

  if (total === 0) {
    return (
      <EmptyState
        title={t("attendance.empty")}
        description={t("attendance.emptyDesc")}
      />
    );
  }

  const bucketLabels = ["0–25%", "25–50%", "50–75%", "75–100%"];
  const maxBucket = Math.max(1, ...buckets);

  return (
    <div className="space-y-6">
      {/* 요약 카드 3종 */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile
          label={t("attendance.summaryTotal")}
          value={total}
          color={ANALYTICS_PALETTE.text}
        />
        <SummaryTile
          label={t("attendance.summaryLive")}
          value={live}
          color={ANALYTICS_PALETTE.success}
          glyph="●"
        />
        <SummaryTile
          label={t("attendance.summaryVod")}
          value={vod}
          color={ANALYTICS_PALETTE.info}
          glyph="◑"
        />
      </div>

      {/* live/vod 누적 막대 */}
      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
          <span>{t("attendance.barLegend")}</span>
          <span className="tabular-nums">
            {livePct}% / {vodPct}%
          </span>
        </div>
        <div
          role="img"
          aria-label={t("attendance.ariaBar", { total, live, vod })}
          className="overflow-hidden rounded-full bg-gray-100"
          style={{ height: 14 }}
        >
          <div className="flex h-full w-full motion-safe:transition-[width] motion-safe:duration-300">
            <div
              className="h-full"
              style={{
                width: `${livePct}%`,
                background: ANALYTICS_PALETTE.success,
              }}
              aria-hidden="true"
            />
            <div
              className="h-full"
              style={{
                width: `${vodPct}%`,
                background: ANALYTICS_PALETTE.info,
              }}
              aria-hidden="true"
            />
          </div>
        </div>
        <div className="mt-2 flex gap-4 text-xs">
          <LegendDot
            color={ANALYTICS_PALETTE.success}
            label={`${t("attendance.live")} · ${live}`}
            glyph="●"
          />
          <LegendDot
            color={ANALYTICS_PALETTE.info}
            label={`${t("attendance.vod")} · ${vod}`}
            glyph="◑"
          />
        </div>
      </div>

      {/* 진행률 4-bucket 히스토그램 */}
      <div>
        <p className="mb-3 text-sm font-medium text-gray-700">
          {t("attendance.progressTitle")}
        </p>
        {students.length === 0 ? (
          <EmptyState
            title={t("attendance.progressEmpty")}
            bordered={false}
          />
        ) : (
          <ul className="space-y-2">
            {buckets.map((count, i) => {
              const pct = (count / maxBucket) * 100;
              return (
                <li key={i} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-gray-500 tabular-nums">
                    {bucketLabels[i]}
                  </span>
                  <div
                    role="progressbar"
                    aria-valuenow={count}
                    aria-valuemin={0}
                    aria-valuemax={students.length}
                    aria-label={`${bucketLabels[i]}: ${count}`}
                    className="relative h-3 flex-1 overflow-hidden rounded-full bg-gray-100"
                  >
                    <div
                      className="h-full motion-safe:transition-[width] motion-safe:duration-300"
                      style={{
                        width: `${pct}%`,
                        background:
                          i === 0
                            ? ANALYTICS_PALETTE.warning
                            : ANALYTICS_PALETTE.gold,
                      }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs tabular-nums text-gray-700">
                    {t("attendance.students", { count })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  color,
  glyph,
}: {
  label: string;
  value: number;
  color: string;
  glyph?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p
        className="mt-1 text-2xl font-semibold tabular-nums"
        style={{ color }}
      >
        {glyph && (
          <span aria-hidden="true" className="mr-1 text-base">
            {glyph}
          </span>
        )}
        {value}
      </p>
    </div>
  );
}

function LegendDot({
  color,
  label,
  glyph,
}: {
  color: string;
  label: string;
  glyph: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-gray-600">
      <span
        aria-hidden="true"
        style={{ color }}
        className="text-sm leading-none"
      >
        {glyph}
      </span>
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color }}
      />
      <span className="tabular-nums">{label}</span>
    </span>
  );
}
