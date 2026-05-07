"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import MarketingShell from "@/components/marketing/MarketingShell";
import SectionHeader from "@/components/marketing/SectionHeader";
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
 * /pricing 페이지의 콘텐츠 본체.
 *
 * 페이지 라우트(`src/app/pricing/page.tsx`) 는 메타데이터만 들고 본 컴포넌트를
 * 렌더한다 — `MarketingShell` 의 다크 + 골드 + 오로라 배경 + locale 토글
 * 인프라를 그대로 재사용한다.
 *
 * 섹션 순서:
 *   1. Hero (BillingToggle)
 *   2. 3-tier 카드
 *   3. 베타 콜아웃
 *   4. 한도 비교표
 *   5. 기관 라이선스
 *   6. 결제·해지·환불 정책
 *   7. FAQ
 *   8. 푸터 CTA
 *
 * 정책 §4.1: **연 결제 기본값** (Anchoring 효과) — `useState("annual")`.
 */
export default function PricingContent() {
  const { t, tValue } = usePricingHubI18n();
  const [cycle, setCycle] = useState<"monthly" | "annual">("annual");
  const [limitsPlan, setLimitsPlan] = useState<PlanId | null>(null);

  const openLimits = useCallback((id: PlanId) => setLimitsPlan(id), []);
  const closeLimits = useCallback(() => setLimitsPlan(null), []);

  const policyItems = tValue<PolicyItem[]>("policies.items") ?? [];

  return (
    <MarketingShell topCta={{ href: "/beta-apply", label: t("betaCallout.ctaLabel") }}>
      {/* 1. Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-10">
        <SectionHeader
          eyebrow={t("hero.eyebrow")}
          title={t("hero.title")}
          subtitle={t("hero.subtitle")}
        />
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
          className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.04] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wider uppercase text-amber-300">
              {t("betaCallout.title")}
            </p>
            <p className="text-sm text-white/75 mt-1 leading-relaxed">
              {t("betaCallout.body")}
            </p>
          </div>
          <Link
            href={t("betaCallout.ctaHref")}
            className="shrink-0 inline-flex items-center justify-center rounded-xl border border-amber-400/50 text-amber-300 hover:bg-amber-400/10 px-4 py-2 text-sm font-semibold transition"
          >
            {t("betaCallout.ctaLabel")} →
          </Link>
        </aside>
      </section>

      {/* 4. 한도 비교표 */}
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
          className="text-xl font-semibold tracking-tight text-white mb-5"
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
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
            >
              <dt className="text-sm font-semibold text-white">{p.term}</dt>
              <dd className="text-xs text-white/60 mt-1.5 leading-relaxed">
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
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          {t("footerCta.title")}
        </h2>
        <p className="mt-3 text-sm sm:text-base text-white/60">
          {t("footerCta.body")}
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={t("footerCta.primaryHref")}
            data-testid="pricing-footer-primary"
            className="inline-flex items-center justify-center rounded-xl border border-white/20 hover:border-white/40 px-6 py-3 text-sm font-semibold text-white transition"
          >
            {t("footerCta.primaryLabel")}
          </Link>
          <Link
            href={t("footerCta.secondaryHref")}
            data-testid="pricing-footer-secondary"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 hover:border-white/30 px-6 py-3 text-sm font-medium text-white/70 hover:text-white transition"
          >
            {t("footerCta.secondaryLabel")}
          </Link>
        </div>
      </section>

      <LimitsModal open={limitsPlan !== null} plan={limitsPlan} onClose={closeLimits} />
    </MarketingShell>
  );
}
