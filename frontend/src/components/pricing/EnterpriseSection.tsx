"use client";

import Link from "next/link";
import { usePricingHubI18n } from "./usePricingHubI18n";

/**
 * 기관 라이선스 별도 섹션.
 *
 * `01-pricing-policy.md` §2.4 의 항목들을 그대로 노출 — 학생 수 무제한,
 * 멀티 테넌트, SSO, SLA 99.9%, 전담 컨설팅. 결제 흐름이 별도(`/contact`) 라
 * Stripe Checkout 으로 이어지지 않는다.
 *
 * 디자인: 다크 + 골드 톤. 카드 골드 강조와 구분되도록 골드는 보조 (CTA outline +
 * 아이콘만), 채움 골드 CTA 는 페이지 전체에 1번 (PlanCard Basic) 만 — colors.md
 * §3 "CTA 버튼 1개당 골드 채움 1번만".
 */
export default function EnterpriseSection() {
  const { t, tValue } = usePricingHubI18n();
  const items = tValue<string[]>("enterprise.items") ?? [];

  return (
    <section
      data-testid="pricing-enterprise"
      aria-labelledby="pricing-enterprise-heading"
      className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-6 sm:p-8"
    >
      <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-amber-300 mb-3">
        {t("enterprise.eyebrow")}
      </p>
      <h2
        id="pricing-enterprise-heading"
        className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white"
      >
        {t("enterprise.title")}
      </h2>
      <p className="mt-3 text-sm sm:text-base text-white/60 max-w-2xl leading-relaxed">
        {t("enterprise.subtitle")}
      </p>

      <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-white/75">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2">
            <svg
              className="w-4 h-4 shrink-0 mt-0.5 text-amber-300"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span>{it}</span>
          </li>
        ))}
      </ul>

      <Link
        href={t("enterprise.ctaHref")}
        data-testid="pricing-enterprise-cta"
        className="inline-flex items-center gap-1.5 mt-6 rounded-xl border border-amber-400/40 text-amber-300 hover:bg-amber-400/10 hover:border-amber-400/70 px-4 py-2.5 text-sm font-semibold transition"
      >
        {t("enterprise.ctaLabel")}
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </Link>
    </section>
  );
}
