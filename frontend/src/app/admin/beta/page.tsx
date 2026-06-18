"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";

// 스펙 13 · A(테스터별 사용량 롤업) + D(활성화 퍼널). 백엔드:
//   GET /api/v1/admin/beta-overview?cohort= , /api/v1/admin/funnel?cohort=
//   GET /api/v1/admin/users/{id}/usage (드릴다운)

interface InstructorRow {
  id: string;
  email: string;
  name: string | null;
  cohort: string | null;
  last_active_at: string | null;
  courses_count: number;
  lectures_count: number;
  published_lectures_count: number;
  renders_count: number;
  spend_this_month_usd: number;
  spend_total_usd: number;
  spend_monthly_avg_usd: number;
}

interface FunnelStep {
  step: string;
  count: number;
  conversion_from_prev_pct: number;
}

interface UsageDetail {
  id: string;
  email: string;
  cohort: string | null;
  beta_consented_at: string | null;
  lectures_count: number;
  lectures: {
    id: string;
    title: string;
    is_published: boolean;
    course_title: string;
    updated_at: string | null;
  }[];
  spend_total_usd: number;
  monthly_spend: { year: number; month: number; cost_usd: number }[];
}

const FUNNEL_LABELS: Record<string, string> = {
  invited: "betaFunnelInvited",
  signed_up: "betaFunnelSignedUp",
  created_course: "betaFunnelCreatedCourse",
  published_lecture: "betaFunnelPublishedLecture",
  ran_student_session: "betaFunnelRanSession",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export default function AdminBetaPage() {
  const { t } = useI18n();
  const [cohort, setCohort] = useState<string>("");
  const [cohortOptions, setCohortOptions] = useState<string[]>([]);
  const [instructors, setInstructors] = useState<InstructorRow[]>([]);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 드릴다운 — 행 클릭 시 펼침. id → 상세(또는 "loading"/"error").
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, UsageDetail | "loading" | "error">>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ovParams = new URLSearchParams({ limit: "200" });
      const fnParams = new URLSearchParams();
      if (cohort) {
        ovParams.set("cohort", cohort);
        fnParams.set("cohort", cohort);
      }
      const fnQuery = fnParams.toString();
      const [ov, fn] = await Promise.all([
        api.get(`/api/v1/admin/beta-overview?${ovParams.toString()}`),
        api.get(`/api/v1/admin/funnel${fnQuery ? `?${fnQuery}` : ""}`),
      ]);
      const rows: InstructorRow[] = ov.data.instructors ?? [];
      setInstructors(rows);
      setFunnel(fn.data.steps ?? []);
      // 코호트 옵션은 필터가 비어 있을 때(전체)만 갱신 — 전체 모집단 기준.
      if (!cohort) {
        const set = new Set<string>();
        rows.forEach((r) => r.cohort && set.add(r.cohort));
        setCohortOptions(Array.from(set).sort());
      }
    } catch {
      setError(t("admin.betaLoadError"));
    }
    setLoading(false);
  }, [cohort, t]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleRow = async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!detail[id] || detail[id] === "error") {
      setDetail((d) => ({ ...d, [id]: "loading" }));
      try {
        const { data } = await api.get(`/api/v1/admin/users/${id}/usage`);
        setDetail((d) => ({ ...d, [id]: data }));
      } catch {
        setDetail((d) => ({ ...d, [id]: "error" }));
      }
    }
  };

  if (loading && instructors.length === 0) {
    return <LoadingSpinner fullScreen label={t("admin.betaLoadingLabel")} />;
  }
  if (error) {
    return <div className="text-red-600 text-center py-20" role="alert">{error}</div>;
  }

  const maxFunnel = Math.max(...funnel.map((s) => s.count), 1);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">{t("admin.betaTitle")}</h1>
        <select
          value={cohort}
          onChange={(e) => setCohort(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          aria-label={t("admin.betaCohortAll")}
        >
          <option value="">{t("admin.betaCohortAll")}</option>
          {cohortOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* D: 활성화 퍼널 */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("admin.betaFunnelTitle")}</h2>
        <div className="space-y-3">
          {funnel.map((s) => (
            <div key={s.step} className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700 w-32 shrink-0">
                {t(`admin.${FUNNEL_LABELS[s.step] ?? "betaFunnelInvited"}`)}
              </span>
              <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all flex items-center justify-end pr-2"
                  style={{ width: `${(s.count / maxFunnel) * 100}%`, minWidth: "2rem" }}
                >
                  <span className="text-xs text-white font-semibold">{s.count}</span>
                </div>
              </div>
              <span className="text-xs text-gray-500 w-14 text-right">
                {t("admin.betaFunnelConversion", { pct: s.conversion_from_prev_pct })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* A: 테스터별 사용량 롤업 */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("admin.betaTableTitle")}</h2>
        {instructors.length === 0 ? (
          <p className="text-gray-500 text-sm">{t("admin.betaNoInstructors")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">{t("admin.betaColInstructor")}</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">{t("admin.betaColCohort")}</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">{t("admin.betaColCourses")}</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">{t("admin.betaColLectures")}</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">{t("admin.betaColPublished")}</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">{t("admin.betaColRenders")}</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">{t("admin.betaColSpendMonth")}</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">{t("admin.betaColSpendTotal")}</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">{t("admin.betaColSpendAvg")}</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">{t("admin.betaColLastActive")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {instructors.map((r) => (
                  <RowWithDrilldown
                    key={r.id}
                    row={r}
                    expanded={expanded === r.id}
                    detail={detail[r.id]}
                    onToggle={() => toggleRow(r.id)}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function RowWithDrilldown({
  row,
  expanded,
  detail,
  onToggle,
  t,
}: {
  row: InstructorRow;
  expanded: boolean;
  detail: UsageDetail | "loading" | "error" | undefined;
  onToggle: () => void;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  return (
    <>
      <tr
        className={`cursor-pointer hover:bg-gray-50 ${expanded ? "bg-indigo-50" : ""}`}
        onClick={onToggle}
      >
        <td className="px-3 py-2">
          <div className="font-medium text-gray-800">{row.name || "—"}</div>
          <div className="text-xs text-gray-500">{row.email}</div>
        </td>
        <td className="px-3 py-2 text-gray-600">{row.cohort || "—"}</td>
        <td className="px-3 py-2 text-right tabular-nums">{row.courses_count}</td>
        <td className="px-3 py-2 text-right tabular-nums">{row.lectures_count}</td>
        <td className="px-3 py-2 text-right tabular-nums">{row.published_lectures_count}</td>
        <td className="px-3 py-2 text-right tabular-nums">{row.renders_count}</td>
        <td className="px-3 py-2 text-right tabular-nums font-mono">${row.spend_this_month_usd.toFixed(2)}</td>
        <td className="px-3 py-2 text-right tabular-nums font-mono font-semibold">${row.spend_total_usd.toFixed(2)}</td>
        <td className="px-3 py-2 text-right tabular-nums font-mono">${row.spend_monthly_avg_usd.toFixed(2)}</td>
        <td className="px-3 py-2 text-gray-600">{fmtDate(row.last_active_at)}</td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={10} className="px-4 py-4">
            {detail === "loading" || detail === undefined ? (
              <p className="text-sm text-gray-500">…</p>
            ) : detail === "error" ? (
              <p className="text-sm text-red-600">{t("admin.betaDrilldownLoadError")}</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">{t("admin.betaDrilldownLectures")}</h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        detail.beta_consented_at
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {t("admin.betaDrilldownConsent")}:{" "}
                      {detail.beta_consented_at
                        ? t("admin.betaDrilldownConsentYes")
                        : t("admin.betaDrilldownConsentNo")}
                    </span>
                  </div>
                  {detail.lectures.length === 0 ? (
                    <p className="text-sm text-gray-400">{t("admin.betaDrilldownEmpty")}</p>
                  ) : (
                    <ul className="space-y-1">
                      {detail.lectures.map((l) => (
                        <li key={l.id} className="text-sm text-gray-700 flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${l.is_published ? "bg-green-500" : "bg-gray-300"}`} />
                          <span className="truncate">{l.title}</span>
                          <span className="text-xs text-gray-400">· {l.course_title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">{t("admin.betaDrilldownMonthly")}</h3>
                  {detail.monthly_spend.length === 0 ? (
                    <p className="text-sm text-gray-400">—</p>
                  ) : (
                    <ul className="space-y-1">
                      {detail.monthly_spend.map((m) => (
                        <li key={`${m.year}-${m.month}`} className="text-sm text-gray-700 flex justify-between max-w-xs">
                          <span>{t("admin.yearMonth", { year: m.year, month: m.month })}</span>
                          <span className="font-mono">${m.cost_usd.toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
