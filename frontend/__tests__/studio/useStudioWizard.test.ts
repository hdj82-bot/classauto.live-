import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useStudioWizard,
  stepCompletionFraction,
} from "@/components/professor/studio/useStudioWizard";

describe("useStudioWizard", () => {
  it("starts at step 1 by default", () => {
    const { result } = renderHook(() => useStudioWizard());
    expect(result.current.state.step).toBe(1);
  });

  it("respects initial step argument", () => {
    const { result } = renderHook(() => useStudioWizard(3));
    expect(result.current.state.step).toBe(3);
  });

  it("goTo updates step", () => {
    const { result } = renderHook(() => useStudioWizard());
    act(() => result.current.goTo(2));
    expect(result.current.state.step).toBe(2);
    act(() => result.current.goTo(5));
    expect(result.current.state.step).toBe(5);
  });

  it("setReview accumulates per-slide statuses", () => {
    const { result } = renderHook(() => useStudioWizard(2));
    act(() => result.current.setReview(0, "accepted"));
    act(() => result.current.setReview(1, "rejected"));
    act(() => result.current.setReview(2, "edited"));
    expect(result.current.state.reviewByIndex).toEqual({
      0: "accepted",
      1: "rejected",
      2: "edited",
    });
  });

  it("setReview overrides previous status for same slide", () => {
    const { result } = renderHook(() => useStudioWizard(2));
    act(() => result.current.setReview(0, "accepted"));
    act(() => result.current.setReview(0, "rejected"));
    expect(result.current.state.reviewByIndex[0]).toBe("rejected");
  });

  it("setSelectedAvatar / setTtsProvider / setEmailNotify round-trip", () => {
    const { result } = renderHook(() => useStudioWizard(3));
    act(() => result.current.setSelectedAvatar("avatar-xyz"));
    act(() => result.current.setTtsProvider("google"));
    act(() => result.current.setEmailNotify(true));
    expect(result.current.state.selectedAvatarId).toBe("avatar-xyz");
    expect(result.current.state.ttsProvider).toBe("google");
    expect(result.current.state.emailNotify).toBe(true);
  });

  it("setExpiresAt accepts null to clear", () => {
    const { result } = renderHook(() => useStudioWizard(3));
    act(() => result.current.setExpiresAt("2027-01-01T00:00:00.000Z"));
    expect(result.current.state.expiresAt).toBeTruthy();
    act(() => result.current.setExpiresAt(null));
    expect(result.current.state.expiresAt).toBeNull();
  });
});

describe("stepCompletionFraction", () => {
  it("step 1 → 0", () => {
    expect(stepCompletionFraction(1, 10, 0)).toBe(0);
  });

  it("step 5 → 1 (complete)", () => {
    expect(stepCompletionFraction(5, 10, 10)).toBe(1);
  });

  it("step 4 → 0.85", () => {
    expect(stepCompletionFraction(4, 10, 10)).toBe(0.85);
  });

  it("step 3 → 0.65", () => {
    expect(stepCompletionFraction(3, 10, 5)).toBe(0.65);
  });

  it("step 2 grows with reviewed slides", () => {
    const zero = stepCompletionFraction(2, 10, 0);
    const half = stepCompletionFraction(2, 10, 5);
    const full = stepCompletionFraction(2, 10, 10);
    expect(zero).toBeLessThan(half);
    expect(half).toBeLessThan(full);
  });

  it("step 2 with 0 slides returns base value (no division by zero)", () => {
    expect(stepCompletionFraction(2, 0, 0)).toBe(0.2);
  });
});
