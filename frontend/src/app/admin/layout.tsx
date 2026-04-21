"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";

const NAV_ITEMS = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/users", label: "사용자 관리" },
  { href: "/admin/costs", label: "비용 분석" },
  { href: "/admin/system", label: "시스템 모니터링" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="min-h-screen flex bg-gray-50">
        {/* 사이드바 */}
        <aside className="w-64 bg-gray-900 text-white flex-shrink-0">
          <div className="p-6">
            <h2 className="text-lg font-bold">IFL Admin</h2>
            <p className="text-xs text-gray-400 mt-1">관리자 대시보드</p>
          </div>
          <nav className="px-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-3 py-2 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? "bg-indigo-600 text-white"
                      : "text-gray-300 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* 메인 콘텐츠 */}
        <main className="flex-1 p-8 overflow-auto">{children}</main>
      </div>
    </ProtectedRoute>
  );
}
