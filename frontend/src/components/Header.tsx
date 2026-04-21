"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type Locale } from "@/contexts/I18nContext";

export default function Header() {
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const homeHref = user?.role === "professor" ? "/professor/dashboard" : "/dashboard";

  const navLinks = user?.role === "professor"
    ? [
        { href: "/professor/dashboard", label: t("nav.lectureManage") },
        { href: "/professor/lecture/new", label: t("nav.newLecture") },
        { href: "/professor/subscription", label: t("nav.subscription") },
      ]
    : [{ href: "/dashboard", label: t("nav.myLectures") }];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const handleLocaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocale(e.target.value as Locale);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href={homeHref} className="flex items-center gap-2" aria-label="IFL Platform Home">
          <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold" aria-hidden="true">IFL</span>
          <span className="text-sm font-semibold text-gray-900 hidden sm:inline">Interactive Flipped Learning</span>
        </Link>

        <div className="flex items-center gap-2">
          {/* Language Selector */}
          <label htmlFor="lang-select" className="sr-only">{t("common.language")}</label>
          <select
            id="lang-select"
            value={locale}
            onChange={handleLocaleChange}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600 outline-none focus:border-indigo-500"
          >
            <option value="ko">한국어</option>
            <option value="en">English</option>
          </select>

          {user && (
            <>
              {/* Desktop navigation */}
              <nav className="hidden md:flex items-center gap-1" aria-label={t("nav.lectureManage")}>
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={isActive(link.href) ? "page" : undefined}
                    className={`text-sm px-3 py-1.5 rounded-lg transition ${
                      isActive(link.href)
                        ? "text-indigo-700 bg-indigo-50 font-medium"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="flex items-center gap-2 ml-3 pl-3 border-l border-gray-200">
                  <span className="text-xs text-gray-400">{user.role === "professor" ? t("common.professor") : t("common.student")}</span>
                  <button onClick={logout} className="text-xs text-gray-500 hover:text-red-600 border border-gray-200 rounded-lg px-2.5 py-1 transition">
                    {t("common.logout")}
                  </button>
                </div>
              </nav>

              {/* Mobile hamburger */}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="md:hidden p-2 text-gray-600"
                aria-label={t("common.menu")}
                aria-expanded={menuOpen}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  {menuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {user && menuOpen && (
        <>
          <div className="md:hidden fixed inset-0 top-14 bg-black/20 z-30" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <nav className="md:hidden relative z-40 border-t border-gray-200 bg-white px-4 py-3 space-y-1 animate-scale-in" aria-label={t("nav.lectureManage")}>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`block text-sm rounded-lg px-3 py-2 transition ${
                  isActive(link.href)
                    ? "text-indigo-700 bg-indigo-50 font-medium"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-2 mt-1 border-t border-gray-100 flex items-center justify-between px-3">
              <span className="text-xs text-gray-400">{user.role === "professor" ? t("common.professor") : t("common.student")}</span>
              <button onClick={logout} className="text-xs text-red-500 hover:text-red-700 transition">{t("common.logout")}</button>
            </div>
          </nav>
        </>
      )}
    </header>
  );
}
