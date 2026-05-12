"use client";

/**
 * Header — Design System v2 (2026-05-12)
 *
 *   - 56px topbar, bg-card 흰 표면 + line strong 경계
 *   - 브랜드: brand-dot (gradient gold) + Paperlogy 워드마크
 *   - 메뉴 hover: bg-hover (베이지), 활성: gold-on-light + gold-soft 배경
 *   - 다크 modifier (dark:) 제거 — 사이트 전체 라이트 베이스 정책
 *   - IFL 로고·"Interactive Flipped Learning" 워드 제거
 *
 * 출처: 05-studio-flow.extracted.html §topbar
 */

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
        { href: "/professor/studio", label: t("nav.studio") },
        { href: "/professor/inbox", label: t("nav.inbox") },
        { href: "/professor/analytics", label: t("nav.analytics") },
        { href: "/professor/learners", label: t("nav.learners") },
        { href: "/professor/lecture/new", label: t("nav.newLecture") },
        { href: "/professor/subscription", label: t("nav.subscription") },
      ]
    : user
      ? [{ href: "/dashboard", label: t("nav.myLectures") }]
      : [];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  // 비로그인 + 로그인 모두 노출되는 공개 메뉴.
  // v2: accent 구분 제거. CTA 성격(/demo, /beta-apply) 만 gold 강조, 나머지는
  // 기본 텍스트. 데스크톱 nav 가 너무 화려해지지 않도록 단순화.
  const corePublicLinks = [
    { href: "/demo", label: t("nav.demo"), cta: true },
    { href: "/pricing", label: t("nav.pricing"), cta: false },
    { href: "/beta-apply", label: t("nav.betaApply"), cta: true },
  ];
  const extendedPublicLinks = [
    { href: "/use-cases", label: t("nav.useCases"), cta: false },
    { href: "/trust", label: t("nav.trust"), cta: false },
    { href: "/security", label: t("nav.security"), cta: false },
  ];

  const handleLocaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocale(e.target.value as Locale);
  };

  const closeMenu = () => setMenuOpen(false);

  // 활성 상태 클래스 — gold accent on light surface
  const activeCls = "text-[var(--gold-on-light)] bg-[var(--gold-soft)] font-medium";
  const inactiveCls = "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]";

  return (
    <header className="sticky top-0 z-40 bg-[var(--bg-card)]/90 backdrop-blur border-b border-[var(--line)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center">
          <Link
            href={homeHref}
            className="flex items-center gap-2"
            aria-label="ClassAuto Home"
          >
            {/* brand-dot — 05 prototype §topbar */}
            <span
              aria-hidden="true"
              className="w-5 h-5 rounded-md"
              style={{
                background: "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))",
                boxShadow: "0 2px 6px var(--gold-glow)",
              }}
            />
            <span
              className="text-base font-bold tracking-tight hidden sm:inline"
              style={{ fontFamily: "var(--font-display)" }}
            >
              ClassAuto
            </span>
          </Link>

          {/* 공개 메뉴 (데스크톱) */}
          <nav
            className="hidden sm:flex items-center gap-1 ml-4"
            aria-label={t("nav.public")}
          >
            {corePublicLinks.map((link) => {
              const active = pathname?.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm px-3 py-1.5 rounded-lg transition-colors duration-150 ${
                    active
                      ? activeCls
                      : link.cta
                        ? "text-[var(--gold-on-light)] hover:bg-[var(--gold-soft)]"
                        : inactiveCls
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
            className="text-xs border border-[var(--line)] rounded-lg px-2 py-1 bg-[var(--bg-card)] text-[var(--text-muted)] outline-none focus:border-[var(--gold-on-light)]"
          >
            <option value="ko">{t("language.ko")}</option>
            <option value="en">{t("language.en")}</option>
          </select>

          {/* 로그인 사용자 nav (데스크톱) */}
          {user && (
            <nav className="hidden md:flex items-center gap-1" aria-label={t("nav.lectureManage")}>
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={`text-sm px-3 py-1.5 rounded-lg transition-colors duration-150 ${
                    isActive(link.href) ? activeCls : inactiveCls
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex items-center gap-2 ml-3 pl-3 border-l border-[var(--line)]">
                <span className="text-xs text-[var(--text-subtle)]">
                  {user.role === "professor" ? t("common.professor") : t("common.student")}
                </span>
                <button
                  type="button"
                  onClick={logout}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--warning)] border border-[var(--line)] rounded-lg px-2.5 py-1 transition-colors duration-150"
                >
                  {t("common.logout")}
                </button>
              </div>
            </nav>
          )}

          {/* Mobile hamburger */}
          <button
            type="button"
            data-testid="header-mobile-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            className="md:hidden p-2 text-[var(--text-muted)] hover:text-[var(--text)]"
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

      {/* Mobile dropdown */}
      {menuOpen && (
        <>
          <div className="md:hidden fixed inset-0 top-14 bg-black/20 z-30" onClick={closeMenu} aria-hidden="true" />
          <nav
            id="header-mobile-menu"
            className="md:hidden relative z-40 border-t border-[var(--line)] bg-[var(--bg-card)] px-4 py-3 space-y-1 animate-scale-in"
            aria-label={t("nav.public")}
          >
            {[...corePublicLinks, ...extendedPublicLinks].map((link) => {
              const active = pathname?.startsWith(link.href);
              const slug = link.href.replace(/^\//, "").replace(/\//g, "-");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeMenu}
                  data-testid={`header-mobile-link-${slug}`}
                  className={`block text-sm rounded-lg px-3 py-2 transition-colors duration-150 ${
                    active
                      ? activeCls
                      : link.cta
                        ? "text-[var(--gold-on-light)] hover:bg-[var(--gold-soft)]"
                        : "text-[var(--text)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}

            {user && navLinks.length > 0 && (
              <>
                <div className="my-2 border-t border-[var(--line)]" aria-hidden="true" />
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeMenu}
                    aria-current={isActive(link.href) ? "page" : undefined}
                    className={`block text-sm rounded-lg px-3 py-2 transition-colors duration-150 ${
                      isActive(link.href) ? activeCls : "text-[var(--text)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="pt-2 mt-1 border-t border-[var(--line)] flex items-center justify-between px-3">
                  <span className="text-xs text-[var(--text-subtle)]">
                    {user.role === "professor" ? t("common.professor") : t("common.student")}
                  </span>
                  <button
                    type="button"
                    onClick={logout}
                    className="text-xs text-[var(--warning)] hover:opacity-80 transition-opacity duration-150"
                  >
                    {t("common.logout")}
                  </button>
                </div>
              </>
            )}
          </nav>
        </>
      )}
    </header>
  );
}
