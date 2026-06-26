"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useI18n } from "@/contexts/I18nContext";
import {
  ownerCostsApi,
  type OwnerCostsResponse,
  type OwnerCostUserRow,
} from "@/lib/api";

/**
 * /owner/costs — 계정주(운영자) 전용 API 비용 대시보드.
 *
 * 베타테스터(교수자)별 외부 API 사용 비용을 종목(HeyGen·ElevenLabs·Google
 * TTS·Claude Q&A …)별로 집계하고, 전체 합산·월별 추이를 표와 막대 그래프로
 * 보여준다. 권한은 백엔드 require_owner(ADMIN_EMAILS) 가 강제하므로, 프론트는
 * 로그인만 요구하고 403 이면 "운영자 전용" 안내로 폴백한다.
 */
export default function OwnerCostsPage() {
  return (
    <ProtectedRoute>
      <OwnerCostsView />
    </ProtectedRoute>
  );
}

// 종목별 고정 색상 — 알려진 종목은 일관 색, 그 외는 폴백 팔레트 순환.
const SERVICE_COLORS: Record<string, string> = {
  heygen: "#B88308",
  elevenlabs: "#0E7490",
  google_tts: "#1D4ED8",
  claude_qa: "#7C3AED",
};
const FALLBACK_COLORS = [
  "#B45309",
  "#047857",
  "#9333EA",
  "#DC2626",
  "#0891B2",
  "#6B7280",
];

function serviceColor(service: string, idx: number): string {
  return SERVICE_COLORS[service] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

const usd = (n: number, digits = 2): string =>
  `$${(n ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;

function OwnerCostsView() {
  const { t } = useI18n();
  const [data, setData] = useState<OwnerCostsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await ownerCostsApi.get();
      setData(res);
      setDenied(false);
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 403) setDenied(true);
      else setError(t("ownerCosts.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  // 종목별 색상 인덱스 (services 순서 고정)
  const colorOf = useMemo(() => {
    const order = data?.services ?? [];
    const map = new Map<string, string>();
    order.forEach((s, i) => map.set(s, serviceColor(s, i)));
    return (s: string) => map.get(s) ?? serviceColor(s, order.length);
  }, [data?.services]);

  return (
    <div
      className="min-h-screen px-4 py-12"
      style={{ backgroundColor: "#FAFAF7", color: "#0A0A0A" }}
    >
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1
              className="text-2xl font-extrabold tracking-tight"
              style={{
                fontFamily:
                  "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
              }}
            >
              {t("ownerCosts.title")}
            </h1>
            <p className="mt-1.5 text-sm" style={{ color: "rgba(10,10,10,0.55)" }}>
              {t("ownerCosts.subtitle")}
            </p>
          </div>
          {!denied && (
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="rounded-lg px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "#B88308" }}
            >
              {loading ? t("ownerCosts.refreshing") : t("ownerCosts.refresh")}
            </button>
          )}
        </div>

        {denied ? (
          <p
            className="mt-6 rounded-xl border px-4 py-3 text-sm"
            style={{
              background: "#fff",
              borderColor: "rgba(10,10,10,0.1)",
              color: "rgba(10,10,10,0.6)",
            }}
            role="alert"
          >
            {t("ownerCosts.denied")}
          </p>
        ) : error ? (
          <p className="mt-6 text-sm" style={{ color: "#b91c1c" }} role="alert">
            {error}
          </p>
        ) : loading && !data ? (
          <p className="mt-8 text-sm" style={{ color: "rgba(10,10,10,0.5)" }}>
            …
          </p>
        ) : data ? (
          <Dashboard data={data} colorOf={colorOf} t={t} />
        ) : null}
      </div>
    </div>
  );
}

interface DashboardProps {
  data: OwnerCostsResponse;
  colorOf: (service: string) => string;
  t: (key: string, params?: Record<string, string | number>) => string;
}

function Dashboard({ data, colorOf, t }: DashboardProps) {
  const generatedAt = useMemo(() => {
    try {
      return new Date(data.generated_at).toLocaleString();
    } catch {
      return data.generated_at;
    }
  }, [data.generated_at]);

  // 부분 200/배열 누락 시 빈 배열로 안전 가드 — .map / 스프레드 폭발 방지.
  const byService = data.by_service ?? [];
  const byMonth = data.by_month ?? [];
  const maxService = Math.max(...byService.map((s) => s.cost_usd), 0.0001);
  const maxMonth = Math.max(...byMonth.map((m) => m.cost_usd), 0.0001);
  // 월별은 최신순으로 오므로 그래프는 시간순으로 뒤집어 표시.
  const months = [...byMonth].reverse();

  return (
    <div className="mt-6 space-y-6">
      <p className="text-xs" style={{ color: "rgba(10,10,10,0.45)" }}>
        {t("ownerCosts.generatedAt", { time: generatedAt })}
      </p>

      {/* 요약 카드 3종 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label={t("ownerCosts.totalCost")} value={usd(data.total_cost_usd)} />
        <SummaryCard
          label={t("ownerCosts.monthToDate")}
          value={usd(data.month_to_date_usd)}
        />
        <SummaryCard
          label={t("ownerCosts.userCount")}
          value={`${data.user_count}`}
        />
      </div>

      {data.total_cost_usd === 0 ? (
        <p className="text-sm" style={{ color: "rgba(10,10,10,0.5)" }}>
          {t("ownerCosts.empty")}
        </p>
      ) : (
        <>
          {/* 종목별 비용 — 막대 + 표 */}
          <Card title={t("ownerCosts.byServiceTitle")}>
            <div className="space-y-3">
              {byService.map((row) => {
                const share =
                  data.total_cost_usd > 0
                    ? (row.cost_usd / data.total_cost_usd) * 100
                    : 0;
                return (
                  <div key={row.service} className="flex items-center gap-3">
                    <span
                      className="flex w-32 shrink-0 items-center gap-1.5 text-sm font-medium"
                      style={{ color: "rgba(10,10,10,0.78)" }}
                    >
                      <span
                        aria-hidden
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: colorOf(row.service) }}
                      />
                      <span className="truncate">{row.service}</span>
                    </span>
                    <div
                      className="h-6 flex-1 overflow-hidden rounded-full"
                      style={{ background: "rgba(10,10,10,0.06)" }}
                    >
                      <div
                        className="h-full rounded-full motion-safe:transition-all"
                        style={{
                          width: `${(row.cost_usd / maxService) * 100}%`,
                          background: colorOf(row.service),
                        }}
                      />
                    </div>
                    <span
                      className="w-24 text-right font-mono text-sm tabular-nums"
                      style={{ color: "rgba(10,10,10,0.7)" }}
                    >
                      {usd(row.cost_usd, 4)}
                    </span>
                    <span
                      className="w-12 text-right text-xs tabular-nums"
                      style={{ color: "rgba(10,10,10,0.45)" }}
                    >
                      {share.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* 월별 추이 — 세로 막대 그래프 */}
          {months.length > 0 && (
            <Card title={t("ownerCosts.byMonthTitle")}>
              <div className="flex items-end gap-2" style={{ height: 140 }}>
                {months.map((m) => (
                  <div
                    key={`${m.year}-${m.month}`}
                    className="flex flex-1 flex-col items-center justify-end gap-1"
                    title={usd(m.cost_usd, 4)}
                  >
                    <span
                      className="text-[10px] tabular-nums"
                      style={{ color: "rgba(10,10,10,0.5)" }}
                    >
                      {usd(m.cost_usd, m.cost_usd >= 10 ? 0 : 2)}
                    </span>
                    <div
                      className="w-full rounded-t motion-safe:transition-all"
                      style={{
                        height: `${Math.max((m.cost_usd / maxMonth) * 100, 2)}%`,
                        minHeight: 2,
                        background: "#B88308",
                      }}
                    />
                    <span
                      className="text-[10px] tabular-nums"
                      style={{ color: "rgba(10,10,10,0.45)" }}
                    >
                      {t("ownerCosts.yearMonth", { year: m.year, month: m.month })}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 교수자별 사용 현황 — 종목별 비용 표 + 합성 막대 + CSV */}
          <Card
            title={t("ownerCosts.byUserTitle")}
            action={
              <CsvButton data={data} label={t("ownerCosts.exportCsv")} />
            }
          >
            <UserTable data={data} colorOf={colorOf} t={t} />
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "#fff", border: "1px solid rgba(10,10,10,0.08)" }}
    >
      <p className="text-xs" style={{ color: "rgba(10,10,10,0.55)" }}>
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "#fff", border: "1px solid rgba(10,10,10,0.08)" }}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold" style={{ color: "rgba(10,10,10,0.8)" }}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function UserTable({ data, colorOf, t }: DashboardProps) {
  // 부분 200/배열 누락 시 빈 배열로 안전 가드.
  const services = data.services ?? [];
  const users = data.by_user ?? [];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: "rgba(10,10,10,0.55)" }}>
            <th className="px-2 py-2 text-left font-medium">{t("ownerCosts.colUser")}</th>
            {services.map((s) => (
              <th key={s} className="px-2 py-2 text-right font-medium">
                <span className="inline-flex items-center gap-1">
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: colorOf(s) }}
                  />
                  {s}
                </span>
              </th>
            ))}
            <th className="px-2 py-2 text-right font-semibold">{t("ownerCosts.colTotal")}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.user_id} style={{ borderTop: "1px solid rgba(10,10,10,0.06)" }}>
              <td className="px-2 py-2.5">
                <div className="font-medium" style={{ overflowWrap: "anywhere" }}>
                  {u.email ?? u.user_id.slice(0, 8)}
                </div>
                <UserBar u={u} services={services} colorOf={colorOf} />
              </td>
              {services.map((s) => (
                <td
                  key={s}
                  className="px-2 py-2.5 text-right font-mono tabular-nums"
                  style={{ color: "rgba(10,10,10,0.7)" }}
                >
                  {u.by_service[s] != null ? usd(u.by_service[s], 4) : "—"}
                </td>
              ))}
              <td className="px-2 py-2.5 text-right font-mono font-semibold tabular-nums">
                {usd(u.total_usd, 4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 한 교수자의 종목 구성 막대(합성). 총액 대비 각 종목 비중을 색으로 분할. */
function UserBar({
  u,
  services,
  colorOf,
}: {
  u: OwnerCostUserRow;
  services: string[];
  colorOf: (s: string) => string;
}) {
  if (u.total_usd <= 0) return null;
  return (
    <div
      className="mt-1.5 flex h-1.5 w-full max-w-[220px] overflow-hidden rounded-full"
      style={{ background: "rgba(10,10,10,0.05)" }}
      aria-hidden
    >
      {services.map((s) => {
        const v = u.by_service[s] ?? 0;
        if (v <= 0) return null;
        return (
          <div
            key={s}
            style={{
              width: `${(v / u.total_usd) * 100}%`,
              background: colorOf(s),
            }}
          />
        );
      })}
    </div>
  );
}

function CsvButton({ data, label }: { data: OwnerCostsResponse; label: string }) {
  const handle = () => {
    const services = data.services ?? [];
    const header = ["email", "role", "total_usd", ...services];
    const lines = [header.join(",")];
    for (const u of data.by_user ?? []) {
      const row = [
        u.email ?? u.user_id,
        u.role ?? "",
        u.total_usd.toFixed(4),
        ...services.map((s) => (u.by_service[s] ?? 0).toFixed(4)),
      ];
      lines.push(row.map(csvCell).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `classauto-api-costs.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      type="button"
      onClick={handle}
      className="rounded-lg border px-2.5 py-1 text-xs font-semibold"
      style={{
        borderColor: "rgba(10,10,10,0.14)",
        color: "rgba(10,10,10,0.7)",
        background: "#fff",
      }}
    >
      {label}
    </button>
  );
}

function csvCell(value: string): string {
  // 쉼표·따옴표·개행 포함 시 RFC4180 인용.
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
