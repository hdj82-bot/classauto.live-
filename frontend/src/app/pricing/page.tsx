import type { Metadata } from "next";
import PricingContent from "@/components/pricing/PricingContent";

/**
 * /pricing 페이지.
 *
 * 콘텐츠는 dark/gold 마케팅 셸 (`MarketingShell`) 위에 렌더되는 client
 * component (`PricingContent`) 가 모두 처리한다.  본 라우트는 메타데이터만
 * 들고 있다 — `/trust`, `/use-cases` 등 다른 마케팅 라우트와 동일한 패턴.
 *
 * 정책 출처:
 *   - docs/planning/01-pricing-policy.md (Free/Basic/Pro 가격·편수·MAU)
 *   - docs/planning/02-guardrails.md §5.1 (학생 측 한도 매트릭스), §8.1 (가격 페이지 노출 정책)
 *   - docs/design-system/colors.md §3, §8 (다크/골드, CTA 채움 골드 1번만)
 *   - docs/design-system/typography.md §1 (가격 = Pretendard tabular-nums 600)
 *
 * Stripe 연동은 본 PR 범위가 아니다 — Basic/Pro 카드 CTA 는
 * `/professor/subscription` 으로 이동해 기존 결제 흐름이 이어진다.
 */
export const metadata: Metadata = {
  title: "요금제 — ClassAuto",
  description:
    "Free·Basic·Pro 세 가지 플랜과 학생 측 사용 한도를 한 페이지에 정리했습니다. 광고 미사용, 졸업 후 자동 삭제.",
  openGraph: {
    title: "요금제 — ClassAuto",
    description:
      "편수 + 학생 수 이중 한도로 비용을 통제합니다. 4중 가드레일 시스템에 기반한 학생 측 사용 한도 명시.",
    url: "/pricing",
    type: "website",
  },
};

export default function PricingPage() {
  return <PricingContent />;
}
