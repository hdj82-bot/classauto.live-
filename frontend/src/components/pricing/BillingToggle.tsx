"use client";

import { usePricingHubI18n } from "./usePricingHubI18n";

interface Props {
  cycle: "monthly" | "annual";
  onChange: (next: "monthly" | "annual") => void;
}

/**
 * 월/연 결제 전환 세그먼트.
 *
 * 정책 §4.1 — **연 결제가 기본값** (Anchoring 효과). 본 컴포넌트는 호스트
 * 페이지가 `useState("annual")` 으로 초기화한 상태를 그대로 노출만 한다.
 *
 * - role=group + aria-label, 두 버튼은 `aria-pressed` 로 토글 상태 표현
 * - prefers-reduced-motion 지원 — `motion-reduce:transition-none`
 */
export default function BillingToggle({ cycle, onChange }: Props) {
  const { t } = usePricingHubI18n();
  const isAnnual = cycle === "annual";

  return (
    <div
      data-testid="pricing-billing-toggle"
      role="group"
      aria-label={t("billingToggle.ariaLabel")}
      className="inline-flex items-center gap-3"
    >
      <span className="text-xs uppercase tracking-wider text-[rgba(10,10,10,0.45)]">
        {t("billingToggle.label")}
      </span>
      <div className="inline-flex rounded-full bg-white border border-[rgba(10,10,10,0.08)] p-1 shadow-[0_1px_2px_rgba(10,10,10,0.04)]">
        <button
          type="button"
          aria-pressed={!isAnnual}
          data-testid="pricing-billing-monthly"
          onClick={() => onChange("monthly")}
          className={[
            "px-4 py-1.5 text-xs font-semibold rounded-full transition motion-reduce:transition-none",
            !isAnnual
              ? "bg-[#1A1A1A] text-white shadow-sm"
              : "text-[rgba(10,10,10,0.60)] hover:text-[#0A0A0A]",
          ].join(" ")}
        >
          {t("billingToggle.monthly")}
        </button>
        <button
          type="button"
          aria-pressed={isAnnual}
          data-testid="pricing-billing-annual"
          onClick={() => onChange("annual")}
          className={[
            "px-4 py-1.5 text-xs font-semibold rounded-full transition flex items-center gap-1.5 motion-reduce:transition-none",
            isAnnual
              ? "text-[#1A1A1A] shadow-sm"
              : "text-[rgba(10,10,10,0.60)] hover:text-[#0A0A0A]",
          ].join(" ")}
          style={
            isAnnual
              ? { backgroundColor: "#FFB627" }
              : undefined
          }
        >
          {t("billingToggle.annual")}
          <span
            className={[
              "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
              isAnnual ? "bg-black/15 text-[#1A1A1A]" : "bg-[rgba(255,182,39,0.18)] text-[#B88308]",
            ].join(" ")}
          >
            {t("billingToggle.annualNote")}
          </span>
        </button>
      </div>
    </div>
  );
}
