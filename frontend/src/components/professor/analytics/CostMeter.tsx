"use client";

import { useMemo } from "react";
import { useAnalyticsI18n } from "./useAnalyticsI18n";
import EmptyState from "./EmptyState";
import { ANALYTICS_PALETTE } from "./svg";
import type { CostData } from "./types";

/**
 * 비용 미터 — 누적 비용 + 카테고리 분해.
 *
 * - 큰 숫자 카드 (누적 비용) + 입출력 토큰 + 요청 수.
 * - 카테고리별 비용 가로 막대 + 점유 비율(%) 라벨.
 * - props.monthlyLimitUsd 가 있으면 한도 대비 진행 바 + 80% 초과 시 빨강 경고.
 *
 * 빈 데이터: byCategory.length === 0 + totalRequests === 0 → EmptyState.
 */
interface CostMeterProps {
  data: CostData;
  /** 월 한도 (USD) — 알면 진행 바와 80% 경고를 함께 그림. 없으면 단순 합산만. */
  monthlyLimitUsd?: number;
}

export default function CostMeter({ data, monthlyLimitUsd }: CostMeterProps) {
  const { t } = useAnalyticsI18n();
  const summary = data.summary ?? {
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
  };
  // R5 lint: ?? [] fallback 이 매 렌더마다 새 배열 reference 를 만들어 아래
  // useMemo 가 매 렌더 재실행 → useMemo 로 안정화.
  const byCategory = useMemo(() => data.byCategory ?? [], [data.byCategory]);

  const sorted = useMemo(
    () => [...byCategory].sort((a, b) => b.costUsd - a.costUsd),
    [byCategory],
  );
  const totalCost = summary.totalCostUsd ?? 0;
  const limitPct =
    monthlyLimitUsd && monthlyLimitUsd > 0
      ? Math.min(100, (totalCost / monthlyLimitUsd) * 100)
      : null;
  const warn80 = limitPct !== null && limitPct >= 80;

  if (summary.totalRequests === 0 && byCategory.length === 0) {
    return (
      <EmptyState
        title={t("cost.empty")}
        description={t("cost.emptyDesc")}
      />
    );
  }

  // 카테고리별 점유율 계산
  const sumForRatio = sorted.reduce((s, c) => s + c.costUsd, 0) || 1;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4">
        <p
          className="text-3xl font-semibold tabular-nums"
          style={{ color: warn80 ? ANALYTICS_PALETTE.warning : ANALYTICS_PALETTE.text }}
          aria-label={t("cost.ariaTotal", { amount: totalCost.toFixed(4) })}
        >
          ${totalCost.toFixed(4)}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {t("cost.total")} ·{" "}
          {t("cost.totalRequests", { count: summary.totalRequests })}
        </p>

        {limitPct !== null && (
          <div className="mt-4">
            <div
              role="progressbar"
              aria-valuenow={Math.round(limitPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${totalCost.toFixed(2)} / ${monthlyLimitUsd}`}
              className="h-2 overflow-hidden rounded-full bg-gray-100"
            >
              <div
                className="h-full motion-safe:transition-[width] motion-safe:duration-300"
                style={{
                  width: `${limitPct}%`,
                  background: warn80 ? ANALYTICS_PALETTE.warning : ANALYTICS_PALETTE.gold,
                }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="tabular-nums text-gray-500">
                ${totalCost.toFixed(2)} / ${monthlyLimitUsd?.toFixed(2)}
              </span>
              {warn80 && (
                <span
                  className="font-medium"
                  style={{ color: ANALYTICS_PALETTE.warning }}
                >
                  {t("cost.warningPrefix")} {t("cost.warning80")}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <TokenStat
            label={t("cost.inputTokens")}
            value={summary.totalInputTokens}
          />
          <TokenStat
            label={t("cost.outputTokens")}
            value={summary.totalOutputTokens}
          />
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-gray-700">
          {t("cost.byCategoryTitle")}
        </p>
        <ul className="space-y-2">
          {sorted.map((c) => {
            const ratio = (c.costUsd / sumForRatio) * 100;
            return (
              <li
                key={c.category}
                className="rounded-xl border border-gray-200 bg-white px-4 py-3"
              >
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-800">
                    {c.category}
                  </span>
                  <span className="tabular-nums text-gray-900">
                    ${c.costUsd.toFixed(4)}
                    <span className="ml-2 text-xs text-gray-400">
                      ({t("cost.categoryRequests", { count: c.count })})
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div
                    role="progressbar"
                    aria-valuenow={Math.round(ratio)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"
                  >
                    <div
                      className="h-full motion-safe:transition-[width] motion-safe:duration-300"
                      style={{
                        width: `${ratio}%`,
                        background: ANALYTICS_PALETTE.gold,
                      }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs tabular-nums text-gray-500">
                    {ratio.toFixed(0)}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function TokenStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium text-gray-800 tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
