import { describe, it, expect } from "vitest";
import { isOnTopic, DEMO_QUESTION_LIMIT, DEMO_INPUT_MAX } from "@/components/demo/demoTypes";

describe("demoTypes", () => {
  // 강의 주제 갱신 (PR #116 / 2026-05-13):
  //   social  = 중국어문법의 이해 (把자문)
  //   natural = 광합성의 원리
  // 옛 GDP/위안화/광속/상대성 키워드는 demoTypes 에서 폐기.
  it("treats lecture-relevant Korean keywords as on-topic for social field", () => {
    expect(isOnTopic("把자문은 언제 쓰는 게 자연스러워요?", "social")).toBe(true);
    expect(isOnTopic("중국어문법에서 어순이 왜 중요한가요?", "social")).toBe(true);
  });

  it("treats lecture-relevant English keywords as on-topic for natural field", () => {
    expect(isOnTopic("explain the principle of photosynthesis", "natural")).toBe(true);
    expect(isOnTopic("What role does chlorophyll play?", "natural")).toBe(true);
  });

  it("flags casual off-topic small talk as off-topic", () => {
    expect(isOnTopic("오늘 점심 뭐 먹지?", "social")).toBe(false);
    expect(isOnTopic("What's the weather like?", "natural")).toBe(false);
  });

  it("treats empty input as off-topic (do not blast a request to the API)", () => {
    expect(isOnTopic("   ", "social")).toBe(false);
  });

  it("respects the demo-only guardrail constants from 02-guardrails.md", () => {
    expect(DEMO_QUESTION_LIMIT).toBe(3);
    expect(DEMO_INPUT_MAX).toBe(200);
  });
});
