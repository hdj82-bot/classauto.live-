import { describe, it, expect } from "vitest";

// professor/lecture/[id]/page.tsx 의 onChange 패턴을 회귀 방지로 추출.
// valueAsNumber 가 NaN(빈 입력 등)일 때 0 으로 fallback, 음수는 0 으로 clamp,
// 소수는 trunc.
function normalizeIntInput(valueAsNumber: number): number {
  return Number.isFinite(valueAsNumber) ? Math.max(0, Math.trunc(valueAsNumber)) : 0;
}

function normalizeOptionalIntInput(raw: string, valueAsNumber: number): number | null {
  if (!raw) return null;
  return Number.isFinite(valueAsNumber) ? Math.max(0, Math.trunc(valueAsNumber)) : null;
}

describe("normalizeIntInput", () => {
  it("returns 0 for NaN (empty input)", () => {
    expect(normalizeIntInput(NaN)).toBe(0);
  });

  it("returns 0 for Infinity / -Infinity", () => {
    expect(normalizeIntInput(Infinity)).toBe(0);
    expect(normalizeIntInput(-Infinity)).toBe(0);
  });

  it("clamps negative values to 0", () => {
    expect(normalizeIntInput(-3)).toBe(0);
  });

  it("truncates floating values", () => {
    expect(normalizeIntInput(3.9)).toBe(3);
  });

  it("passes through valid integers", () => {
    expect(normalizeIntInput(42)).toBe(42);
  });
});

describe("normalizeOptionalIntInput", () => {
  it("returns null for empty raw string", () => {
    expect(normalizeOptionalIntInput("", NaN)).toBeNull();
  });

  it("returns null when number is NaN even if raw has content", () => {
    expect(normalizeOptionalIntInput("abc", NaN)).toBeNull();
  });

  it("returns truncated, clamped value", () => {
    expect(normalizeOptionalIntInput("3.7", 3.7)).toBe(3);
    expect(normalizeOptionalIntInput("-1", -1)).toBe(0);
  });
});
