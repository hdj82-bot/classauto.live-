"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useI18n } from "@/contexts/I18nContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();

  const navItems = [
    { href: "/admin", label: t("admin.navDashboard") },
    { href: "/admin/users", label: t("admin.navUsers") },
    { href: "/admin/costs", label: t("admin.navCosts") },
    { href: "/admin/system", label: t("admin.navSystem") },
  ];

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="min-h-screen flex bg-gray-50">
        {/* 사이드바 */}
        <aside className="w-64 bg-gray-900 text-white flex-shrink-0">
          <div className="p-6">
            <h2 className="text-lg font-bold">{t("admin.title")}</h2>
            <p className="text-xs text-gray-400 mt-1">{t("admin.subtitle")}</p>
          </div>
          <nav className="px-3 space-y-1" aria-label={t("admin.subtitle")}>
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
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
