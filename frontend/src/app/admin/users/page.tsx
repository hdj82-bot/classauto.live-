"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/contexts/I18nContext";

interface UserItem {
  id: string;
  email: string;
  name: string;
  role: string;
  school: string | null;
  department: string | null;
  is_active: boolean;
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
        setUsers(data.users);
        setTotal(data.total);
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

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t("admin.users")}</h1>

      {/* 필터 */}
      <div className="mb-4 flex items-center gap-4">
        <label htmlFor="role-filter" className="sr-only">{t("admin.userColRole")}</label>
        <select
          id="role-filter"
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">{t("admin.filterRoleAll")}</option>
          <option value="professor">{t("admin.filterRoleProfessor")}</option>
          <option value="student">{t("admin.filterRoleStudent")}</option>
          <option value="admin">{t("admin.filterRoleAdmin")}</option>
        </select>
        <span className="text-sm text-gray-500">{t("admin.totalCount", { count: total })}</span>
      </div>

      {loading && <LoadingSpinner fullScreen={false} label={t("admin.loadingLabel")} />}
      {error && <p className="text-red-600" role="alert">{error}</p>}

      {!loading && !error && (
        <>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-600">{t("admin.userColName")}</th>
                  <th className="px-4 py-3 font-medium text-gray-600">{t("admin.userColEmail")}</th>
                  <th className="px-4 py-3 font-medium text-gray-600">{t("admin.userColRole")}</th>
                  <th className="px-4 py-3 font-medium text-gray-600">{t("admin.userColAffiliation")}</th>
                  <th className="px-4 py-3 font-medium text-gray-600">{t("admin.userColStatus")}</th>
                  <th className="px-4 py-3 font-medium text-gray-600">{t("admin.userColAction")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{user.name}</td>
                    <td className="px-4 py-3 text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <label htmlFor={`role-${user.id}`} className="sr-only">{t("admin.userColRole")}</label>
                      <select
                        id={`role-${user.id}`}
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className="border rounded px-2 py-1 text-xs"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {user.school || "-"} / {user.department || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        user.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}>
                        {user.is_active ? t("admin.userActive") : t("admin.userInactive")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(user.id, user.is_active)}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        {user.is_active ? t("admin.userDeactivate") : t("admin.userActivate")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                {t("common.previous")}
              </button>
              <span className="px-3 py-1 text-sm text-gray-600">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
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
