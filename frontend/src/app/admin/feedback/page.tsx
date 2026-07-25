"use client";

import { useCallback, useEffect, useState } from "react";
import { feedbackApi, type FeedbackItem } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";

// 스펙 13 · F — 운영자 피드백 인박스. 목록 + status/category/role 필터 + 상태 토글.
// 스펙 14 §E — v2 토큰 전환. 의미 컬러(빨강·파랑·초록)는 §0-6 이 허용하는 상태
// 칩에만 쓰고, 나머지 표면·선택 상태는 골드로 통일한다.
const STATUSES = ["open", "triaged", "resolved"] as const;

const STATUS_STYLE: Record<string, string> = {
  open: "bg-warning/10 text-warning",
  triaged: "bg-info/10 text-info",
  resolved: "bg-success/10 text-success",
};

const CATEGORY_STYLE: Record<string, string> = {
  bug: "bg-warning/10 text-warning",
  idea: "bg-gold/10 text-gold-on-light",
  confusing: "bg-info/10 text-info",
  other: "bg-text/5 text-text-subtle",
};

export default function AdminFeedbackPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (isCancelled?: () => boolean) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await feedbackApi.adminList(
        statusFilter ? { status: statusFilter } : {},
      );
      if (isCancelled?.()) return;
      setItems(data.feedback ?? []);
    } catch {
      if (isCancelled?.()) return;
      setError(t("admin.feedbackLoadError"));
    }
    if (!isCancelled?.()) setLoading(false);
  }, [statusFilter, t]);

  // load() 첫 줄의 동기 setState 가 effect 동기 경로에서 호출되면 린트가 막으므로
  // rAF 로 다음 프레임에 비동기 실행한다(레포 표준 회피책).
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
      <div className="animate-fade-in-up mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-text">
          {t("admin.feedbackTitle")}
        </h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-line-strong bg-bg-card px-3 py-2 text-sm text-text outline-none focus:border-gold-on-light"
          aria-label={t("admin.feedbackFilterAll")}
        >
          <option value="">{t("admin.feedbackFilterAll")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{t(`admin.feedbackStatus.${s}`)}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 text-sm text-warning" role="alert">{error}</div>
      )}

      {items.length === 0 ? (
        <div className="animate-fade-in-up rounded-2xl border border-line bg-bg-card p-10 text-center text-sm text-text-subtle shadow-sm">
          {t("admin.feedbackEmpty")}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((fb) => (
            <div
              key={fb.id}
              className="animate-fade-in-up rounded-2xl border border-line bg-bg-card p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CATEGORY_STYLE[fb.category] ?? CATEGORY_STYLE.other}`}>
                    {t(`feedback.category.${fb.category}`)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[fb.status]}`}>
                    {t(`admin.feedbackStatus.${fb.status}`)}
                  </span>
                  <span className="text-xs text-text-subtle">{fb.role}</span>
                </div>
                <span className="text-xs tabular-nums text-text-subtle">
                  {fb.created_at.slice(0, 16).replace("T", " ")}
                </span>
              </div>

              <p className="mt-2 text-sm whitespace-pre-wrap text-text">{fb.message}</p>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-text-muted">
                  {fb.user_email || "—"}
                  {fb.page ? <span className="text-text-subtle"> · {fb.page}</span> : null}
                </div>
                <div className="flex gap-1">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy === fb.id || fb.status === s}
                      onClick={() => setStatus(fb.id, s)}
                      className={`rounded-md border px-2 py-1 text-xs font-semibold transition ${
                        fb.status === s
                          ? "cursor-default border-gold-on-light bg-gold/10 text-gold-on-light"
                          : "border-line-strong text-text-muted hover:bg-bg-hover"
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
