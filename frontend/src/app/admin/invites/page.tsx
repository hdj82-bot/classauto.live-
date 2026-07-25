"use client";

import { useCallback, useEffect, useState } from "react";
import InviteQr from "@/components/admin/InviteQr";
import { useI18n } from "@/contexts/I18nContext";
import { ownerInviteApi, type OwnerInvite } from "@/lib/api";

/**
 * /admin/invites — 교수자 초대 발급 + QR. 스펙 14 §A.
 *
 * 기존 `/owner/invites` 를 운영자 콘솔 안으로 옮긴 화면이다. API 클라이언트
 * (`ownerInviteApi` → `/api/owner/invites`)는 그대로 재사용하므로 백엔드
 * 변경은 없다. 옮기면서 두 가지가 붙었다.
 *   1. cohort 셀렉트 — `InviteCreateRequest.cohort` 를 백엔드가 이미 받는데
 *      입력란이 없어 항상 NULL 로 발급되고 있었다.
 *   2. QR — 오프라인 워크숍용. 발급 직후 자동으로 펼쳐지고, 목록 각 행의 QR
 *      버튼으로 과거 초대도 다시 꺼낼 수 있다(재인쇄).
 *
 * 권한 가드는 `admin/layout.tsx` 의 ProtectedRoute(admin + allowOwner) 가
 * 이미 감싸므로 페이지 내부에서 다시 감싸지 않는다. 다만 최종 판정은 서버의
 * require_owner(ADMIN_EMAILS) 이므로 403 은 "운영자 전용" 안내로 폴백한다.
 */

// 베타 코호트 — 09-beta-program.md 의 2026년 8·9월 두 차수. 차수가 늘면 여기에
// 추가한다(백엔드는 자유 문자열을 받으므로 프론트 상수만 고치면 된다).
const COHORTS = ["2026-08", "2026-09"] as const;

export default function AdminInvitesPage() {
  const { t } = useI18n();
  const [invites, setInvites] = useState<OwnerInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [cohort, setCohort] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  // QR 은 한 번에 한 개만 펼친다 — 목록이 길어져도 스캔 대상이 헷갈리지 않도록.
  const [qrOpenId, setQrOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await ownerInviteApi.list();
      // 부분 200/배열 누락 시 빈 배열로 안전 가드(렌더에서 .map 폭발 방지).
      setInvites(Array.isArray(data) ? data : []);
      setDenied(false);
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      // 403 은 "운영자 전용" 폴백, 그 외 오류는 삼키지 않고 명시적으로 노출한다.
      if (status === 403) setDenied(true);
      else setError(t("admin.invites.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const { data } = await ownerInviteApi.create(email.trim(), cohort || null);
      setInvites((prev) => [data, ...prev]);
      setEmail("");
      // 발급 직후 QR 을 바로 보여준다(수용 기준: "발급 → QR이 즉시 뜨고").
      // cohort 는 초기화하지 않는다 — 같은 차수를 연달아 발급하는 게 보통.
      setQrOpenId(data.id);
    } catch {
      setCreateError(t("admin.invites.createError"));
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (inv: OwnerInvite) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(inv.invite_url);
      setCopiedId(inv.id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      /* clipboard 차단 환경 — QR 패널의 readonly input 으로 직접 복사 가능 */
    }
  };

  const handleRevoke = async (inv: OwnerInvite) => {
    if (!window.confirm(t("admin.invites.revokeConfirm"))) return;
    try {
      await ownerInviteApi.revoke(inv.id);
      setInvites((prev) => prev.filter((i) => i.id !== inv.id));
      setQrOpenId((cur) => (cur === inv.id ? null : cur));
    } catch {
      /* 실패 시 다음 로드에서 정합 */
    }
  };

  const statusLabel = (s: OwnerInvite["status"]) =>
    s === "used"
      ? t("admin.invites.statusUsed")
      : s === "expired"
        ? t("admin.invites.statusExpired")
        : t("admin.invites.statusActive");

  // 의미 컬러는 상태 칩에만 예약(스펙 14 §0-6). 골드는 브랜드 액션에만.
  const statusChipClass = (s: OwnerInvite["status"]) =>
    s === "active"
      ? "bg-success/10 text-success"
      : s === "expired"
        ? "bg-warning/10 text-warning"
        : "bg-text/5 text-text-subtle";

  const formatDate = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="animate-fade-in-up">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-text">
          {t("admin.invites.title")}
        </h1>
        <p className="mt-1.5 text-sm text-text-muted">
          {t("admin.invites.subtitle")}
        </p>
      </header>

      {denied ? (
        <p
          className="mt-6 rounded-xl border border-line bg-bg-card px-4 py-3 text-sm text-text-muted"
          role="alert"
        >
          {t("admin.invites.denied")}
        </p>
      ) : (
        <>
          {/* ── 발급 폼 ─────────────────────────────────────────────── */}
          <form
            onSubmit={handleCreate}
            className="animate-fade-in-up stagger-1 mt-6 rounded-2xl border border-line bg-bg-card p-5"
          >
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="flex-1">
                <label
                  htmlFor="invite-email"
                  className="block text-xs font-semibold tracking-wide text-text-muted uppercase"
                >
                  {t("admin.invites.emailLabel")}
                </label>
                <input
                  id="invite-email"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("admin.invites.emailPlaceholder")}
                  className="mt-2 w-full rounded-lg border border-line-strong bg-bg px-3 py-2.5 text-sm text-text outline-none focus:border-gold-on-light"
                />
              </div>
              <div className="sm:w-44">
                <label
                  htmlFor="invite-cohort"
                  className="block text-xs font-semibold tracking-wide text-text-muted uppercase"
                >
                  {t("admin.invites.cohortLabel")}
                </label>
                <select
                  id="invite-cohort"
                  value={cohort}
                  onChange={(e) => setCohort(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-line-strong bg-bg px-3 py-2.5 text-sm text-text tabular-nums outline-none focus:border-gold-on-light"
                >
                  {COHORTS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="">{t("admin.invites.cohortNone")}</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="submit"
                disabled={!email.trim() || creating}
                className="rounded-lg bg-gold-on-light px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gold-deep disabled:opacity-60"
              >
                {creating
                  ? t("admin.invites.creating")
                  : t("admin.invites.create")}
              </button>
              <p className="text-xs text-text-subtle">
                {t("admin.invites.cohortHelp")}
              </p>
            </div>

            {createError && (
              <p className="mt-3 text-xs text-warning" role="alert">
                {createError}
              </p>
            )}
          </form>

          {/* ── 발급 목록 ───────────────────────────────────────────── */}
          <div className="animate-fade-in-up stagger-2 mt-8">
            <h2 className="text-sm font-bold text-text-muted">
              {t("admin.invites.listTitle")}
              {!loading && !error && invites.length > 0 && (
                <span className="ml-2 tabular-nums text-text-subtle">
                  {invites.length}
                </span>
              )}
            </h2>

            {loading ? (
              <div className="mt-3 space-y-2" aria-hidden>
                <div className="studio-skeleton-block h-14 rounded-xl" />
                <div className="studio-skeleton-block h-14 rounded-xl" />
              </div>
            ) : error ? (
              <p className="mt-3 text-sm text-warning" role="alert">
                {error}
              </p>
            ) : invites.length === 0 ? (
              <p className="mt-3 text-sm text-text-subtle">
                {t("admin.invites.empty")}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {invites.map((inv) => {
                  const expires = formatDate(inv.expires_at);
                  const qrOpen = qrOpenId === inv.id;
                  return (
                    <li
                      key={inv.id}
                      className="rounded-xl border border-line bg-bg-card px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="min-w-0 flex-[1_1_180px] text-sm font-medium text-text [overflow-wrap:anywhere]">
                          {inv.email}
                        </span>

                        {inv.cohort && (
                          <span className="rounded-full bg-gold/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-gold-on-light">
                            {inv.cohort}
                          </span>
                        )}

                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusChipClass(inv.status)}`}
                        >
                          {statusLabel(inv.status)}
                        </span>

                        {expires && inv.status === "active" && (
                          <span className="text-xs tabular-nums text-text-subtle">
                            {t("admin.invites.expiresAt", { date: expires })}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => setQrOpenId(qrOpen ? null : inv.id)}
                          aria-expanded={qrOpen}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                            qrOpen
                              ? "border-gold-on-light bg-gold/10 text-gold-on-light"
                              : "border-line-strong bg-bg-card text-text-muted hover:bg-bg-hover"
                          }`}
                        >
                          <QrIcon />
                          {qrOpen
                            ? t("admin.invites.qrHide")
                            : t("admin.invites.qr")}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopy(inv)}
                          disabled={inv.status !== "active"}
                          className="rounded-lg border border-line-strong bg-bg-card px-2.5 py-1 text-xs font-semibold text-text-muted transition hover:bg-bg-hover disabled:opacity-40"
                        >
                          {copiedId === inv.id
                            ? t("admin.invites.copied")
                            : t("admin.invites.copy")}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRevoke(inv)}
                          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-warning transition hover:bg-warning/10"
                        >
                          {t("admin.invites.revoke")}
                        </button>
                      </div>

                      {qrOpen && (
                        <InviteQr url={inv.invite_url} label={inv.email} />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** QR 아이콘 — monochrome line (icons.md v2). currentColor 로 칩 색을 따른다. */
function QrIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1" />
    </svg>
  );
}
