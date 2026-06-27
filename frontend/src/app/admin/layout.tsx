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
    { href: "/admin/applications", label: t("admin.navApplications") },
    { href: "/admin/beta", label: t("admin.navBeta") },
    { href: "/admin/users", label: t("admin.navUsers") },
    { href: "/admin/feedback", label: t("admin.navFeedback") },
    { href: "/admin/audit", label: t("admin.navAudit") },
    { href: "/admin/costs", label: t("admin.navCosts") },
    { href: "/admin/system", label: t("admin.navSystem") },
  ];

  return (
    <ProtectedRoute allowedRoles={["admin"]} allowOwner>
      {/* 모바일: 세로 스택(상단 가로 내비) / md+: 좌측 고정 사이드바.
          종전 w-64 고정 사이드바가 폰에서 256px 를 차지해 본문이 ~119px 로 짓눌렸다. */}
      <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
        {/* 사이드바 */}
        <aside className="w-full md:w-64 bg-gray-900 text-white flex-shrink-0">
          <div className="p-4 md:p-6">
            <h2 className="text-lg font-bold">{t("admin.title")}</h2>
            <p className="text-xs text-gray-400 mt-1">{t("admin.subtitle")}</p>
          </div>
          {/* 모바일은 가로 스크롤 탭, md+ 는 세로 목록. */}
          <nav
            className="px-3 pb-3 flex flex-row gap-1 overflow-x-auto md:flex-col md:space-y-1 md:overflow-visible md:pb-0"
            aria-label={t("admin.subtitle")}
          >
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`block whitespace-nowrap shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition ${
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
