"use client";

import { useAnalyticsI18n } from "./useAnalyticsI18n";
import EmptyState from "./EmptyState";
import { ANALYTICS_PALETTE } from "./svg";
import type { KpiDeltaData, KpiItem } from "./types";

/**
 * 현황 KPI 카드 + 전주 대비 델타 (스펙 11 §B).
 *
 * C(성취율 추이)가 적재한 일자 스냅샷에서 최신값과 7일 이전 값을 비교한 증감을
 * ▲/▼ 화살표 + 색(상승 녹색·하락 빨강)으로 표시한다. 화살표 + 부호 텍스트로
 * 색 단독 의존을 피한다(색약자). 전주 스냅샷이 없으면 현재값만.
 *
 * 질문 수(qaCount)는 정수 카운트라 % 가 아닌 정수로, 나머지 3종은 % 로 포맷.
 */
interface KpiDeltaCardsProps {
  data: KpiDeltaData | null;
}

const PCT_KEYS = new Set(["completionRate", "attendanceRate", "avgAccuracy"]);

export default function KpiDeltaCards({ data }: KpiDeltaCardsProps) {
  const { t } = useAnalyticsI18n();
  const kpis = data?.kpis ?? [];

  if (kpis.length === 0) {
    return <EmptyState title={t("kpi.empty")} description={t("kpi.emptyDesc")} />;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.key} item={k} label={t(`kpi.${k.key}`)} />
        ))}
      </div>
      {data?.as_of && (
        <p className="text-[11px] text-gray-400">
          {data.prev_as_of
            ? t("kpi.asOfWithPrev", { date: data.as_of, prev: data.prev_as_of })
            : t("kpi.asOf", { date: data.as_of })}
        </p>
      )}
    </div>
  );
}

function fmt(key: KpiItem["key"], value: number): string {
  return PCT_KEYS.has(key) ? `${value.toFixed(1)}%` : String(value);
}

function KpiCard({ item, label }: { item: KpiItem; label: string }) {
  const isPct = PCT_KEYS.has(item.key);
  const up = item.delta !== null && item.delta > 0;
  const down = item.delta !== null && item.delta < 0;
  const deltaColor = up
    ? ANALYTICS_PALETTE.success
    : down
      ? ANALYTICS_PALETTE.warning
      : ANALYTICS_PALETTE.textMuted;
  const arrow = up ? "▲" : down ? "▼" : "—";

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p
        className="mt-1 text-2xl font-semibold tabular-nums"
        style={{ color: ANALYTICS_PALETTE.text }}
      >
        {fmt(item.key, item.current)}
      </p>
      {item.delta === null ? (
        <p className="mt-0.5 text-[11px] text-gray-400">{/* 전주 데이터 없음 */}—</p>
      ) : (
        <p
          className="mt-0.5 flex items-center gap-1 text-xs font-medium tabular-nums"
          style={{ color: deltaColor }}
        >
          <span aria-hidden="true">{arrow}</span>
          <span>
            {item.delta > 0 ? "+" : ""}
            {isPct ? `${item.delta.toFixed(1)}p` : item.delta}
          </span>
        </p>
      )}
    </div>
  );
}
