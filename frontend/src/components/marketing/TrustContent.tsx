"use client";

import Link from "next/link";
import LightMarketingShell from "./LightMarketingShell";
import PrincipleCard from "./PrincipleCard";
import InfoBlock from "./InfoBlock";
import { useMarketingI18n } from "./useMarketingI18n";

const SECTION_KEYS = ["collected", "access", "deletion", "location"] as const;

const PRINCIPLE_ICONS = {
  ragLimit:
    "M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  transparentCost:
    "M9 7h6m0 0v6m0-6L9 13M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z",
  antiCheat:
    "M12 9v3m0 3h.01M5 13l4-7 6 7-3 5H8l-3-5zm14 6h-2a4 4 0 11-8 0H5",
  studentData:
    "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
} as const;

/**
 * /trust v2 — 학생 데이터 보호 페이지. 라이트 베이지 + 골드.
 *
 * 4가지 약속 카드 + 4가지 세부 영역 (수집·접근·삭제·저장) + 학생 권리 강조 카드.
 *
 * 정책 근거:
 *   - docs/planning/07-additional-pages.md §2
 *   - docs/planning/01-pricing-policy.md §1.3 — '비용 투명성' → '한도 투명성'
 *     로 변경 (기존 키 'transparentCost' 는 호환 위해 유지하되 카피 갱신은
 *     별도 PR)
 */
export default function TrustContent() {
  const { t, tValue } = useMarketingI18n();

  return (
    <LightMarketingShell
      topCta={{ href: "/contact", label: t("common.ctaContactSales") }}
    >
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-12 text-center">
        <p className="text-[11px] sm:text-xs font-semibold tracking-[0.22em] text-[#B88308] uppercase mb-5">
          {t("trust.hero.eyebrow")}
        </p>
        <h1
          className="text-[#0A0A0A] tracking-tight leading-[1.08]"
          style={{
            fontFamily:
              "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
            fontSize: "clamp(34px, 5.5vw, 60px)",
            fontWeight: 800,
            letterSpacing: "-0.035em",
          }}
        >
          {t("trust.hero.title")}
        </h1>
        <p className="mt-5 text-base sm:text-lg text-[rgba(10,10,10,0.62)] max-w-2xl mx-auto leading-relaxed">
          {t("trust.hero.subtitle")}
        </p>
      </section>

      {/* 4 promises */}
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 pb-16"
        aria-labelledby="trust-promises"
      >
        <h2
          id="trust-promises"
          className="text-xl font-semibold tracking-tight text-[#0A0A0A] mb-6"
        >
          {t("trust.principles.title")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <PrincipleCard
            title={t("trust.principles.items.ragLimit.title")}
            description={t("trust.principles.items.ragLimit.description")}
            icon={PRINCIPLE_ICONS.ragLimit}
            accent="violet"
          />
          <PrincipleCard
            title={t("trust.principles.items.transparentCost.title")}
            description={t("trust.principles.items.transparentCost.description")}
            icon={PRINCIPLE_ICONS.transparentCost}
            accent="gold"
          />
          <PrincipleCard
            title={t("trust.principles.items.antiCheat.title")}
            description={t("trust.principles.items.antiCheat.description")}
            icon={PRINCIPLE_ICONS.antiCheat}
            accent="cyan"
          />
          <PrincipleCard
            title={t("trust.principles.items.studentData.title")}
            description={t("trust.principles.items.studentData.description")}
            icon={PRINCIPLE_ICONS.studentData}
            accent="pink"
          />
        </div>
      </section>

      {/* Detail blocks */}
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 pb-16"
        aria-label="trust-details"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {SECTION_KEYS.map((key) => {
            const items = tValue<string[]>(`trust.sections.${key}.items`) ?? [];
            return (
              <InfoBlock
                key={key}
                title={t(`trust.sections.${key}.title`)}
                items={items}
              />
            );
          })}
        </div>
      </section>

      {/* Student rights */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        <InfoBlock
          tone="highlight"
          title={t("trust.rights.title")}
          items={tValue<string[]>("trust.rights.items") ?? []}
        />
        <p className="mt-4 text-sm text-[rgba(10,10,10,0.62)]">
          {t("trust.rights.contact")}
        </p>
        <p className="mt-6 text-xs text-[rgba(10,10,10,0.45)]">
          {t("trust.footerLink")}{" "}
          <Link
            href="/privacy"
            className="text-[#B88308] hover:text-[#E89E0B] hover:underline font-medium transition motion-reduce:transition-none"
          >
            /privacy →
          </Link>
        </p>
      </section>
    </LightMarketingShell>
  );
}
