"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import LightMarketingShell from "@/components/marketing/LightMarketingShell";
import EnterpriseSection from "./EnterpriseSection";
import FaqAccordion from "./FaqAccordion";
import LimitsModal from "./LimitsModal";
import LimitsTable from "./LimitsTable";
import PlanCard from "./PlanCard";
import { PLANS, PLAN_ORDER, type PlanId } from "./plans";
import { usePricingHubI18n } from "./usePricingHubI18n";

/**
 * /pricing 페이지 — 2026 베타 모드.
 *
 * 사용자 결정 (2026-05-20): 베타 기간 동안 가격 표기, 월/연 결제 토글, 카드별
 * 결제 CTA 를 모두 제거하고 페이지 하단의 단일 "베타 신청하기" 버튼으로
 * 통합한다. 정책의 결제·해지·환불 섹션도 베타 기간에는 무의미하므로 노출하지
 * 않는다.
 *
 * 섹션 순서:
 *   1. Hero (가격 토글 없음)
 *   2. 3-tier 기능 카드 (가격 없음, 기능 목록 + 세부 한도 보기)
 *   3. 베타 콜아웃 (강조)
 *   4. 한도 비교표
 *   5. 기관 라이선스
 *   6. FAQ
 *   7. 푸터 단일 베타 CTA
 *
 * 베타 종료 후 정식 출시 시 git 이력의 이전 버전을 참고해 가격 표시·토글을
 * 되살리고 PLANS 의 pricing 필드를 그대로 사용하면 된다.
 */
export default function PricingContent() {
  const { t } = usePricingHubI18n();
  const [limitsPlan, setLimitsPlan] = useState<PlanId | null>(null);

  const openLimits = useCallback((id: PlanId) => setLimitsPlan(id), []);
  const closeLimits = useCallback(() => setLimitsPlan(null), []);

  return (
    <LightMarketingShell topCta={{ href: "/beta-apply", label: t("betaCallout.ctaLabel") }}>
      {/* 1. Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-12 text-center">
        <p className="text-[11px] sm:text-xs font-semibold tracking-[0.22em] text-[#B88308] uppercase mb-5">
          {t("hero.eyebrow")}
        </p>
        <h1
          className="text-[#0A0A0A] tracking-tight leading-[1.08]"
          style={{
            fontFamily:
              "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
            fontSize: "clamp(36px, 6vw, 64px)",
            fontWeight: 800,
            letterSpacing: "-0.035em",
          }}
        >
          {t("hero.title")}
        </h1>
        <p className="mt-5 text-base sm:text-lg text-[rgba(10,10,10,0.62)] max-w-2xl mx-auto leading-relaxed">
          {t("hero.subtitle")}
        </p>
      </section>

      {/* 2. 3-tier 기능 카드 (가격 없음) */}
      <section
        aria-labelledby="pricing-plans-heading"
        className="max-w-6xl mx-auto px-4 sm:px-6 pb-16"
      >
        <h2 id="pricing-plans-heading" className="sr-only">
          {t("hero.title")}
        </h2>
        <div
          data-testid="pricing-plan-grid"
          className="grid grid-cols-1 md:grid-cols-3 gap-5"
        >
          {PLAN_ORDER.map((id) => (
            <PlanCard
              key={id}
              plan={PLANS[id]}
              highlighted={id === "basic"}
              onOpenLimits={openLimits}
            />
          ))}
        </div>
      </section>

      {/* 3. 베타 콜아웃 — 강조 */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <aside
          data-testid="pricing-beta-callout"
          className="rounded-2xl border border-[rgba(184,131,8,0.30)] bg-[rgba(255,182,39,0.08)] p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wider uppercase text-[#B88308]">
              {t("betaCallout.title")}
            </p>
            <p className="text-sm sm:text-base text-[rgba(10,10,10,0.78)] mt-2 leading-relaxed">
              {t("betaCallout.body")}
            </p>
          </div>
          <Link
            href={t("betaCallout.ctaHref")}
            data-testid="pricing-beta-callout-cta"
            className="shrink-0 inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold transition motion-reduce:transition-none"
            style={{
              backgroundColor: "#FFB627",
              color: "#1A1A1A",
              boxShadow: "0 8px 24px rgba(255,182,39,0.30)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "#FFC74D")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "#FFB627")
            }
          >
            {t("betaCallout.ctaLabel")} →
          </Link>
        </aside>
      </section>

      {/* 4. 한도 비교표 — 편수·MAU·Q&A 단위 (비용 미노출) */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <LimitsTable />
      </section>

      {/* 5. 기관 라이선스 */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <EnterpriseSection />
      </section>

      {/* 6. FAQ */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <FaqAccordion />
      </section>

      {/* 7. 푸터 단일 베타 CTA */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-24 text-center">
        <h2
          className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0A0A0A]"
          style={{
            fontFamily:
              "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
            letterSpacing: "-0.025em",
          }}
        >
          {t("footerCta.title")}
        </h2>
        <p className="mt-3 text-sm sm:text-base text-[rgba(10,10,10,0.62)]">
          {t("footerCta.body")}
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={t("footerCta.primaryHref")}
            data-testid="pricing-footer-primary"
            className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold transition motion-reduce:transition-none"
            style={{
              backgroundColor: "#FFB627",
              color: "#1A1A1A",
              boxShadow: "0 8px 24px rgba(255,182,39,0.30)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "#FFC74D")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "#FFB627")
            }
          >
            {t("footerCta.primaryLabel")}
          </Link>
          <Link
            href={t("footerCta.secondaryHref")}
            data-testid="pricing-footer-secondary"
            className="inline-flex items-center justify-center rounded-xl border border-[rgba(10,10,10,0.16)] hover:border-[rgba(10,10,10,0.32)] px-6 py-3 text-sm font-semibold text-[#0A0A0A] hover:bg-black/5 transition motion-reduce:transition-none"
          >
            {t("footerCta.secondaryLabel")}
          </Link>
        </div>
      </section>

      <LimitsModal open={limitsPlan !== null} plan={limitsPlan} onClose={closeLimits} />
    </LightMarketingShell>
  );
}
