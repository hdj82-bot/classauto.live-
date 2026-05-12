"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import LightMarketingShell from "@/components/marketing/LightMarketingShell";
import BillingToggle from "./BillingToggle";
import EnterpriseSection from "./EnterpriseSection";
import FaqAccordion from "./FaqAccordion";
import LimitsModal from "./LimitsModal";
import LimitsTable from "./LimitsTable";
import PlanCard from "./PlanCard";
import { PLANS, PLAN_ORDER, type PlanId } from "./plans";
import { usePricingHubI18n } from "./usePricingHubI18n";

interface PolicyItem {
  term: string;
  desc: string;
}

/**
 * /pricing 페이지 v2 — 라이트 베이지(#FAFAF7) + 골드(#FFB627).
 *
 * v1 다크 + amber 셸을 LightMarketingShell 로 교체. 모든 보조 컴포넌트
 * (PlanCard / PriceDisplay / LimitsTable / FaqAccordion 등) 도 라이트로 전환.
 *
 * 섹션 순서:
 *   1. Hero — BillingToggle
 *   2. 3-tier 카드
 *   3. 베타 콜아웃 (Phase 2 학계 무료)
 *   4. 한도 비교표 (편수·MAU·Q&A — 비용 표시 없음)
 *   5. 기관 라이선스
 *   6. 결제·해지·환불 정책
 *   7. FAQ
 *   8. 푸터 CTA
 *
 * 정책 §4.1: 연 결제 기본값 (Anchoring) — `useState("annual")`.
 * 정책 §1.3 (2026-05-06): 비용($/₩/토큰) 미노출, 한도 단위만.
 *
 * 디자인:
 *   - Basic 카드만 골드 채움 (colors.md §3 "CTA 골드 채움 1회만")
 *   - 가격 숫자 = Pretendard tabular-nums 600 (typography.md §1)
 *   - Paperlogy 는 메인 hero 헤딩 1회만
 */
export default function PricingContent() {
  const { t, tValue } = usePricingHubI18n();
  const [cycle, setCycle] = useState<"monthly" | "annual">("annual");
  const [limitsPlan, setLimitsPlan] = useState<PlanId | null>(null);

  const openLimits = useCallback((id: PlanId) => setLimitsPlan(id), []);
  const closeLimits = useCallback(() => setLimitsPlan(null), []);

  const policyItems = tValue<PolicyItem[]>("policies.items") ?? [];

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
        <div className="mt-8 flex justify-center">
          <BillingToggle cycle={cycle} onChange={setCycle} />
        </div>
      </section>

      {/* 2. 3-tier 카드 */}
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
              cycle={cycle}
              highlighted={id === "basic"}
              onOpenLimits={openLimits}
            />
          ))}
        </div>
      </section>

      {/* 3. 베타 콜아웃 */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <aside
          data-testid="pricing-beta-callout"
          className="rounded-2xl border border-[rgba(184,131,8,0.30)] bg-[rgba(255,182,39,0.06)] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wider uppercase text-[#B88308]">
              {t("betaCallout.title")}
            </p>
            <p className="text-sm text-[rgba(10,10,10,0.72)] mt-1 leading-relaxed">
              {t("betaCallout.body")}
            </p>
          </div>
          <Link
            href={t("betaCallout.ctaHref")}
            className="shrink-0 inline-flex items-center justify-center rounded-xl border border-[#B88308] text-[#B88308] hover:bg-[#B88308] hover:text-white px-4 py-2 text-sm font-semibold transition motion-reduce:transition-none"
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

      {/* 6. 결제·해지·환불 정책 */}
      <section
        aria-labelledby="pricing-policies-heading"
        className="max-w-5xl mx-auto px-4 sm:px-6 pb-16"
      >
        <h2
          id="pricing-policies-heading"
          className="text-xl font-semibold tracking-tight text-[#0A0A0A] mb-5"
        >
          {t("policies.title")}
        </h2>
        <dl
          data-testid="pricing-policies"
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          {policyItems.map((p, i) => (
            <div
              key={i}
              data-testid={`pricing-policy-${i}`}
              className="rounded-2xl border border-[rgba(10,10,10,0.08)] bg-white p-5 shadow-[0_1px_2px_rgba(10,10,10,0.04)]"
            >
              <dt className="text-sm font-semibold text-[#0A0A0A]">{p.term}</dt>
              <dd className="text-xs text-[rgba(10,10,10,0.62)] mt-1.5 leading-relaxed">
                {p.desc}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 7. FAQ */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <FaqAccordion />
      </section>

      {/* 8. 푸터 CTA */}
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
