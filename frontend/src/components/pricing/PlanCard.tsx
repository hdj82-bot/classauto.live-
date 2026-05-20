"use client";

import type { PlanRow } from "./plans";
import { usePricingHubI18n } from "./usePricingHubI18n";

interface Props {
  plan: PlanRow;
  /** Basic 카드만 true — colors.md §3 "강조 1번만" 정책에 따라 골드 톤으로 살짝 강조. */
  highlighted?: boolean;
  /** "세부 한도 보기" 클릭 시 부모(LimitsModal 호스트) 호출. */
  onOpenLimits: (planId: PlanRow["id"]) => void;
}

/**
 * 플랜 카드 — 2026 베타 버전.
 *
 * 베타 기간 동안 가격·결제 CTA·인기 배지는 모두 표시하지 않는다 (사용자 결정
 * 2026-05-20). 카드는 학생 한도와 기능 목록만 노출하는 정보 카드로 동작하고,
 * 결제·신청 행위는 페이지 하단의 단일 "베타 신청하기" CTA(`footerCta` + 헤더
 * 우상단) 에서만 받는다.
 */
export default function PlanCard({
  plan,
  highlighted = false,
  onOpenLimits,
}: Props) {
  const { t, tValue } = usePricingHubI18n();
  const features = tValue<string[]>(`plans.${plan.id}.features`) ?? [];
  const name = t(`plans.${plan.id}.name`);
  const tagline = t(`plans.${plan.id}.tagline`);
  const perMonthLabel = t(`plans.${plan.id}.perMonthLabel`);
  const showPerMonth = perMonthLabel !== `plans.${plan.id}.perMonthLabel`;

  return (
    <article
      data-testid={`plan-card-${plan.id}`}
      data-highlighted={highlighted}
      className={[
        "relative h-full rounded-2xl p-6 sm:p-7 flex flex-col gap-5 transition-shadow duration-300 motion-reduce:transition-none",
        highlighted
          ? "bg-gradient-to-b from-[rgba(255,182,39,0.10)] to-[rgba(255,182,39,0.02)] border border-[rgba(184,131,8,0.45)] shadow-[0_8px_32px_rgba(255,182,39,0.18)]"
          : "bg-white border border-[rgba(10,10,10,0.08)] hover:border-[rgba(10,10,10,0.20)] hover:shadow-[0_4px_16px_rgba(10,10,10,0.05)]",
      ].join(" ")}
    >
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
        {showPerMonth && (
          <p className="mt-3 text-xs text-[rgba(10,10,10,0.40)]">{perMonthLabel}</p>
        )}
      </header>

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

      <div className="mt-auto">
        <button
          type="button"
          onClick={() => onOpenLimits(plan.id)}
          data-testid={`plan-card-${plan.id}-view-limits`}
          aria-label={t("viewLimitsAria", { plan: name })}
          className="inline-flex items-center justify-center gap-1 text-xs font-medium text-[rgba(10,10,10,0.60)] hover:text-[#0A0A0A] transition motion-reduce:transition-none"
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
