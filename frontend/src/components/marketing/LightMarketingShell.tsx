"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { useI18n, type Locale } from "@/contexts/I18nContext";
import { useMarketingI18n } from "./useMarketingI18n";

/**
 * 상단 1차 내비게이션 링크. 데스크탑 nav 와 모바일 드롭다운이 동일 배열을
 * 공유하여 항목이 어긋나지 않게 한다. 라벨은 marketing.common.* i18n 키.
 */
const NAV_LINKS = [
  { href: "/features", key: "common.navFeatures" },
  { href: "/student-guide", key: "common.navStudentGuide" },
  { href: "/analytics-example", key: "common.navAnalytics" },
  { href: "/comprehensive-analysis", key: "common.navComprehensive" },
  { href: "/pricing", key: "common.navPricing" },
  { href: "/use-cases", key: "common.navUseCases" },
  { href: "/board", key: "common.navBoard" },
] as const;

/**
 * v2 라이트 마케팅 셸 — 라이트 베이지(#FAFAF7) + 골드(#FFB627) dual surface
 * 정책에 맞춘 상단/하단 chrome. `/use-cases`, `/trust`, `/security`,
 * `/beta-apply`, `/contact`, `/changelog`, `/help`, `/privacy`, `/terms` 에서
 * 공통으로 얹는다.
 *
 * 기존 `MarketingShell` (다크 + amber) 은 v1 흔적이라 v2 마케팅 페이지에서
 * 더는 쓰지 않는다. 그러나 다른 워크트리·페이지가 의존할 가능성이 있어
 * 본 파일과 별도로 그대로 둔다.
 *
 * 설계 근거:
 *   - docs/design-system/colors.md §1 — 메인 마케팅은 라이트 베이스
 *   - docs/design-system/typography.md §1 — 본문 Pretendard, 헤딩 Paperlogy
 *   - docs/design-system/icons.md — IFL 로고 폐기, CA 워드마크만 사용
 *   - docs/planning/01-pricing-policy.md §5 — 헤더 CTA 는 /beta-apply
 *
 * 토큰 fallback: 창 1 (design-system) 워크트리에서 `--font-display` /
 * `--font-body` 변수를 globals.css 에 정의하기 전까지도 동작하도록
 * fontFamily 에 한 줄 fallback 체인을 명시. 토큰이 들어오면 자동 우선 적용.
 */
export default function LightMarketingShell({
  children,
  /** 상단 우측 추가 CTA (기본 = 베타 신청). 페이지에서 override 가능. */
  topCta,
  /** 본문 영역 배경을 살짝 다른 톤(`#F6F4EE`)으로 그라데이션 처리할지. */
  variant = "default",
}: {
  children: React.ReactNode;
  topCta?: { href: string; label: string };
  variant?: "default" | "soft";
}) {
  const { t } = useMarketingI18n();
  // marketing t() 는 `marketing.*` subtree 만 본다. `nav.dashboard` /
  // `common.logout` 같은 본체 top-level 키는 useI18n().t 로 직접 조회.
  const { locale, setLocale, t: tRoot } = useI18n();
  // 마케팅 셸은 `<AuthProvider>` 가 없는 vitest 환경에서도 그대로 렌더되어야
  // 하므로 `useOptionalAuth` 를 쓴다 — Provider 가 없으면 ctx === null, 비로그인
  // 분기로 자연스럽게 떨어진다.
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const logout = auth?.logout ?? null;
  const [menuOpen, setMenuOpen] = useState(false);

  const finalCta =
    topCta ?? { href: "/beta-apply", label: t("common.ctaApplyBeta") };

  // 로그인된 교수자가 `/` 같은 마케팅 화면으로 돌아왔을 때, 우측 상단이
  // "베타 신청 / 로그인" 비로그인 UI 그대로면 로그아웃된 것처럼 보인다.
  // user 가 살아있으면 1차 액션을 "내 대시보드"·"로그아웃" 으로 교체한다.
  // (베타 신청 CTA 는 이미 베타 사용자에게는 의미가 없어 함께 숨김.)
  // role 별 대시보드 라우트: professor → /professor/dashboard,
  // admin → /admin, 그 외(student) → /dashboard.
  const dashboardHref =
    user?.role === "professor"
      ? "/professor/dashboard"
      : user?.role === "admin"
        ? "/admin"
        : "/dashboard";

  // 모바일 메뉴: Escape 로 닫기 + 데스크탑(>=768px) 으로 넓어지면 자동으로 닫아
  // 리사이즈 시 패널이 떠 있는 상태가 남지 않게 한다.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onChange);
    return () => {
      window.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onChange);
    };
  }, [menuOpen]);

  return (
    <div
      className="min-h-screen text-[#0A0A0A] antialiased"
      style={{
        backgroundColor: variant === "soft" ? "#F6F4EE" : "#FAFAF7",
        fontFamily:
          "var(--font-body, 'Pretendard Variable'), 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
      }}
    >
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#FAFAF7]/80 border-b border-[rgba(10,10,10,0.08)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* 사용자 결정 2026-05-13 PM: /demo 의 DemoTopBar 와 동일한 brand
              규격으로 통일. 28px 골드 박스 + 방패+체크 SVG + 20px Paperlogy 800
              워드마크. 'CA' 워드마크가 demo 보다 작아 보이던 불일치 해소.
              demo-v3.css 의 .ca-* 스타일은 demo 페이지 전용 import 라 본
              컴포넌트는 inline style 로 동일 규격을 직접 박는다. */}
          <Link
            href="/"
            className="flex items-center group transition-transform motion-reduce:transition-none hover:scale-[1.02]"
            aria-label="ClassAuto home"
            style={{
              gap: "10px",
              fontFamily:
                "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
              fontWeight: 800,
              fontSize: "20px",
              letterSpacing: "-0.03em",
              color: "#0A0A0A",
            }}
          >
            <span
              aria-hidden="true"
              className="flex items-center justify-center text-white"
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #FFB627, #E89E0E)",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="16"
                height="16"
              >
                <path d="M5 6.5l7-3 7 3v6c0 4-3 6.7-7 8.5-4-1.8-7-4.5-7-8.5v-6z" />
                <path d="M9 11.5l2.2 2.2L15 9.5" />
              </svg>
            </span>
            <span className="hidden sm:inline">ClassAuto</span>
          </Link>

          <nav
            className="hidden md:flex items-center gap-1 text-sm text-[rgba(10,10,10,0.62)]"
            aria-label={t("common.primaryNavLabel")}
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-3 py-1.5 rounded-lg hover:text-[#0A0A0A] hover:bg-black/5 transition motion-reduce:transition-none"
              >
                {t(link.key)}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <label htmlFor="marketing-lang" className="sr-only">
              {t("common.languageSwitcherLabel")}
            </label>
            <select
              id="marketing-lang"
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              className="text-xs bg-transparent border border-[rgba(10,10,10,0.12)] rounded-lg px-2 py-1 text-[rgba(10,10,10,0.62)] outline-none focus:border-[#B88308] hover:border-[rgba(10,10,10,0.24)] transition motion-reduce:transition-none"
            >
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </select>

            {user ? (
              <>
                {/* 로그인 상태: 1차 CTA 골드 버튼을 "내 대시보드" 로 교체.
                    베타 신청은 이미 베타 사용자에게 의미 없어 숨김. */}
                <Link
                  href={dashboardHref}
                  className="inline-flex items-center text-xs font-semibold rounded-lg px-3 py-1.5 transition motion-reduce:transition-none"
                  style={{
                    backgroundColor: "#FFB627",
                    color: "#1A1A1A",
                    boxShadow: "0 1px 2px rgba(184,131,8,0.18)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#FFC74D";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#FFB627";
                  }}
                >
                  {tRoot("nav.dashboard")}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    void logout?.();
                  }}
                  className="hidden sm:inline-flex items-center text-xs font-semibold rounded-lg px-3 py-1.5 border border-[rgba(10,10,10,0.16)] text-[rgba(10,10,10,0.72)] hover:text-[#0A0A0A] hover:border-[#B88308] hover:bg-black/[0.03] transition motion-reduce:transition-none"
                >
                  {tRoot("common.logout")}
                </button>
              </>
            ) : (
              <>
                <Link
                  href={finalCta.href}
                  className="inline-flex items-center text-xs font-semibold rounded-lg px-3 py-1.5 transition motion-reduce:transition-none"
                  style={{
                    backgroundColor: "#FFB627",
                    color: "#1A1A1A",
                    boxShadow: "0 1px 2px rgba(184,131,8,0.18)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#FFC74D";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#FFB627";
                  }}
                >
                  {finalCta.label}
                </Link>

                {/* 사용자 결정 2026-05-18 (01-pricing-policy.md §5.3): 베타
                    기간 공개 회원가입은 막되, 베타 승인 교수자가 들어올
                    로그인 진입점은 대문 상단에 노출. 순서 = 언어 · 베타 신청
                    · 로그인. 베타 신청이 1차 CTA(골드 솔리드)이므로 로그인은
                    ghost(보더) 로 위계 분리. 좁은 화면에서는 햄버거 메뉴 안
                    으로 흡수 (sm 미만 hidden). */}
                <Link
                  href="/auth/login"
                  className="hidden sm:inline-flex items-center text-xs font-semibold rounded-lg px-3 py-1.5 border border-[rgba(10,10,10,0.16)] text-[rgba(10,10,10,0.72)] hover:text-[#0A0A0A] hover:border-[#B88308] hover:bg-black/[0.03] transition motion-reduce:transition-none"
                >
                  {t("common.navLogin")}
                </Link>
                {/* 회원가입 — 첫 방문자 진입점. 로그인과 분리해 '다시 오신 걸 환영합니다'
                    가 신규에게 뜨지 않게 한다(로그인 페이지 ?mode=signup 으로 문구 분기). */}
                <Link
                  href="/auth/login?mode=signup"
                  className="hidden sm:inline-flex items-center text-xs font-semibold rounded-lg px-3 py-1.5 border border-[rgba(10,10,10,0.16)] text-[rgba(10,10,10,0.72)] hover:text-[#0A0A0A] hover:border-[#B88308] hover:bg-black/[0.03] transition motion-reduce:transition-none"
                >
                  {t("common.navSignup")}
                </Link>
              </>
            )}

            {/* 모바일 햄버거 — md 미만에서만 노출. 데스크탑은 위 <nav> 가 보임. */}
            <button
              type="button"
              className="md:hidden inline-flex items-center justify-center w-9 h-9 -mr-1 rounded-lg text-[#0A0A0A] hover:bg-black/5 transition motion-reduce:transition-none"
              aria-label={t("common.primaryNavLabel")}
              aria-expanded={menuOpen}
              aria-controls="mobile-primary-nav"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="22"
                height="22"
                aria-hidden="true"
              >
                {menuOpen ? (
                  <path d="M6 6l12 12M18 6L6 18" />
                ) : (
                  <path d="M3 6h18M3 12h18M3 18h18" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* 모바일 1차 내비게이션 드롭다운 — sticky 헤더 바로 아래에 펼쳐진다.
            데스크탑(md+) 에서는 위 <nav> 가 담당하므로 md:hidden. */}
        {menuOpen && (
          <nav
            id="mobile-primary-nav"
            className="md:hidden border-t border-[rgba(10,10,10,0.08)] bg-[#FAFAF7]/95 backdrop-blur-md"
            aria-label={t("common.primaryNavLabel")}
          >
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex flex-col">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="px-2 py-3 text-sm text-[rgba(10,10,10,0.72)] border-b border-[rgba(10,10,10,0.06)] last:border-b-0 hover:text-[#0A0A0A] transition motion-reduce:transition-none"
                >
                  {t(link.key)}
                </Link>
              ))}
              {/* 좁은 화면에선 헤더 우측 로그인/로그아웃 버튼이 숨겨지므로
                  메뉴 안에 둔다 — 인증 상태에 따라 분기. */}
              {user ? (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void logout?.();
                  }}
                  className="px-2 py-3 text-sm font-semibold text-[#0A0A0A] hover:text-[#B88308] transition motion-reduce:transition-none text-left"
                >
                  {tRoot("common.logout")}
                </button>
              ) : (
                <>
                  <Link
                    href="/auth/login"
                    onClick={() => setMenuOpen(false)}
                    className="px-2 py-3 text-sm font-semibold text-[#0A0A0A] hover:text-[#B88308] transition motion-reduce:transition-none"
                  >
                    {t("common.navLogin")}
                  </Link>
                  <Link
                    href="/auth/login?mode=signup"
                    onClick={() => setMenuOpen(false)}
                    className="px-2 py-3 text-sm font-semibold text-[#0A0A0A] hover:text-[#B88308] transition motion-reduce:transition-none"
                  >
                    {t("common.navSignup")}
                  </Link>
                </>
              )}
            </div>
          </nav>
        )}
      </header>

      <main>{children}</main>

      <footer className="border-t border-[rgba(10,10,10,0.08)] mt-24 bg-white/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-2">
              <span
                className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-[#1A1A1A]"
                style={{
                  background:
                    "linear-gradient(135deg, #FFC74D 0%, #FFB627 100%)",
                }}
                aria-hidden="true"
              >
                CA
              </span>
              <span className="text-sm font-semibold text-[#0A0A0A]">
                ClassAuto
              </span>
            </div>

            <nav
              className="grid grid-cols-2 sm:flex sm:flex-wrap gap-x-5 gap-y-2 text-xs text-[rgba(10,10,10,0.62)]"
              aria-label={t("common.footerNavLabel")}
            >
              <Link href="/use-cases" className="hover:text-[#0A0A0A] transition motion-reduce:transition-none">
                {t("common.navUseCases")}
              </Link>
              <Link href="/trust" className="hover:text-[#0A0A0A] transition motion-reduce:transition-none">
                {t("common.navTrust")}
              </Link>
              <Link href="/security" className="hover:text-[#0A0A0A] transition motion-reduce:transition-none">
                {t("common.navSecurity")}
              </Link>
              <Link href="/beta-apply" className="hover:text-[#0A0A0A] transition motion-reduce:transition-none">
                {t("common.navBeta")}
              </Link>
              <Link href="/contact" className="hover:text-[#0A0A0A] transition motion-reduce:transition-none">
                {t("common.navContact")}
              </Link>
              <Link href="/changelog" className="hover:text-[#0A0A0A] transition motion-reduce:transition-none">
                {t("common.navChangelog")}
              </Link>
              <Link href="/help" className="hover:text-[#0A0A0A] transition motion-reduce:transition-none">
                {t("common.navHelp")}
              </Link>
              <Link href="/privacy" className="hover:text-[#0A0A0A] transition motion-reduce:transition-none">
                {t("common.navPrivacy")}
              </Link>
              <Link href="/terms" className="hover:text-[#0A0A0A] transition motion-reduce:transition-none">
                {t("common.navTerms")}
              </Link>
            </nav>
          </div>

          <div className="mt-8 pt-6 border-t border-[rgba(10,10,10,0.06)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-[rgba(10,10,10,0.45)]">
            <p>{t("common.footerCopyright")}</p>
            <p className="tabular-nums">{t("common.footerTagline")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
