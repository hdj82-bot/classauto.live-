"use client";

import { useCallback, useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useI18n } from "@/contexts/I18nContext";
import { ownerInviteApi, type OwnerInvite } from "@/lib/api";

/**
 * /owner/invites — 계정주(운영자) 전용 교수자 초대 발급 화면.
 *
 * 권한은 백엔드 require_owner(ADMIN_EMAILS) 가 강제한다. 프론트는 JWT 에
 * 이메일이 없어 운영자 여부를 미리 알 수 없으므로, 로그인만 요구하고 목록
 * 조회가 403 이면 "운영자 전용" 안내로 폴백한다(가드는 서버가 책임).
 */
export default function OwnerInvitesPage() {
  return (
    <ProtectedRoute>
      <OwnerInvitesView />
    </ProtectedRoute>
  );
}

function OwnerInvitesView() {
  const { t } = useI18n();
  const [invites, setInvites] = useState<OwnerInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
      // (종전엔 비-403 오류를 무시해 빈 목록처럼 보였다.)
      if (status === 403) setDenied(true);
      else setError(t("auth.owner.loadError"));
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
      const { data } = await ownerInviteApi.create(email.trim());
      setInvites((prev) => [data, ...prev]);
      setEmail("");
    } catch {
      setCreateError(t("auth.owner.createError"));
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (inv: OwnerInvite) => {
    try {
      await navigator.clipboard.writeText(inv.invite_url);
      setCopiedId(inv.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* clipboard 차단 환경 — 무시 */
    }
  };

  const handleRevoke = async (inv: OwnerInvite) => {
    if (!window.confirm(t("auth.owner.revokeConfirm"))) return;
    try {
      await ownerInviteApi.revoke(inv.id);
      setInvites((prev) => prev.filter((i) => i.id !== inv.id));
    } catch {
      /* 실패 시 다음 로드에서 정합 */
    }
  };

  const statusLabel = (s: OwnerInvite["status"]) =>
    s === "used"
      ? t("auth.owner.statusUsed")
      : s === "expired"
        ? t("auth.owner.statusExpired")
        : t("auth.owner.statusActive");

  const statusColor = (s: OwnerInvite["status"]) =>
    s === "active" ? "#1a7f37" : s === "used" ? "#6b7280" : "#b45309";

  return (
    <div
      className="min-h-screen px-4 py-12"
      style={{ backgroundColor: "#FAFAF7", color: "#0A0A0A" }}
    >
      <div className="mx-auto w-full max-w-2xl">
        <h1
          className="text-2xl font-extrabold tracking-tight"
          style={{
            fontFamily:
              "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
          }}
        >
          {t("auth.owner.title")}
        </h1>

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
            {t("auth.owner.denied")}
          </p>
        ) : (
          <>
            <p className="mt-1.5 text-sm" style={{ color: "rgba(10,10,10,0.55)" }}>
              {t("auth.owner.subtitle")}
            </p>

            <form
              onSubmit={handleCreate}
              className="mt-6 rounded-2xl p-5"
              style={{
                background: "#fff",
                border: "1px solid rgba(10,10,10,0.08)",
              }}
            >
              <label
                htmlFor="invite-email"
                className="block text-sm font-semibold"
                style={{ color: "rgba(10,10,10,0.7)" }}
              >
                {t("auth.owner.emailLabel")}
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  id="invite-email"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth.owner.emailPlaceholder")}
                  className="flex-1 rounded-lg px-3 py-2.5 text-sm"
                  style={{
                    background: "#FAFAF7",
                    border: "1px solid rgba(10,10,10,0.12)",
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  disabled={!email.trim() || creating}
                  className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: "#B88308" }}
                >
                  {creating ? t("auth.owner.creating") : t("auth.owner.create")}
                </button>
              </div>
              {createError && (
                <p className="mt-2 text-xs" style={{ color: "#b91c1c" }} role="alert">
                  {createError}
                </p>
              )}
            </form>

            <h2 className="mt-8 text-sm font-bold" style={{ color: "rgba(10,10,10,0.7)" }}>
              {t("auth.owner.listTitle")}
            </h2>

            {loading ? (
              <p className="mt-3 text-sm" style={{ color: "rgba(10,10,10,0.5)" }}>
                …
              </p>
            ) : error ? (
              <p className="mt-3 text-sm" style={{ color: "#b91c1c" }} role="alert">
                {error}
              </p>
            ) : invites.length === 0 ? (
              <p className="mt-3 text-sm" style={{ color: "rgba(10,10,10,0.5)" }}>
                {t("auth.owner.empty")}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {invites.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3"
                    style={{
                      background: "#fff",
                      border: "1px solid rgba(10,10,10,0.08)",
                    }}
                  >
                    <span className="text-sm font-medium" style={{ minWidth: 0, flex: "1 1 180px", overflowWrap: "anywhere" }}>
                      {inv.email}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{
                        color: statusColor(inv.status),
                        background: "rgba(10,10,10,0.04)",
                      }}
                    >
                      {statusLabel(inv.status)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(inv)}
                      disabled={inv.status !== "active"}
                      className="rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-40"
                      style={{
                        borderColor: "rgba(10,10,10,0.14)",
                        color: "rgba(10,10,10,0.7)",
                        background: "#fff",
                      }}
                    >
                      {copiedId === inv.id
                        ? t("auth.owner.copied")
                        : t("auth.owner.copy")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRevoke(inv)}
                      className="rounded-lg px-2.5 py-1 text-xs font-semibold"
                      style={{ color: "#b91c1c", background: "transparent" }}
                    >
                      {t("auth.owner.revoke")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
