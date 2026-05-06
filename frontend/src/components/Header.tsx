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
    : user
      ? [{ href: "/dashboard", label: t("nav.myLectures") }]
      : [];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  // 비로그인 + 로그인 모두 노출되는 공개 메뉴.
  // - corePublicLinks: 데스크톱 nav + 모바일 드롭다운 둘 다. 핵심 진입로.
  // - extendedPublicLinks: 모바일 드롭다운 전용. marketing 페이지 (use-cases /
  //   trust / security). 데스크톱은 빽빽해지지 않게 모바일에서만 노출.
  // - betaApply 는 amber 강조 (CTA 성격).
  const corePublicLinks = [
    { href: "/demo", label: t("nav.demo"), accent: "amber" as const },
    { href: "/pricing", label: t("nav.pricing"), accent: "indigo" as const },
    { href: "/beta-apply", label: t("nav.betaApply"), accent: "amber" as const },
  ];
  const extendedPublicLinks = [
    { href: "/use-cases", label: t("nav.useCases"), accent: "indigo" as const },
    { href: "/trust", label: t("nav.trust"), accent: "indigo" as const },
    { href: "/security", label: t("nav.security"), accent: "indigo" as const },
  ];

  const handleLocaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocale(e.target.value as Locale);
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center">
          <Link href={homeHref} className="flex items-center gap-2" aria-label="IFL Platform Home">
            <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold" aria-hidden="true">IFL</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 hidden sm:inline">Interactive Flipped Learning</span>
          </Link>
          {/* 비로그인 + 로그인 모두 노출되는 공개 메뉴 (데스크톱) — /demo 는 베타 신청 전환 1순위 진입로. */}
          <nav
            className="hidden sm:flex items-center gap-1 ml-3"
            aria-label={t("nav.public")}
          >
            {corePublicLinks.map((link) => {
              const active = pathname?.startsWith(link.href);
              const activeCls = link.accent === "amber"
                ? "text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 font-medium"
                : "text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 font-medium";
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm px-3 py-1.5 rounded-lg transition ${
                    active
                      ? activeCls
                      : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {/* Language Selector */}
          <label htmlFor="lang-select" className="sr-only">{t("common.language")}</label>
          <select
            id="lang-select"
            value={locale}
            onChange={handleLocaleChange}
            className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 outline-none focus:border-indigo-500"
          >
            <option value="ko">{t("language.ko")}</option>
            <option value="en">{t("language.en")}</option>
          </select>

          {/* Desktop navigation — 로그인 사용자 전용 (lectureManage / newLecture / subscription / myLectures) */}
          {user && (
            <nav className="hidden md:flex items-center gap-1" aria-label={t("nav.lectureManage")}>
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={`text-sm px-3 py-1.5 rounded-lg transition ${
                    isActive(link.href)
                      ? "text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 font-medium"
                      : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex items-center gap-2 ml-3 pl-3 border-l border-gray-200 dark:border-gray-700">
                <span className="text-xs text-gray-400 dark:text-gray-500">{user.role === "professor" ? t("common.professor") : t("common.student")}</span>
                <button type="button" onClick={logout} className="text-xs text-gray-500 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1 transition">
                  {t("common.logout")}
                </button>
              </div>
            </nav>
          )}

          {/* Mobile hamburger — 비로그인 사용자도 표시 (R2W1: /demo, /pricing 모바일 진입). */}
          <button
            type="button"
            data-testid="header-mobile-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            className="md:hidden p-2 text-gray-600 dark:text-gray-300"
            aria-label={t("common.menu")}
            aria-expanded={menuOpen}
            aria-controls="header-mobile-menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu — 비로그인은 /demo, /pricing 만. 로그인은 기존 navLinks + 로그아웃 추가. */}
      {menuOpen && (
        <>
          <div className="md:hidden fixed inset-0 top-14 bg-black/20 dark:bg-black/50 z-30" onClick={closeMenu} aria-hidden="true" />
          <nav
            id="header-mobile-menu"
            className="md:hidden relative z-40 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 space-y-1 animate-scale-in"
            aria-label={t("nav.public")}
          >
            {/* 공개 메뉴 — 항상 노출 (core + extended). data-testid 는 첫 path 단어 기준. */}
            {[...corePublicLinks, ...extendedPublicLinks].map((link) => {
              const active = pathname?.startsWith(link.href);
              const activeCls = link.accent === "amber"
                ? "text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 font-medium"
                : "text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 font-medium";
              const slug = link.href.replace(/^\//, "").replace(/\//g, "-");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeMenu}
                  data-testid={`header-mobile-link-${slug}`}
                  className={`block text-sm rounded-lg px-3 py-2 transition ${
                    active
                      ? activeCls
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}

            {/* 로그인 사용자 전용 메뉴 */}
            {user && navLinks.length > 0 && (
              <>
                <div className="my-2 border-t border-gray-100 dark:border-gray-800" aria-hidden="true" />
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeMenu}
                    aria-current={isActive(link.href) ? "page" : undefined}
                    className={`block text-sm rounded-lg px-3 py-2 transition ${
                      isActive(link.href)
                        ? "text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 font-medium"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="pt-2 mt-1 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between px-3">
                  <span className="text-xs text-gray-400 dark:text-gray-500">{user.role === "professor" ? t("common.professor") : t("common.student")}</span>
                  <button type="button" onClick={logout} className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition">{t("common.logout")}</button>
                </div>
              </>
            )}
          </nav>
        </>
      )}
    </header>
  );
}
