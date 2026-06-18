"use client";

import { useCallback, useEffect, useState } from "react";
import { auditApi, type AuditLogItem } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";

// 스펙 13 · E — 운영자 감사 로그 뷰(읽기 전용). 역할 변경·유저 삭제·초대 발급/삭제·
// 아바타 재렌더 카운터 리셋 등 god-mode 행위 추적. action/actor 필터 + 페이지네이션.
const LIMIT = 50;

export default function AdminAuditPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await auditApi.list({
        page,
        ...(actor.trim() ? { actor: actor.trim() } : {}),
        ...(action.trim() ? { action: action.trim() } : {}),
      });
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError(t("admin.auditLoadError"));
    }
    setLoading(false);
  }, [page, actor, action, t]);

  useEffect(() => {
    load();
  }, [load]);

  // 필터 변경 시 1페이지로.
  const onFilterChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  if (loading && logs.length === 0) {
    return <LoadingSpinner fullScreen label={t("admin.auditLoadingLabel")} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">{t("admin.auditTitle")}</h1>
        <div className="flex gap-2 flex-wrap">
          <input
            value={actor}
            onChange={(e) => onFilterChange(setActor)(e.target.value)}
            placeholder={t("admin.auditFilterActorPlaceholder")}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          />
          <input
            value={action}
            onChange={(e) => onFilterChange(setAction)(e.target.value)}
            placeholder={t("admin.auditFilterActionPlaceholder")}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          />
        </div>
      </div>

      {error && <div className="text-red-600 mb-4 text-sm" role="alert">{error}</div>}

      <div className="bg-white rounded-xl shadow-sm p-4">
        {logs.length === 0 ? (
          <p className="text-gray-500 text-sm py-8 text-center">{t("admin.auditEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">{t("admin.auditColTime")}</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">{t("admin.auditColActor")}</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">{t("admin.auditColAction")}</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">{t("admin.auditColTarget")}</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">{t("admin.auditColDetail")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                      {a.created_at ? a.created_at.slice(0, 16).replace("T", " ") : "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{a.actor_email || "—"}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                        {a.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {a.target_type ? (
                        <span>
                          {a.target_type}
                          {a.target_id ? <span className="text-gray-400"> · {a.target_id.slice(0, 12)}</span> : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-500 max-w-xs">
                      {a.detail ? (
                        <code className="text-xs text-gray-500 break-all">{JSON.stringify(a.detail)}</code>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-500">
            {t("admin.auditPageInfo", { page, total })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="text-sm px-3 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {t("admin.auditPrev")}
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="text-sm px-3 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {t("admin.auditNext")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
