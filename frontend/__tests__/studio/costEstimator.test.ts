import { describe, it, expect } from "vitest";
import {
  estimateCost,
  formatDuration,
  HEYGEN_PER_SECOND_USD,
  TTS_RATES,
} from "@/components/professor/studio/costEstimator";
import type { ScriptSegment } from "@/components/professor/studio/studioTypes";

function seg(slide: number, text: string, dur: number): ScriptSegment {
  return {
    slide_index: slide,
    text,
    start_seconds: slide * dur,
    end_seconds: (slide + 1) * dur,
    tone: "normal",
    question_pin_seconds: null,
  };
}

describe("costEstimator / estimateCost", () => {
  it("returns zero for empty segment list", () => {
    const cost = estimateCost([], "elevenlabs");
    expect(cost.ttsChars).toBe(0);
    expect(cost.avatarSeconds).toBe(0);
    expect(cost.total).toBe(0);
  });

  it("sums character counts across segments", () => {
    const segs = [seg(0, "abc", 10), seg(1, "defg", 10), seg(2, "hi", 10)];
    const cost = estimateCost(segs, "elevenlabs");
    expect(cost.ttsChars).toBe(9);
  });

  it("sums avatar seconds from start/end deltas", () => {
    const segs = [seg(0, "x", 30), seg(1, "y", 45)];
    const cost = estimateCost(segs, "elevenlabs");
    expect(cost.avatarSeconds).toBe(75);
  });

  it("applies elevenlabs rate", () => {
    const segs = [seg(0, "x".repeat(1000), 10)];
    const cost = estimateCost(segs, "elevenlabs");
    // 1000 chars * 0.0003 = 0.30
    expect(cost.ttsCost).toBeCloseTo(1000 * TTS_RATES.elevenlabs, 2);
  });

  it("google TTS is cheaper than elevenlabs for same text", () => {
    const segs = [seg(0, "x".repeat(1000), 10)];
    const eleven = estimateCost(segs, "elevenlabs");
    const google = estimateCost(segs, "google");
    expect(google.ttsCost).toBeLessThan(eleven.ttsCost);
  });

  it("applies HeyGen per-second rate to avatar cost", () => {
    const segs = [seg(0, "abc", 100)]; // 100s
    const cost = estimateCost(segs, "elevenlabs");
    expect(cost.avatarCost).toBeCloseTo(100 * HEYGEN_PER_SECOND_USD, 2);
  });

  it("rounds total to two decimal places", () => {
    const segs = [seg(0, "abc", 10)];
    const cost = estimateCost(segs, "elevenlabs");
    // 두 자리 소수로 끊어진 형태인지.
    expect(Math.round(cost.total * 100) / 100).toBe(cost.total);
  });
});

describe("costEstimator / formatDuration", () => {
  it("formats sub-minute durations with leading zero seconds", () => {
    expect(formatDuration(5)).toBe("0:05");
  });

  it("formats minute boundary", () => {
    expect(formatDuration(60)).toBe("1:00");
  });

  it("formats > 10 minutes correctly", () => {
    expect(formatDuration(615)).toBe("10:15");
  });

  it("clamps negative input to zero", () => {
    expect(formatDuration(-30)).toBe("0:00");
  });

  it("floors fractional seconds", () => {
    expect(formatDuration(45.9)).toBe("0:45");
  });
});
