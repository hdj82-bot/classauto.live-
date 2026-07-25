"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/contexts/I18nContext";

/**
 * /admin/users — 전체 사용자 관리. 스펙 14 §E 로 v2 토큰 전환.
 *
 * **사이드바에서만 뺐고 라우트는 유지한다.** `/admin/beta` 와 나란히 두면
 * "테스터 목록"이 두 개로 보이는 게 문제였을 뿐, 이 화면의 쓰기 4종(역할 변경·
 * 활성 토글·PRO 분석 토글·유저 삭제)은 전부 감사 로그를 남기므로 §5 의 기준을
 * 이미 통과했고 제거 대상이 아니다.
 *
 * 특히 `/admin/beta` 의 모집단은 `instructor_rollup` 이 `role == professor` 로
 * 고정하므로, 이 화면이 없으면 **학생·admin 계정 관리 경로가 콘솔에서 사라진다.**
 * 도달 경로는 `/admin/beta` 행 오버플로 메뉴의 딥링크가 맡는다.
 */

interface UserItem {
  id: string;
  email: string;
  name: string;
  role: string;
  school: string | null;
  department: string | null;
  is_active: boolean;
  analytics_pro_enabled?: boolean;
  created_at: string | null;
}

const ROLES = ["professor", "student", "admin"];

export default function AdminUsersPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params: Record<string, string | number> = { page, limit: 20 };
        if (roleFilter) params.role = roleFilter;
        const { data } = await api.get("/api/v1/admin/users", { params });
        if (cancelled) return;
        // 부분 200 응답(users 누락)에서 setUsers(undefined) → 이후 .map 크래시 방지.
        setUsers(data.users ?? []);
        setTotal(data.total ?? 0);
        setError(null);
      } catch {
        if (!cancelled) setError(t("admin.userLoadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, roleFilter, t]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.patch(`/api/v1/admin/users/${userId}`, null, {
        params: { role: newRole },
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      toast(t("admin.userRoleChanged"), "success");
    } catch {
      toast(t("admin.userRoleChangeError"), "error");
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    try {
      await api.patch(`/api/v1/admin/users/${userId}`, null, {
        params: { is_active: !currentActive },
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, is_active: !currentActive } : u
        )
      );
      toast(t("admin.userActiveChanged"), "success");
    } catch {
      toast(t("admin.userActiveChangeError"), "error");
    }
  };

  const handleToggleAnalyticsPro = async (
    userId: string,
    currentEnabled: boolean
  ) => {
    try {
      await api.patch(`/api/v1/admin/users/${userId}`, null, {
        params: { analytics_pro_enabled: !currentEnabled },
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, analytics_pro_enabled: !currentEnabled } : u
        )
      );
      toast(t("admin.userAnalyticsProChanged"), "success");
    } catch {
      toast(t("admin.userAnalyticsProChangeError"), "error");
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <div className="animate-fade-in-up">
        {/* 사이드바에 없는 화면이라 되돌아갈 경로를 화면 안에 둔다. */}
        <Link
          href="/admin/beta"
          className="inline-flex items-center gap-1 text-xs font-semibold text-text-subtle transition hover:text-gold-on-light"
        >
          {/* 이모지·문자 화살표 대신 인라인 SVG(icons.md v2). */}
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
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {t("admin.navBeta")}
        </Link>
        <h1 className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-text">
          {t("admin.users")}
        </h1>
      </div>

      {/* 필터 */}
      <div className="animate-fade-in-up stagger-1 mt-6 mb-4 flex items-center gap-4">
        <label htmlFor="role-filter" className="sr-only">{t("admin.userColRole")}</label>
        <select
          id="role-filter"
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-line-strong bg-bg-card px-3 py-2 text-sm text-text outline-none focus:border-gold-on-light"
        >
          <option value="">{t("admin.filterRoleAll")}</option>
          <option value="professor">{t("admin.filterRoleProfessor")}</option>
          <option value="student">{t("admin.filterRoleStudent")}</option>
          <option value="admin">{t("admin.filterRoleAdmin")}</option>
        </select>
        <span className="text-sm tabular-nums text-text-muted">{t("admin.totalCount", { count: total })}</span>
      </div>

      {loading && <LoadingSpinner fullScreen={false} label={t("admin.loadingLabel")} />}
      {error && <p className="text-warning" role="alert">{error}</p>}

      {!loading && !error && (
        <>
          <div className="animate-fade-in-up stagger-2 overflow-hidden rounded-2xl border border-line bg-bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg-subtle text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-text-muted">{t("admin.userColName")}</th>
                    <th className="px-4 py-3 font-medium text-text-muted">{t("admin.userColEmail")}</th>
                    <th className="px-4 py-3 font-medium text-text-muted">{t("admin.userColRole")}</th>
                    <th className="px-4 py-3 font-medium text-text-muted">{t("admin.userColAffiliation")}</th>
                    <th className="px-4 py-3 font-medium text-text-muted">{t("admin.userColStatus")}</th>
                    <th className="px-4 py-3 font-medium text-text-muted">{t("admin.userColAnalyticsPro")}</th>
                    <th className="px-4 py-3 font-medium text-text-muted">{t("admin.userColAction")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {users.map((user) => (
                    <tr key={user.id} className="transition hover:bg-bg-hover">
                      <td className="px-4 py-3 font-medium text-text">{user.name}</td>
                      <td className="px-4 py-3 text-text-muted">{user.email}</td>
                      <td className="px-4 py-3">
                        <label htmlFor={`role-${user.id}`} className="sr-only">{t("admin.userColRole")}</label>
                        <select
                          id={`role-${user.id}`}
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          className="rounded border border-line-strong bg-bg-card px-2 py-1 text-xs text-text outline-none focus:border-gold-on-light"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-subtle">
                        {user.school || "-"} / {user.department || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                          user.is_active ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                        }`}>
                          {user.is_active ? t("admin.userActive") : t("admin.userInactive")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {user.role === "professor" ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleAnalyticsPro(
                                user.id,
                                user.analytics_pro_enabled ?? false
                              )
                            }
                            className={`inline-block rounded px-2 py-0.5 text-xs font-semibold transition ${
                              user.analytics_pro_enabled
                                ? "bg-success/10 text-success hover:bg-success/20"
                                : "bg-text/5 text-text-subtle hover:bg-bg-hover"
                            }`}
                          >
                            {user.analytics_pro_enabled
                              ? t("admin.analyticsProOn")
                              : t("admin.analyticsProOff")}
                          </button>
                        ) : (
                          <span className="text-xs text-text-faint">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(user.id, user.is_active)}
                          className="text-xs font-semibold text-gold-on-light hover:underline"
                        >
                          {user.is_active ? t("admin.userDeactivate") : t("admin.userActivate")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md border border-line-strong px-3 py-1 text-sm text-text-muted transition hover:bg-bg-hover disabled:opacity-50"
              >
                {t("common.previous")}
              </button>
              <span className="px-3 py-1 text-sm tabular-nums text-text-muted">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-md border border-line-strong px-3 py-1 text-sm text-text-muted transition hover:bg-bg-hover disabled:opacity-50"
              >
                {t("common.next")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
