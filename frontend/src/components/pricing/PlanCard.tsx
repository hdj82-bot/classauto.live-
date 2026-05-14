"use client";

import Link from "next/link";
import PriceDisplay from "./PriceDisplay";
import { formatKrw, type PlanRow } from "./plans";
import { usePricingHubI18n } from "./usePricingHubI18n";

interface Props {
  plan: PlanRow;
  cycle: "monthly" | "annual";
  /** Basic 카드만 true — colors.md §3 "CTA 골드 채움 1번만" 정책에 따라 골드 강조. */
  highlighted?: boolean;
  /** "세부 한도 보기" 클릭 시 부모(LimitsModal 호스트) 호출. */
  onOpenLimits: (planId: PlanRow["id"]) => void;
  /**
   * 베타 기간 가격 미공개 (사용자 결정 2026-05-13 PM). true 면 가격이 `-` 로
   * 노출되고, 연 결제 절약 hint 도 함께 숨긴다 (가격이 숨겨졌으므로 절약 금액도
   * 무의미). Free 카드는 가격이 원래 0이라 이 prop 의 영향 없음.
   */
  hideForBeta?: boolean;
}

/**
 * 플랜 카드 v2 — 라이트 베이지 + 골드 강조 (highlighted=true 만).
 *
 * - Pretendard tabular-nums 가격 (typography.md §1)
 * - CTA 1개만 — Basic 은 골드 채움, 나머지는 outline (colors.md §3)
 * - 카드 hover 시 골드 글로우 (colors.md §7)
 * - 마스코트 등장 X (마스코트는 학습자 화면 한정)
 */
export default function PlanCard({
  plan,
  cycle,
  highlighted = false,
  onOpenLimits,
  hideForBeta = false,
}: Props) {
  const { t, tValue } = usePricingHubI18n();
  const features = tValue<string[]>(`plans.${plan.id}.features`) ?? [];
  const name = t(`plans.${plan.id}.name`);
  const tagline = t(`plans.${plan.id}.tagline`);
  const ctaLabel = t(`plans.${plan.id}.ctaLabel`);
  const ctaHref = t(`plans.${plan.id}.ctaHref`);
  const ctaNote = t(`plans.${plan.id}.ctaNote`);
  const showCtaNote = ctaNote !== `plans.${plan.id}.ctaNote`;

  // 가격이 hideForBeta 로 가려진 경우 annual savings hint 도 무의미하므로 숨김.
  const annualHint =
    !hideForBeta && cycle === "annual" && plan.pricing.annualSavingsKrw > 0
      ? t("annualSavings", { amount: `₩${formatKrw(plan.pricing.annualSavingsKrw)}` })
      : null;

  return (
    <article
      data-testid={`plan-card-${plan.id}`}
      data-highlighted={highlighted}
      className={[
        // 사용자 결정 2026-05-13 PM: 카드 features 개수가 달라도 CTA 가 카드
        // 바닥에 일치하도록 `h-full` 로 row 높이를 가득 채운다. 부모 grid 가
        // 기본 `items-stretch` 라 한 row 안의 두 카드는 같은 높이가 되고,
        // `mt-auto` 가 붙은 CTA 영역이 정확히 바닥에 정렬된다.
        "relative h-full rounded-2xl p-6 sm:p-7 flex flex-col gap-5 transition-shadow duration-300 motion-reduce:transition-none",
        highlighted
          ? "bg-gradient-to-b from-[rgba(255,182,39,0.10)] to-[rgba(255,182,39,0.02)] border border-[rgba(184,131,8,0.45)] shadow-[0_8px_32px_rgba(255,182,39,0.18)]"
          : "bg-white border border-[rgba(10,10,10,0.08)] hover:border-[rgba(10,10,10,0.20)] hover:shadow-[0_4px_16px_rgba(10,10,10,0.05)]",
      ].join(" ")}
    >
      {highlighted && (
        <span
          data-testid={`plan-card-${plan.id}-popular`}
          className="absolute -top-3 left-6 inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase"
          style={{
            backgroundColor: "#FFB627",
            color: "#1A1A1A",
            boxShadow: "0 4px 12px rgba(255,182,39,0.40)",
          }}
        >
          {t("popularBadge")}
        </span>
      )}

      <header>
        <h3
          className="text-lg font-semibold text-[#0A0A0A] tracking-tight"
          style={{
            fontFamily:
              "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
          }}
        >
          {name}
        </h3>
        <p className="mt-1 text-xs text-[rgba(10,10,10,0.50)]">{tagline}</p>
      </header>

      <PriceDisplay
        monthlyKrw={plan.pricing.monthlyKrw}
        annualMonthlyKrw={plan.pricing.annualMonthlyKrw}
        cycle={cycle}
        hideForBeta={hideForBeta}
      />

      {plan.pricing.monthlyKrw === 0 ? (
        <p className="text-xs text-[rgba(10,10,10,0.40)] -mt-3">
          {t("plans.free.perMonthLabel")}
        </p>
      ) : (
        annualHint && (
          <p
            data-testid={`plan-card-${plan.id}-savings`}
            className="text-xs text-[#B88308] -mt-3 font-medium"
          >
            {annualHint}
          </p>
        )
      )}

      <ul className="space-y-2 text-sm text-[rgba(10,10,10,0.78)] leading-relaxed">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2">
            <svg
              className={`w-4 h-4 shrink-0 mt-0.5 ${highlighted ? "text-[#B88308]" : "text-[rgba(10,10,10,0.40)]"}`}
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
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-2">
        <Link
          href={ctaHref}
          data-testid={`plan-card-${plan.id}-cta`}
          className={[
            "inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition motion-reduce:transition-none",
            highlighted
              ? "shadow-[0_8px_24px_rgba(255,182,39,0.30)]"
              : "border border-[rgba(10,10,10,0.18)] text-[#0A0A0A] hover:border-[rgba(10,10,10,0.36)] hover:bg-black/5",
          ].join(" ")}
          style={
            highlighted
              ? { backgroundColor: "#FFB627", color: "#1A1A1A" }
              : undefined
          }
          onMouseEnter={
            highlighted
              ? (e) => (e.currentTarget.style.backgroundColor = "#FFC74D")
              : undefined
          }
          onMouseLeave={
            highlighted
              ? (e) => (e.currentTarget.style.backgroundColor = "#FFB627")
              : undefined
          }
        >
          {ctaLabel}
        </Link>
        {showCtaNote && (
          <p className="text-[11px] text-[rgba(10,10,10,0.40)] text-center">
            {ctaNote}
          </p>
        )}

        <button
          type="button"
          onClick={() => onOpenLimits(plan.id)}
          data-testid={`plan-card-${plan.id}-view-limits`}
          aria-label={t("viewLimitsAria", { plan: name })}
          className="inline-flex items-center justify-center gap-1 text-xs font-medium text-[rgba(10,10,10,0.60)] hover:text-[#0A0A0A] transition motion-reduce:transition-none mt-1"
        >
          {t("viewLimits")}
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zM10 6a1 1 0 100 2 1 1 0 000-2zM9 10a1 1 0 011-1h.5a1 1 0 010 2H11v2a1 1 0 11-2 0v-3z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </article>
  );
}
