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
}

/**
 * 플랜 카드 — 다크 톤 + 골드 강조 (highlighted=true 만).
 *
 * - Pretendard tabular-nums 가격 (typography.md §1)
 * - CTA 1개만 — Basic 은 골드 채움, 나머지는 outline (colors.md §3)
 * - 카드 hover 시 글로우 (colors.md §7 학습자 영역 글로우 톤을 다크 카드에 적용)
 * - 마스코트 등장 X (마스코트는 학습자 화면 한정)
 */
export default function PlanCard({
  plan,
  cycle,
  highlighted = false,
  onOpenLimits,
}: Props) {
  const { t, tValue } = usePricingHubI18n();
  const features = tValue<string[]>(`plans.${plan.id}.features`) ?? [];
  const name = t(`plans.${plan.id}.name`);
  const tagline = t(`plans.${plan.id}.tagline`);
  const ctaLabel = t(`plans.${plan.id}.ctaLabel`);
  const ctaHref = t(`plans.${plan.id}.ctaHref`);
  const ctaNote = t(`plans.${plan.id}.ctaNote`);
  const showCtaNote = ctaNote !== `plans.${plan.id}.ctaNote`; // i18n miss 시 키 그대로 반환됨

  const annualHint =
    cycle === "annual" && plan.pricing.annualSavingsKrw > 0
      ? t("annualSavings", { amount: `₩${formatKrw(plan.pricing.annualSavingsKrw)}` })
      : null;

  return (
    <article
      data-testid={`plan-card-${plan.id}`}
      data-highlighted={highlighted}
      className={[
        "relative rounded-2xl p-6 sm:p-7 flex flex-col gap-5 transition-shadow duration-300 motion-reduce:transition-none",
        highlighted
          ? "bg-gradient-to-b from-amber-400/10 to-transparent border border-amber-400/40 shadow-[0_0_24px_rgba(255,182,39,0.15)]"
          : "bg-white/[0.02] border border-white/10 hover:border-white/20",
      ].join(" ")}
    >
      {highlighted && (
        <span
          data-testid={`plan-card-${plan.id}-popular`}
          className="absolute -top-3 left-6 inline-flex items-center rounded-full bg-amber-400 text-black px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase"
        >
          {t("popularBadge")}
        </span>
      )}

      <header>
        <h3 className="text-lg font-semibold text-white">{name}</h3>
        <p className="mt-1 text-xs text-white/50">{tagline}</p>
      </header>

      <PriceDisplay
        monthlyKrw={plan.pricing.monthlyKrw}
        annualMonthlyKrw={plan.pricing.annualMonthlyKrw}
        cycle={cycle}
      />

      {plan.pricing.monthlyKrw === 0 ? (
        <p className="text-xs text-white/40 -mt-3">{t("plans.free.perMonthLabel")}</p>
      ) : (
        annualHint && (
          <p
            data-testid={`plan-card-${plan.id}-savings`}
            className="text-xs text-amber-300 -mt-3"
          >
            {annualHint}
          </p>
        )
      )}

      <ul className="space-y-2 text-sm text-white/75 leading-relaxed">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2">
            <svg
              className={`w-4 h-4 shrink-0 mt-0.5 ${highlighted ? "text-amber-400" : "text-white/40"}`}
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
            "inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition",
            highlighted
              ? "bg-amber-400 text-black hover:bg-amber-300 shadow-[0_8px_24px_rgba(255,182,39,0.25)]"
              : "border border-white/20 text-white hover:border-white/40 hover:bg-white/[0.04]",
          ].join(" ")}
        >
          {ctaLabel}
        </Link>
        {showCtaNote && (
          <p className="text-[11px] text-white/40 text-center">{ctaNote}</p>
        )}

        <button
          type="button"
          onClick={() => onOpenLimits(plan.id)}
          data-testid={`plan-card-${plan.id}-view-limits`}
          aria-label={t("viewLimitsAria", { plan: name })}
          className="inline-flex items-center justify-center gap-1 text-xs font-medium text-white/60 hover:text-white transition mt-1"
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
