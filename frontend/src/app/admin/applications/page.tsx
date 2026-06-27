"use client";

import { useCallback, useEffect, useState } from "react";
import { betaApplicationsApi, type BetaApplicationItem } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";

// 운영자 베타 신청 수신함 — 대문 '베타 신청하기' 제출 목록 + 상태 토글.
const STATUSES = ["new", "contacted", "approved", "rejected"] as const;

const STATUS_STYLE: Record<string, string> = {
  new: "bg-amber-100 text-amber-700",
  contacted: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-gray-200 text-gray-600",
};

export default function AdminBetaApplicationsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<BetaApplicationItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await betaApplicationsApi.adminList(
        statusFilter ? { status: statusFilter } : {},
      );
      setItems(data.applications ?? []);
    } catch {
      setError(t("admin.applicationsLoadError"));
    }
    setLoading(false);
  }, [statusFilter, t]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(raf);
  }, [load]);

  const setStatus = async (id: string, status: string) => {
    setBusy(id);
    try {
      await betaApplicationsApi.adminSetStatus(id, status);
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? { ...it, status: status as BetaApplicationItem["status"] }
            : it,
        ),
      );
      if (statusFilter && status !== statusFilter) {
        setItems((prev) => prev.filter((it) => it.id !== id));
      }
    } catch {
      setError(t("admin.applicationsStatusError"));
    }
    setBusy(null);
  };

  if (loading && items.length === 0) {
    return <LoadingSpinner fullScreen label={t("admin.applicationsLoadingLabel")} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">
          {t("admin.applicationsTitle")}
        </h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          aria-label={t("admin.applicationsFilterAll")}
        >
          <option value="">{t("admin.applicationsFilterAll")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`admin.applicationsStatus.${s}`)}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="text-red-600 mb-4 text-sm" role="alert">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-500 text-sm">
          {t("admin.applicationsEmpty")}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">
                    {a.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    {a.school} · {a.department} · {a.professor_title}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[a.status]}`}
                  >
                    {t(`admin.applicationsStatus.${a.status}`)}
                  </span>
                </div>
                <span className="text-xs text-gray-400">
                  {a.created_at.slice(0, 16).replace("T", " ")}
                </span>
              </div>

              <div className="text-xs text-gray-600 mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <a
                  href={`mailto:${a.email}`}
                  className="text-[#B88308] hover:underline font-medium"
                >
                  {a.email}
                </a>
                <span>{t("admin.applicationsSubject")}: {a.subject}</span>
                {a.student_count ? (
                  <span>{t("admin.applicationsStudents")}: {a.student_count}</span>
                ) : null}
                <span>
                  {t("admin.applicationsTiming")}:{" "}
                  {t(`betaApply.fields.startOptions.${a.start_timing}`)}
                </span>
                <span>
                  {t("admin.applicationsChannel")}:{" "}
                  {t(`betaApply.fields.channelOptions.${a.channel}`)}
                </span>
              </div>

              {a.message ? (
                <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap border-l-2 border-gray-200 pl-3">
                  {a.message}
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-1 mt-3 flex-wrap">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy === a.id || a.status === s}
                    onClick={() => setStatus(a.id, s)}
                    className={`text-xs px-2 py-1 rounded-md border transition ${
                      a.status === s
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700 cursor-default"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    } disabled:opacity-60`}
                  >
                    {t(`admin.applicationsStatus.${s}`)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
