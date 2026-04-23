"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/contexts/I18nContext";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

type Tab = "attendance" | "scores" | "engagement" | "cost";

export default function LectureDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("attendance");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const { data: result } = await api.get(`/api/v1/dashboard/${id}/${tab}`);
        setData(result);
      } catch {
        setData(null);
        setError(true);
        toast(t("analytics.loadError"), "error");
      }
      setLoading(false);
    })();
  }, [id, tab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "attendance", label: t("analytics.tabAttendance") },
    { key: "scores", label: t("analytics.tabScores") },
    { key: "engagement", label: t("analytics.tabEngagement") },
    { key: "cost", label: t("analytics.tabCost") },
  ];

  const [exporting, setExporting] = useState(false);

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const response = await api.get(`/api/v1/dashboard/${id}/export/csv`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `lecture_${id}_progress.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast(t("analytics.exportSuccess"), "success");
    } catch {
      toast(t("analytics.exportError"), "error");
    }
    setExporting(false);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-xl font-bold text-gray-900">{t("analytics.title")}</h1>
        <button
          onClick={handleExportCSV}
          disabled={exporting}
          aria-label={t("analytics.exportCSV")}
          className="flex items-center gap-2 text-sm bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 rounded-xl px-4 py-2 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          {exporting ? t("analytics.exporting") : t("analytics.exportCSV")}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-full sm:w-fit overflow-x-auto" role="tablist">
        {tabs.map((tabItem) => (
          <button key={tabItem.key} onClick={() => setTab(tabItem.key)}
            role="tab"
            aria-selected={tab === tabItem.key}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === tabItem.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}>
            {tabItem.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner label={t("analytics.loadingData")} /> : error ? (
        <div className="text-center py-10" role="alert">
          <p className="text-gray-500 mb-3">{t("analytics.loadFailed")}</p>
          <button onClick={() => { setLoading(true); setError(false); api.get(`/api/v1/dashboard/${id}/${tab}`).then(({ data: result }) => setData(result)).catch(() => setError(true)).finally(() => setLoading(false)); }}
            className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2 transition">{t("common.retry")}</button>
        </div>
      ) : !data ? (
        <p className="text-gray-400 text-center py-10">{t("analytics.noData")}</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl p-6" role="tabpanel">
          {tab === "attendance" && <AttendanceView data={data} />}
          {tab === "scores" && <ScoresView data={data} />}
          {tab === "engagement" && <EngagementView data={data} />}
          {tab === "cost" && <CostView data={data} />}
        </div>
      )}
    </div>
  );
}

function AttendanceView({ data }: { data: Record<string, unknown> }) {
  const { t } = useI18n();
  const summary = (data.summary || {}) as Record<string, number>;
  const students = (data.students || []) as Record<string, unknown>[];
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label={t("analytics.total")} value={summary.total ?? 0} />
        <StatCard label={t("analytics.live")} value={summary.live ?? 0} color="text-green-600" />
        <StatCard label={t("analytics.vod")} value={summary.vod ?? 0} color="text-blue-600" />
      </div>
      <div className="overflow-x-auto -mx-2 px-2">
      <table className="w-full text-sm min-w-[400px]">
        <thead><tr className="border-b text-left text-gray-500">
          <th className="pb-2" scope="col">{t("analytics.name")}</th>
          <th scope="col">{t("analytics.studentNumber")}</th>
          <th scope="col">{t("analytics.type")}</th>
          <th scope="col">{t("analytics.progress")}</th>
        </tr></thead>
        <tbody>
          {students.map((s, i) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-2 text-gray-900">{s.name as string}</td>
              <td className="text-gray-500">{(s.student_number as string) || "-"}</td>
              <td>
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${s.type === "live" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${s.type === "live" ? "bg-green-500" : "bg-blue-500"}`} aria-hidden="true" />
                  {s.type as string}
                </span>
              </td>
              <td className="text-gray-500">{(s.progress_pct as number)?.toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function ScoresView({ data }: { data: Record<string, unknown> }) {
  const { t } = useI18n();
  const byType = (data.byType || []) as { type: string; accuracy: number; total: number }[];
  return (
    <div>
      <div className="text-3xl font-bold text-indigo-700 mb-4">{(data.overallAccuracy as number)?.toFixed(1)}%</div>
      <p className="text-sm text-gray-500 mb-6">{t("analytics.overallAccuracy")} ({t("analytics.totalQuestions", { count: data.totalQuestions as number })})</p>
      <div className="space-y-3">
        {byType.map((item) => (
          <div key={item.type} className="flex items-center gap-3">
            <span className="text-sm text-gray-700 w-24">{item.type}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-2" role="progressbar" aria-valuenow={item.accuracy} aria-valuemin={0} aria-valuemax={100}>
              <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${item.accuracy}%` }} />
            </div>
            <span className="text-sm text-gray-500 w-16 text-right">{item.accuracy}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EngagementView({ data }: { data: Record<string, unknown> }) {
  const { t } = useI18n();
  const summary = (data.summary || {}) as Record<string, number>;
  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("analytics.totalStudents")} value={summary.totalStudents ?? 0} />
        <StatCard label={t("analytics.qaQuestions")} value={summary.totalQAQuestions ?? 0} />
        <StatCard label={t("analytics.responseRate")} value={`${summary.overallResponseRate ?? 0}%`} color="text-green-600" />
        <StatCard label={t("analytics.noResponseEvents")} value={summary.totalNoResponseEvents ?? 0} color="text-red-600" />
      </div>
    </div>
  );
}

function CostView({ data }: { data: Record<string, unknown> }) {
  const { t } = useI18n();
  const summary = (data.summary || {}) as Record<string, number>;
  const byCategory = (data.byCategory || []) as { category: string; costUsd: number; count: number }[];
  return (
    <div>
      <div className="text-3xl font-bold text-gray-900 mb-1">${(summary.totalCostUsd ?? 0).toFixed(4)}</div>
      <p className="text-sm text-gray-500 mb-6">{t("analytics.totalCost")} ({t("analytics.requests", { count: summary.totalRequests ?? 0 })})</p>
      <div className="space-y-2">
        {byCategory.map((c) => (
          <div key={c.category} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <span className="text-sm font-medium text-gray-700">{c.category}</span>
            <div className="text-right">
              <span className="text-sm text-gray-900">${c.costUsd.toFixed(4)}</span>
              <span className="text-xs text-gray-400 ml-2">({c.count})</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color || "text-gray-900"}`}>{value}</p>
    </div>
  );
}
