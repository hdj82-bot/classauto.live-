import { describe, it, expect } from "vitest";
import { isOnTopic, DEMO_QUESTION_LIMIT, DEMO_INPUT_MAX } from "@/components/demo/demoTypes";

describe("demoTypes", () => {
  it("treats lecture-relevant Korean keywords as on-topic for social field", () => {
    expect(isOnTopic("디지털 위안화 정책의 의도는?", "social")).toBe(true);
    expect(isOnTopic("GDP와 GNP 차이가 뭐예요?", "social")).toBe(true);
  });

  it("treats lecture-relevant English keywords as on-topic for natural field", () => {
    expect(isOnTopic("why is the speed of light constant", "natural")).toBe(true);
    expect(isOnTopic("Time dilation explanation please", "natural")).toBe(true);
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
