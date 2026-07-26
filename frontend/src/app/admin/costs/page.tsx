"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";

/**
 * /admin/costs — 전체 API 비용. 스펙 14 §E 로 v2 토큰 전환.
 *
 * ⚠️ 이 화면은 아직 **전체 합산**만 보여준다. `/owner/costs` 가 가진 테스터별 ×
 * 종목별 분해·월별 그래프·CSV 를 여기로 포팅하는 건 스펙 §E-2 별건이며, 그
 * 작업에는 total_cost_usd 불변식 검증이 따라붙는다. E 는 백엔드 변경 0 을
 * 유지해야 하므로 여기서는 스타일만 바꾼다. 포팅 전까지 `/owner/costs` 는
 * 살아 있다(리다이렉트 금지).
 */

interface CostData {
  total_cost_usd: number;
  by_service: { service: string; cost_usd: number }[];
  by_month: { year: number; month: number; cost_usd: number }[];
}

export default function AdminCostsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: res } = await api.get("/api/v1/admin/costs");
        setData(res);
      } catch {
        setError(t("admin.costsLoadError"));
      }
      setLoading(false);
    })();
  }, [t]);

  if (loading) return <LoadingSpinner fullScreen label={t("admin.costsLoadingLabel")} />;
  if (error) {
    return (
      <div className="py-20 text-center text-warning" role="alert">
        {error}
      </div>
    );
  }
  if (!data) return null;

  // 부분 200 응답(배열/숫자 필드 누락)에서도 .map()/.toFixed() 크래시를 막는다.
  const byService = data.by_service ?? [];
  const byMonth = data.by_month ?? [];
  const totalCostUsd = data.total_cost_usd ?? 0;
  const maxServiceCost = Math.max(...byService.map((s) => s.cost_usd), 0.01);

  return (
    <div>
      <h1 className="animate-fade-in-up font-display text-2xl font-extrabold tracking-tight text-text">
        {t("admin.costsTitle")}
      </h1>

      {/* 총 비용 */}
      <div className="animate-fade-in-up stagger-1 mt-6 rounded-2xl border border-line bg-bg-card p-5 shadow-sm">
        <p className="text-xs text-text-muted">{t("admin.totalCost")}</p>
        <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums text-text">
          ${totalCostUsd.toFixed(2)}
        </p>
      </div>

      {/* 서비스별 막대 — 골드 단일색. 종목 구분은 직접 라벨이 맡는다(§0-6). */}
      <div className="animate-fade-in-up stagger-2 mt-6 rounded-2xl border border-line bg-bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-base font-bold text-text">{t("admin.byService")}</h2>
        {byService.length === 0 ? (
          <p className="text-sm text-text-subtle">{t("admin.noData")}</p>
        ) : (
          <div className="space-y-3">
            {byService.map((item) => (
              <div key={item.service} className="flex items-center gap-3">
                <span className="w-24 truncate text-sm font-medium text-text-muted">
                  {item.service}
                </span>
                <div className="h-6 flex-1 overflow-hidden rounded-full bg-seq-1">
                  <div
                    className="h-full rounded-full bg-seq-4 motion-safe:transition-all"
                    style={{ width: `${(item.cost_usd / maxServiceCost) * 100}%` }}
                  />
                </div>
                <span className="w-20 text-right text-sm tabular-nums text-text-muted">
                  ${item.cost_usd.toFixed(4)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 월별 비용 테이블 */}
      <div className="animate-fade-in-up stagger-3 mt-6 rounded-2xl border border-line bg-bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-base font-bold text-text">{t("admin.byMonth")}</h2>
        {byMonth.length === 0 ? (
          <p className="text-sm text-text-subtle">{t("admin.noData")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg-subtle">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-text-muted">{t("admin.colPeriod")}</th>
                  <th className="px-4 py-2 text-right font-medium text-text-muted">{t("admin.colCostUsd")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {byMonth.map((item) => (
                  <tr key={`${item.year}-${item.month}`}>
                    <td className="px-4 py-2 tabular-nums text-text-muted">
                      {t("admin.yearMonth", { year: item.year, month: item.month })}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-text">
                      ${item.cost_usd.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
