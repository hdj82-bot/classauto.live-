"use client";

import { useCallback, useEffect, useState } from "react";
import { betaApplicationsApi, type BetaApplicationItem } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";

// 운영자 베타 신청 수신함 — 대문 '베타 신청하기' 제출 목록 + 상태 토글.
// 스펙 14 §E — v2 토큰 전환. 의미 컬러는 상태 칩에만(§0-6).
const STATUSES = ["new", "contacted", "approved", "rejected"] as const;

const STATUS_STYLE: Record<string, string> = {
  new: "bg-warning/10 text-warning",
  contacted: "bg-info/10 text-info",
  approved: "bg-success/10 text-success",
  rejected: "bg-text/5 text-text-subtle",
};

export default function AdminBetaApplicationsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<BetaApplicationItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (isCancelled?: () => boolean) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await betaApplicationsApi.adminList(
        statusFilter ? { status: statusFilter } : {},
      );
      if (isCancelled?.()) return;
      setItems(data.applications ?? []);
    } catch {
      if (isCancelled?.()) return;
      setError(t("admin.applicationsLoadError"));
    }
    if (!isCancelled?.()) setLoading(false);
  }, [statusFilter, t]);

  // 필터 변경 시 이전 요청의 늦은 응답이 새 상태를 덮어쓰지 않게 취소 플래그.
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
      <div className="animate-fade-in-up mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-text">
          {t("admin.applicationsTitle")}
        </h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-line-strong bg-bg-card px-3 py-2 text-sm text-text outline-none focus:border-gold-on-light"
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
        <div className="mb-4 text-sm text-warning" role="alert">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="animate-fade-in-up rounded-2xl border border-line bg-bg-card p-10 text-center text-sm text-text-subtle shadow-sm">
          {t("admin.applicationsEmpty")}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div
              key={a.id}
              className="animate-fade-in-up rounded-2xl border border-line bg-bg-card p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-text">{a.name}</span>
                  <span className="text-xs text-text-muted">
                    {a.school} · {a.department} · {a.professor_title}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[a.status]}`}
                  >
                    {t(`admin.applicationsStatus.${a.status}`)}
                  </span>
                </div>
                <span className="text-xs tabular-nums text-text-subtle">
                  {a.created_at.slice(0, 16).replace("T", " ")}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                <a
                  href={`mailto:${a.email}`}
                  className="font-medium text-gold-on-light hover:underline"
                >
                  {a.email}
                </a>
                <span>{t("admin.applicationsSubject")}: {a.subject}</span>
                {a.student_count ? (
                  <span className="tabular-nums">{t("admin.applicationsStudents")}: {a.student_count}</span>
                ) : null}
                <span>
                  {t("admin.applicationsTiming")}:{" "}
                  {t(`marketing.betaApply.fields.startOptions.${a.start_timing}`)}
                </span>
                <span>
                  {t("admin.applicationsChannel")}:{" "}
                  {t(`marketing.betaApply.fields.channelOptions.${a.channel}`)}
                </span>
              </div>

              {a.message ? (
                <p className="mt-2 border-l-2 border-line-strong pl-3 text-sm whitespace-pre-wrap text-text">
                  {a.message}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center justify-end gap-1">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy === a.id || a.status === s}
                    onClick={() => setStatus(a.id, s)}
                    className={`rounded-md border px-2 py-1 text-xs font-semibold transition ${
                      a.status === s
                        ? "cursor-default border-gold-on-light bg-gold/10 text-gold-on-light"
                        : "border-line-strong text-text-muted hover:bg-bg-hover"
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
