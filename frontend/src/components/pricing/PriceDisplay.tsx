"use client";

import { formatKrw } from "./plans";
import { usePricingHubI18n } from "./usePricingHubI18n";

interface Props {
  /** 월 결제가 (KRW). Free 는 0. */
  monthlyKrw: number;
  /** 연 결제 시 월 환산가 (KRW). Free 는 0. */
  annualMonthlyKrw: number;
  /** "monthly" | "annual" — billing cycle 토글 상태. */
  cycle: "monthly" | "annual";
  /** Free 카드 등 가격이 아예 0 인 경우 별도 라벨로 대체. */
  freeLabel?: string;
  /** Pretendard tabular-nums 600 — typography.md §1. 추가 클래스 합치기 용. */
  className?: string;
}

/**
 * 가격 한 줄. **Pretendard tabular-nums 600 (typography.md §1)** 으로 통일,
 * Geist Mono 사용 금지.
 *
 * - cycle="monthly" 면 `monthlyKrw` 노출
 * - cycle="annual" 이면 `annualMonthlyKrw` 노출 + 월 환산 안내 캡션
 * - 토글 변화 시 `transition-[font-size]/opacity` 로 0.3s ease-out 부드럽게,
 *   `motion-reduce` 시 즉시 전환 (animations.md / colors.md prefers-reduced-motion)
 */
export default function PriceDisplay({
  monthlyKrw,
  annualMonthlyKrw,
  cycle,
  freeLabel,
  className = "",
}: Props) {
  const { t } = usePricingHubI18n();
  const isFree = monthlyKrw === 0 && annualMonthlyKrw === 0;
  const value = cycle === "monthly" ? monthlyKrw : annualMonthlyKrw;

  if (isFree) {
    return (
      <div className={`flex items-baseline gap-2 ${className}`}>
        <span
          data-testid="price-display-free"
          className="text-4xl sm:text-5xl font-semibold tracking-tight tabular-nums text-[#0A0A0A]"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {freeLabel ?? t("plans.free.priceFree")}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-baseline gap-1.5 ${className}`}>
      <span className="text-xl text-[rgba(10,10,10,0.55)]">₩</span>
      <span
        data-testid="price-display-amount"
        data-cycle={cycle}
        className="text-4xl sm:text-5xl font-semibold tracking-tight tabular-nums text-[#0A0A0A] transition-opacity duration-300 ease-out motion-reduce:transition-none"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {formatKrw(value)}
      </span>
      <span className="text-sm text-[rgba(10,10,10,0.50)]">{t("priceUnit")}</span>
    </div>
  );
}
