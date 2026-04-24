"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

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
        if (!cancelled) setError("사용자 목록을 불러올 수 없습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, roleFilter]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.patch(`/api/v1/admin/users/${userId}`, null, {
        params: { role: newRole },
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    } catch {
      alert("역할 변경에 실패했습니다.");
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
    } catch {
      alert("상태 변��에 실패했습니다.");
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">사용자 관리</h1>

      {/* 필터 */}
      <div className="mb-4 flex items-center gap-4">
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">전체 역할</option>
          <option value="professor">교수자</option>
          <option value="student">학습자</option>
          <option value="admin">관리자</option>
        </select>
        <span className="text-sm text-gray-500">총 {total}명</span>
      </div>

      {loading && <LoadingSpinner fullScreen={false} label="로딩 중..." />}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-600">이름</th>
                  <th className="px-4 py-3 font-medium text-gray-600">이메일</th>
                  <th className="px-4 py-3 font-medium text-gray-600">역할</th>
                  <th className="px-4 py-3 font-medium text-gray-600">소속</th>
                  <th className="px-4 py-3 font-medium text-gray-600">상태</th>
                  <th className="px-4 py-3 font-medium text-gray-600">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{user.name}</td>
                    <td className="px-4 py-3 text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <select
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
                        {user.is_active ? "활성" : "비활성"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(user.id, user.is_active)}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        {user.is_active ? "비활성화" : "활성화"}
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
                이전
              </button>
              <span className="px-3 py-1 text-sm text-gray-600">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                다음
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
