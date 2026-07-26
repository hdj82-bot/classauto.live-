"use client";

import { useCallback, useEffect, useState } from "react";
import { auditApi, type AuditLogItem } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";

// 스펙 13 · E — 운영자 감사 로그 뷰(읽기 전용). 역할 변경·유저 삭제·초대 발급/삭제·
// 아바타 재렌더 카운터 리셋 등 god-mode 행위 추적. action/actor 필터 + 페이지네이션.
// 스펙 14 §E — v2 토큰 전환.
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

  const load = useCallback(async (isCancelled?: () => boolean) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await auditApi.list({
        page,
        ...(actor.trim() ? { actor: actor.trim() } : {}),
        ...(action.trim() ? { action: action.trim() } : {}),
      });
      if (isCancelled?.()) return;
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    } catch {
      if (isCancelled?.()) return;
      setError(t("admin.auditLoadError"));
    }
    if (!isCancelled?.()) setLoading(false);
  }, [page, actor, action, t]);

  // load() 첫 줄의 동기 setState 가 effect 동기 경로에서 호출되면 린트가 막으므로
  // rAF 로 다음 프레임에 비동기 실행한다(레포 표준 회피책).
  // 필터/페이지 변경 시 이전 요청의 늦은 응답이 새 상태를 덮어쓰지 않게 취소 플래그.
  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      void load(() => cancelled);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
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
      <div className="animate-fade-in-up mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-text">
          {t("admin.auditTitle")}
        </h1>
        <div className="flex flex-wrap gap-2">
          <input
            value={actor}
            onChange={(e) => onFilterChange(setActor)(e.target.value)}
            placeholder={t("admin.auditFilterActorPlaceholder")}
            className="rounded-lg border border-line-strong bg-bg-card px-3 py-2 text-sm text-text outline-none focus:border-gold-on-light"
          />
          <input
            value={action}
            onChange={(e) => onFilterChange(setAction)(e.target.value)}
            placeholder={t("admin.auditFilterActionPlaceholder")}
            className="rounded-lg border border-line-strong bg-bg-card px-3 py-2 text-sm text-text outline-none focus:border-gold-on-light"
          />
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-warning" role="alert">{error}</div>}

      <div className="animate-fade-in-up stagger-1 rounded-2xl border border-line bg-bg-card p-4 shadow-sm">
        {logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-subtle">{t("admin.auditEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg-subtle">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-text-muted">{t("admin.auditColTime")}</th>
                  <th className="px-3 py-2 text-left font-medium text-text-muted">{t("admin.auditColActor")}</th>
                  <th className="px-3 py-2 text-left font-medium text-text-muted">{t("admin.auditColAction")}</th>
                  <th className="px-3 py-2 text-left font-medium text-text-muted">{t("admin.auditColTarget")}</th>
                  <th className="px-3 py-2 text-left font-medium text-text-muted">{t("admin.auditColDetail")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {logs.map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-text-subtle">
                      {a.created_at ? a.created_at.slice(0, 16).replace("T", " ") : "—"}
                    </td>
                    <td className="px-3 py-2 text-text-muted">{a.actor_email || "—"}</td>
                    <td className="px-3 py-2">
                      {/* action 은 `user.update_role` 같은 식별자다. v2 는 모노 폰트를
                          폐기했으므로(typography.md — "코드·모노 (제거됨)") 칩 배경과
                          자간으로 구분한다. */}
                      <span className="rounded bg-bg-subtle px-1.5 py-0.5 text-xs tracking-tight text-text-muted">
                        {a.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-text-subtle">
                      {a.target_type ? (
                        <span>
                          {a.target_type}
                          {a.target_id ? <span className="text-text-faint"> · {a.target_id.slice(0, 12)}</span> : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="max-w-xs px-3 py-2 text-text-subtle">
                      {a.detail ? (
                        <code className="text-xs break-all text-text-subtle">{JSON.stringify(a.detail)}</code>
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

        <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
          <span className="text-xs tabular-nums text-text-subtle">
            {t("admin.auditPageInfo", { page, total })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-line-strong px-3 py-1 text-sm text-text-muted transition hover:bg-bg-hover disabled:opacity-50"
            >
              {t("admin.auditPrev")}
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-line-strong px-3 py-1 text-sm text-text-muted transition hover:bg-bg-hover disabled:opacity-50"
            >
              {t("admin.auditNext")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
