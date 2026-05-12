"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n, type Locale } from "@/contexts/I18nContext";
import tokens from "./tokens-v2.module.css";
import GradientDefs from "./GradientDefs";

/**
 * StudentSurfaceLight — 학생 측 라이트 톤(=영상 없음) 페이지의 공통 래퍼.
 *
 * 적용 대상: /v/[slug] · /auth/signup · /auth/complete-profile · /expired ·
 *           /lecture/[slug]/assess.
 *
 * - colors.md §1 의 "영상이 없으면 라이트" 규칙을 따른다.
 * - aurora light(미세 그라데이션 메쉬)를 fixed layer 로 항상 깔아주되,
 *   `prefers-reduced-motion: reduce` 사용자에게는 모듈 CSS 가 정지시킨다.
 * - 토큰(--gold, --text-light, ...)을 surfaceLight 클래스에 묶어두어
 *   글로벌 `:root` 와 충돌하지 않는다(`globals.css` 와 직교).
 * - GradientDefs(공유 <defs>) 와 brandbar 도 여기서 단일 마운트.
 */
export interface StudentSurfaceLightProps {
  children: ReactNode;
  /** 브랜드바를 숨기고 콘텐츠로만 채우고 싶을 때 (예: full-bleed 인터스티셜). */
  bare?: boolean;
}

export default function StudentSurfaceLight({
  children,
  bare = false,
}: StudentSurfaceLightProps) {
  return (
    <main className={tokens.surfaceLight}>
      <div className={tokens.auroraLight} aria-hidden="true" />
      <GradientDefs />
      {!bare && <BrandBar />}
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </main>
  );
}

function BrandBar() {
  const { t, locale, setLocale } = useI18n();
  // 작은 토글 — 클릭 시 ko ↔ en 토글 (디자인 시스템: 우상단 작게).
  // 06 prototype 의 .lang-toggle 이 그대로 옮겨왔다 (텍스트 "KO" / "EN").
  const next: Locale = locale === "ko" ? "en" : "ko";
  return (
    <header className={tokens.brandbar}>
      <Link
        href="/"
        className={tokens.brand}
        style={{ textDecoration: "none", color: "inherit" }}
      >
        <span className={tokens.brandMark} aria-hidden="true" />
        <span>ClassAuto</span>
      </Link>
      <button
        type="button"
        className={tokens.langToggle}
        onClick={() => setLocale(next)}
        aria-label={t("common.language")}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
        <span>{locale.toUpperCase()}</span>
      </button>
    </header>
  );
}
