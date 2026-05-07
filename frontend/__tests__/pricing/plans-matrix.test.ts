/**
 * 매트릭스 lint — `frontend/src/components/pricing/plans.ts` 와 i18n patch
 * (`messages/_patches/pricingHub.ko.json`) 의 한도 표시가
 * `docs/planning/02-guardrails.md` §5.1 표 + `docs/planning/01-pricing-policy.md`
 * §2 가격과 1:1 일치하는지 회귀 검증한다.
 *
 * 정책이 변경되면 (1) docs 를 먼저 수정하고 (2) plans.ts/i18n 을 같이 수정해
 * 본 테스트가 통과해야 한다 — 테스트 자체를 정책에 맞춰 갱신한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLANS } from "@/components/pricing/plans";
import pricingKo from "../../messages/_patches/pricingHub.ko.json";

const REPO_ROOT = resolve(__dirname, "../../..");
const GUARDRAILS = readFileSync(
  resolve(REPO_ROOT, "docs/planning/02-guardrails.md"),
  "utf-8",
);
const PRICING_POLICY = readFileSync(
  resolve(REPO_ROOT, "docs/planning/01-pricing-policy.md"),
  "utf-8",
);

describe("plans.ts mirrors docs/planning/02-guardrails.md §5.1", () => {
  it("contains the row 영상당 채팅 Q&A | 20건 | 100건 | 무제한", () => {
    expect(GUARDRAILS).toMatch(/영상당 채팅 Q&A\s*\|\s*20건\s*\|\s*100건\s*\|\s*무제한/);
    expect(PLANS.free.limits.perEpisodeQa).toBe(20);
    expect(PLANS.basic.limits.perEpisodeQa).toBe(100);
    expect(PLANS.pro.limits.perEpisodeQa).toBeNull();
  });

  it("contains the row 학생당 일일 Q&A | — | 30건 | 100건", () => {
    expect(GUARDRAILS).toMatch(/학생당 일일 Q&A\s*\|\s*—\s*\|\s*30건\s*\|\s*100건/);
    expect(PLANS.free.limits.dailyQa).toBeNull();
    expect(PLANS.basic.limits.dailyQa).toBe(30);
    expect(PLANS.pro.limits.dailyQa).toBe(100);
  });

  it("contains the row 학생당 월 Q&A 총량 | — | 500건 | 2,000건", () => {
    expect(GUARDRAILS).toMatch(/학생당 월 Q&A 총량\s*\|\s*—\s*\|\s*500건\s*\|\s*2,000건/);
    expect(PLANS.free.limits.monthlyQa).toBeNull();
    expect(PLANS.basic.limits.monthlyQa).toBe(500);
    expect(PLANS.pro.limits.monthlyQa).toBe(2000);
  });

  it("contains the row 학생 입력 글자 한도 | 500자 | 500자 | 500자", () => {
    expect(GUARDRAILS).toMatch(/학생 입력 글자 한도\s*\|\s*500자\s*\|\s*500자\s*\|\s*500자/);
    expect(PLANS.free.limits.inputChars).toBe(500);
    expect(PLANS.basic.limits.inputChars).toBe(500);
    expect(PLANS.pro.limits.inputChars).toBe(500);
  });

  it("contains the row 영상당 24h 동시 시청 | 30명 | 80명 | 무제한", () => {
    expect(GUARDRAILS).toMatch(/영상당 24h 동시 시청\s*\|\s*30명\s*\|\s*80명\s*\|\s*무제한/);
    expect(PLANS.free.limits.concurrentWatchers24h).toBe(30);
    expect(PLANS.basic.limits.concurrentWatchers24h).toBe(80);
    expect(PLANS.pro.limits.concurrentWatchers24h).toBeNull();
  });

  it("contains the row 학생당 동시 재생 | 1개 | 1개 | 1개", () => {
    expect(GUARDRAILS).toMatch(/학생당 동시 재생\s*\|\s*1개\s*\|\s*1개\s*\|\s*1개/);
    expect(PLANS.free.limits.concurrentPlay).toBe(1);
    expect(PLANS.basic.limits.concurrentPlay).toBe(1);
    expect(PLANS.pro.limits.concurrentPlay).toBe(1);
  });
});

describe("plans.ts mirrors docs/planning/01-pricing-policy.md §2 pricing", () => {
  it("Free is free, 2 episodes/mo, 30 MAU", () => {
    expect(PLANS.free.pricing.monthlyKrw).toBe(0);
    expect(PLANS.free.pricing.monthlyEpisodes).toBe(2);
    expect(PLANS.free.pricing.monthlyActiveLearners).toBe(30);
    expect(PLANS.free.pricing.watermark).toBe(true);
    // 정책 §2.1 — "월 영상 생성 | 2편" 행 직접 존재
    expect(PRICING_POLICY).toMatch(/월 영상 생성\s*\|\s*2편/);
  });

  it("Basic is ₩19,000/mo, ₩15,200 annual-equivalent, ₩45,600 saved/yr, 8 episodes, 80 MAU", () => {
    expect(PLANS.basic.pricing.monthlyKrw).toBe(19_000);
    expect(PLANS.basic.pricing.annualMonthlyKrw).toBe(15_200);
    expect(PLANS.basic.pricing.annualSavingsKrw).toBe(45_600);
    expect(PLANS.basic.pricing.monthlyEpisodes).toBe(8);
    expect(PLANS.basic.pricing.monthlyActiveLearners).toBe(80);
    expect(PLANS.basic.pricing.watermark).toBe(false);
    expect(PRICING_POLICY).toMatch(/월 결제\s*\|\s*₩19,000/);
    expect(PRICING_POLICY).toMatch(/₩15,200.*20% 할인.*연 ₩45,600 절약/);
  });

  it("Pro is ₩45,000/mo, ₩36,000 annual-equivalent, ₩108,000 saved/yr, 20 episodes, 150 MAU", () => {
    expect(PLANS.pro.pricing.monthlyKrw).toBe(45_000);
    expect(PLANS.pro.pricing.annualMonthlyKrw).toBe(36_000);
    expect(PLANS.pro.pricing.annualSavingsKrw).toBe(108_000);
    expect(PLANS.pro.pricing.monthlyEpisodes).toBe(20);
    expect(PLANS.pro.pricing.monthlyActiveLearners).toBe(150);
    expect(PRICING_POLICY).toMatch(/월 결제\s*\|\s*₩45,000/);
    expect(PRICING_POLICY).toMatch(/₩36,000.*20% 할인.*연 ₩108,000 절약/);
  });
});

describe("ko i18n patch limit cells match plans.ts numbers", () => {
  // i18n patch 의 표시 문자열이 plans.ts 의 숫자에서 사람이 읽기 좋게 가공된
  // 결과여야 한다. 자동 변환 함수 대신 고정 매핑 — 양쪽이 어긋나면 즉시 깨짐.
  const expectedKo = {
    free: {
      perEpisodeQa: "20건",
      dailyQa: "—",
      monthlyQa: "—",
      inputChars: "500자",
      concurrent24h: "30명",
      concurrentPlay: "1개",
    },
    basic: {
      perEpisodeQa: "100건",
      dailyQa: "30건",
      monthlyQa: "500건",
      inputChars: "500자",
      concurrent24h: "80명",
      concurrentPlay: "1개",
    },
    pro: {
      perEpisodeQa: "무제한",
      dailyQa: "100건",
      monthlyQa: "2,000건",
      inputChars: "500자",
      concurrent24h: "무제한",
      concurrentPlay: "1개",
    },
  };

  for (const plan of ["free", "basic", "pro"] as const) {
    for (const row of [
      "perEpisodeQa",
      "dailyQa",
      "monthlyQa",
      "inputChars",
      "concurrent24h",
      "concurrentPlay",
    ] as const) {
      it(`limitsTable.values.${plan}.${row} === ${expectedKo[plan][row]}`, () => {
        expect(pricingKo.pricingHub.limitsTable.values[plan][row]).toBe(
          expectedKo[plan][row],
        );
      });
    }
  }
});

describe("FAQ contains the two guardrail-related questions required by §8.1", () => {
  // docs/planning/02-guardrails.md §8.1 — "FAQ에 가드레일 관련 질문 2개 포함"
  it("includes Q&A scope refusal question (RAG 0.7 정책)", () => {
    const items = pricingKo.pricingHub.faq.items;
    const hit = items.find((it) => it.q.includes("학습 외 질문"));
    expect(hit, "expected a FAQ item asking about out-of-scope Q&A").toBeDefined();
    expect(hit!.a).toMatch(/0\.7/);
  });

  it("includes the unattended-playback / interstitial-quiz question", () => {
    const items = pricingKo.pricingHub.faq.items;
    const hit = items.find((it) => it.q.includes("자리를 비우면"));
    expect(hit, "expected a FAQ item about unattended playback").toBeDefined();
    expect(hit!.a).toMatch(/인터스티셜 퀴즈/);
  });
});
