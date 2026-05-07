import { describe, it, expect } from "vitest";
import {
  validatePptFile,
  validateStep1,
  evaluatePlanUsage,
  MAX_PPT_BYTES,
  COST_WARNING_THRESHOLD,
} from "@/components/professor/studio/guardrails";
import type {
  CostBreakdown,
  PlanUsage,
} from "@/components/professor/studio/studioTypes";

function makeFile(name: string, sizeBytes: number): File {
  // jsdom 의 File 은 size 를 자동 계산. dummy ArrayBuffer 로 길이 맞춤.
  const buf = new Uint8Array(sizeBytes);
  return new File([buf], name, { type: "application/octet-stream" });
}

describe("guardrails / validatePptFile", () => {
  it("rejects null file as a type error", () => {
    expect(validatePptFile(null)).toEqual({ ok: false, reason: "type" });
  });

  it("rejects non-pptx extensions", () => {
    const f = makeFile("slide.pdf", 1024);
    expect(validatePptFile(f)).toEqual({ ok: false, reason: "type" });
  });

  it("rejects .ppt (legacy) — only .pptx is accepted", () => {
    const f = makeFile("legacy.ppt", 1024);
    expect(validatePptFile(f)).toEqual({ ok: false, reason: "type" });
  });

  it("accepts a small .pptx", () => {
    const f = makeFile("deck.pptx", 1024);
    expect(validatePptFile(f).ok).toBe(true);
  });

  it("rejects > 100MB .pptx with size reason and rounded MB", () => {
    const f = makeFile("huge.pptx", MAX_PPT_BYTES + 1024 * 1024); // 101MB
    const result = validatePptFile(f);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("size");
      expect(result.sizeMB ?? 0).toBeGreaterThan(100);
    }
  });

  it("treats uppercase PPTX extension as valid (case-insensitive)", () => {
    const f = makeFile("DECK.PPTX", 2048);
    expect(validatePptFile(f).ok).toBe(true);
  });
});

describe("guardrails / validateStep1", () => {
  const okFile = makeFile("deck.pptx", 1024);

  it("requires lecture title", () => {
    expect(
      validateStep1({
        title: "  ",
        courseMode: "existing",
        selectedCourseId: "c1",
        newCourseTitle: "",
        file: okFile,
      }),
    ).toBe("title");
  });

  it("requires existing courseId when mode is existing", () => {
    expect(
      validateStep1({
        title: "강의 A",
        courseMode: "existing",
        selectedCourseId: "",
        newCourseTitle: "",
        file: okFile,
      }),
    ).toBe("course");
  });

  it("requires newCourseTitle when mode is new", () => {
    expect(
      validateStep1({
        title: "강의 A",
        courseMode: "new",
        selectedCourseId: "",
        newCourseTitle: "   ",
        file: okFile,
      }),
    ).toBe("course");
  });

  it("propagates pptx type error", () => {
    expect(
      validateStep1({
        title: "강의 A",
        courseMode: "new",
        selectedCourseId: "",
        newCourseTitle: "강좌 A",
        file: makeFile("a.pdf", 100),
      }),
    ).toBe("pptType");
  });

  it("propagates size error for >100MB pptx", () => {
    expect(
      validateStep1({
        title: "강의 A",
        courseMode: "new",
        selectedCourseId: "",
        newCourseTitle: "강좌 A",
        file: makeFile("huge.pptx", MAX_PPT_BYTES + 1),
      }),
    ).toBe("pptSize");
  });

  it("returns null when all fields are valid", () => {
    expect(
      validateStep1({
        title: "강의 A",
        courseMode: "new",
        selectedCourseId: "",
        newCourseTitle: "강좌 A",
        file: okFile,
      }),
    ).toBeNull();
  });
});

describe("guardrails / evaluatePlanUsage", () => {
  const estimate: CostBreakdown = {
    ttsChars: 1000,
    ttsCost: 0.3,
    avatarSeconds: 60,
    avatarCost: 1.02,
    total: 1.32,
  };

  it("treats limit=0 as unlimited (no warn / no block)", () => {
    const usage: PlanUsage = { used: 999, limit: 0 };
    const decision = evaluatePlanUsage(usage, estimate);
    expect(decision.warn).toBe(false);
    expect(decision.block).toBe(false);
    expect(decision.ratio).toBe(0);
  });

  it("flags warn at 80% (with estimate pushing over)", () => {
    const usage: PlanUsage = { used: 79, limit: 100 };
    const decision = evaluatePlanUsage(usage, estimate);
    expect(decision.warn).toBe(true);
    expect(decision.block).toBe(false);
    expect(decision.ratio).toBeLessThan(COST_WARNING_THRESHOLD);
    expect(decision.ratioWithEstimate ?? 0).toBeGreaterThan(
      COST_WARNING_THRESHOLD,
    );
  });

  it("blocks when already over limit", () => {
    const usage: PlanUsage = { used: 110, limit: 100 };
    const decision = evaluatePlanUsage(usage, estimate);
    expect(decision.block).toBe(true);
    expect(decision.warn).toBe(true);
  });

  it("blocks when this estimate would push over limit", () => {
    const usage: PlanUsage = { used: 99, limit: 100 };
    const decision = evaluatePlanUsage(usage, estimate);
    expect(decision.block).toBe(true);
  });

  it("does not warn well below threshold", () => {
    const usage: PlanUsage = { used: 10, limit: 100 };
    const decision = evaluatePlanUsage(usage, estimate);
    expect(decision.warn).toBe(false);
    expect(decision.block).toBe(false);
  });
});
