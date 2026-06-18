"use client";

import { useCallback, useEffect, useState } from "react";
import { feedbackApi, type FeedbackItem } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";

// 스펙 13 · F — 운영자 피드백 인박스. 목록 + status/category/role 필터 + 상태 토글.
const STATUSES = ["open", "triaged", "resolved"] as const;

const STATUS_STYLE: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  triaged: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
};

const CATEGORY_STYLE: Record<string, string> = {
  bug: "bg-red-100 text-red-700",
  idea: "bg-indigo-100 text-indigo-700",
  confusing: "bg-amber-100 text-amber-700",
  other: "bg-gray-100 text-gray-600",
};

export default function AdminFeedbackPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await feedbackApi.adminList(
        statusFilter ? { status: statusFilter } : {},
      );
      setItems(data.feedback ?? []);
    } catch {
      setError(t("admin.feedbackLoadError"));
    }
    setLoading(false);
  }, [statusFilter, t]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: string, status: string) => {
    setBusy(id);
    try {
      await feedbackApi.adminSetStatus(id, status);
      setItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, status: status as FeedbackItem["status"] } : it,
        ),
      );
      // status 필터가 걸려 있으면 더 이상 매칭 안 되는 항목을 목록에서 제거.
      if (statusFilter && status !== statusFilter) {
        setItems((prev) => prev.filter((it) => it.id !== id));
      }
    } catch {
      setError(t("admin.feedbackStatusError"));
    }
    setBusy(null);
  };

  if (loading && items.length === 0) {
    return <LoadingSpinner fullScreen label={t("admin.feedbackLoadingLabel")} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">{t("admin.feedbackTitle")}</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          aria-label={t("admin.feedbackFilterAll")}
        >
          <option value="">{t("admin.feedbackFilterAll")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{t(`admin.feedbackStatus.${s}`)}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="text-red-600 mb-4 text-sm" role="alert">{error}</div>
      )}

      {items.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-500 text-sm">
          {t("admin.feedbackEmpty")}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((fb) => (
            <div key={fb.id} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_STYLE[fb.category] ?? CATEGORY_STYLE.other}`}>
                    {t(`feedback.category.${fb.category}`)}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[fb.status]}`}>
                    {t(`admin.feedbackStatus.${fb.status}`)}
                  </span>
                  <span className="text-xs text-gray-400">{fb.role}</span>
                </div>
                <span className="text-xs text-gray-400">{fb.created_at.slice(0, 16).replace("T", " ")}</span>
              </div>

              <p className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">{fb.message}</p>

              <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
                <div className="text-xs text-gray-500">
                  {fb.user_email || "—"}
                  {fb.page ? <span className="text-gray-400"> · {fb.page}</span> : null}
                </div>
                <div className="flex gap-1">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy === fb.id || fb.status === s}
                      onClick={() => setStatus(fb.id, s)}
                      className={`text-xs px-2 py-1 rounded-md border transition ${
                        fb.status === s
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700 cursor-default"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      } disabled:opacity-60`}
                    >
                      {t(`admin.feedbackStatus.${s}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
