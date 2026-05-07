/**
 * Pricing 페이지의 **단일 진실의 원천 (single source of truth)**.
 *
 * 가격·한도 숫자는 모두 이 파일에서 나오며, i18n 패치
 * (`messages/_patches/pricingHub.{ko,en}.json`) 의 `limitsTable.values.*`
 * 표기 문자열은 본 객체의 숫자를 사람이 읽기 좋게 가공한 결과여야 한다.
 *
 * `__tests__/pricing/plans-matrix.test.ts` 가 본 객체의 값을
 * `docs/planning/02-guardrails.md` §5.1 표 + `docs/planning/01-pricing-policy.md`
 * §2 의 가격과 1:1 비교해 회귀를 차단한다.
 */

export type PlanId = "free" | "basic" | "pro";

/** 정책 §5.1 — 학생 측 4중 가드레일의 3차(빈도 한도) 매트릭스. */
export interface PlanLimits {
  /** 영상당 채팅 Q&A. `null` = 무제한. */
  perEpisodeQa: number | null;
  /** 학생당 일일 Q&A. `null` = 한도 정의 없음 (Free). */
  dailyQa: number | null;
  /** 학생당 월 Q&A 총량. `null` = 한도 정의 없음 (Free). */
  monthlyQa: number | null;
  /** 학생 입력 글자 한도. 모든 플랜 동일 (500). */
  inputChars: number;
  /** 영상당 24h 동시 시청자 수. `null` = 무제한. */
  concurrentWatchers24h: number | null;
  /** 학생당 동시 재생 (모든 플랜 1). */
  concurrentPlay: number;
}

/** 정책 §2 — Free/Basic/Pro 가격·편수·MAU. KRW 원 단위. */
export interface PlanPricing {
  /** 월 결제 가격 (KRW). Free 는 0. */
  monthlyKrw: number;
  /** 연 결제의 월 환산 가격 (KRW). Free 는 0. */
  annualMonthlyKrw: number;
  /** 연 결제 시 절약되는 연간 금액 (KRW). 정책 §2.2/§2.3 의 "연 ₩X 절약" 값. */
  annualSavingsKrw: number;
  /** 월 영상 생성 한도. */
  monthlyEpisodes: number;
  /** 월간 활성 학습자 (MAU) 한도. */
  monthlyActiveLearners: number;
  /** 워터마크 포함 여부. */
  watermark: boolean;
}

export interface PlanRow {
  id: PlanId;
  pricing: PlanPricing;
  limits: PlanLimits;
}

/**
 * 정책 §5.1 — 가드레일 4중 시스템 §3차 한도 매트릭스의 코드 미러.
 *
 * | 항목 | Free | Basic | Pro |
 * |---|:---:|:---:|:---:|
 * | 영상당 채팅 Q&A | 20건 | 100건 | 무제한 |
 * | 학생당 일일 Q&A | — | 30건 | 100건 |
 * | 학생당 월 Q&A 총량 | — | 500건 | 2,000건 |
 * | 학생 입력 글자 한도 | 500자 | 500자 | 500자 |
 * | 영상당 24h 동시 시청 | 30명 | 80명 | 무제한 |
 * | 학생당 동시 재생 | 1개 | 1개 | 1개 |
 */
export const PLANS: Record<PlanId, PlanRow> = {
  free: {
    id: "free",
    pricing: {
      monthlyKrw: 0,
      annualMonthlyKrw: 0,
      annualSavingsKrw: 0,
      monthlyEpisodes: 2,
      monthlyActiveLearners: 30,
      watermark: true,
    },
    limits: {
      perEpisodeQa: 20,
      dailyQa: null,
      monthlyQa: null,
      inputChars: 500,
      concurrentWatchers24h: 30,
      concurrentPlay: 1,
    },
  },
  basic: {
    id: "basic",
    pricing: {
      monthlyKrw: 19_000,
      annualMonthlyKrw: 15_200,
      annualSavingsKrw: 45_600,
      monthlyEpisodes: 8,
      monthlyActiveLearners: 80,
      watermark: false,
    },
    limits: {
      perEpisodeQa: 100,
      dailyQa: 30,
      monthlyQa: 500,
      inputChars: 500,
      concurrentWatchers24h: 80,
      concurrentPlay: 1,
    },
  },
  pro: {
    id: "pro",
    pricing: {
      monthlyKrw: 45_000,
      annualMonthlyKrw: 36_000,
      annualSavingsKrw: 108_000,
      monthlyEpisodes: 20,
      monthlyActiveLearners: 150,
      watermark: false,
    },
    limits: {
      perEpisodeQa: null,
      dailyQa: 100,
      monthlyQa: 2_000,
      inputChars: 500,
      concurrentWatchers24h: null,
      concurrentPlay: 1,
    },
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "basic", "pro"];

/**
 * Pretendard tabular-nums 가 적용되는 곳에서 KRW 가격을 일관되게 포맷팅.
 *
 * - 1000 단위 콤마. KRW 는 소수점 없음.
 * - 0 은 호출자가 "무료" 등으로 별도 처리 — 본 함수는 항상 숫자 문자열만 반환.
 */
export function formatKrw(value: number): string {
  return new Intl.NumberFormat("ko-KR", {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(value);
}
