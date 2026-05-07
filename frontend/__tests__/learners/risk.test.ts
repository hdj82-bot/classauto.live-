import { describe, it, expect } from "vitest";
import {
  computeRisk,
  daysSince,
  mergeLearnerRows,
} from "@/components/professor/learners/risk";

const NOW = Date.UTC(2026, 4, 7, 12, 0, 0); // 2026-05-07 12:00 UTC
const oneDayAgo = new Date(NOW - 24 * 60 * 60 * 1000).toISOString();
const fourDaysAgo = new Date(NOW - 4 * 24 * 60 * 60 * 1000).toISOString();
const today = new Date(NOW).toISOString();

describe("computeRisk", () => {
  it("returns 'completed' when status is completed", () => {
    expect(
      computeRisk({
        progressPct: 50,
        watchRatio: 50,
        status: "completed",
        startedAt: today,
        now: NOW,
      }),
    ).toBe("completed");
  });

  it("returns 'completed' when progress >= 100", () => {
    expect(
      computeRisk({
        progressPct: 100,
        watchRatio: 80,
        status: "in_progress",
        startedAt: today,
        now: NOW,
      }),
    ).toBe("completed");
  });

  it("returns 'high' when no startedAt at all (never watched)", () => {
    expect(
      computeRisk({
        progressPct: 0,
        watchRatio: 0,
        status: "pending",
        startedAt: null,
        now: NOW,
      }),
    ).toBe("high");
  });

  it("returns 'high' when 3+ days idle and not finished", () => {
    expect(
      computeRisk({
        progressPct: 80,
        watchRatio: 80,
        status: "in_progress",
        startedAt: fourDaysAgo,
        now: NOW,
      }),
    ).toBe("high");
  });

  it("returns 'high' when progress under 30%", () => {
    expect(
      computeRisk({
        progressPct: 10,
        watchRatio: 70,
        status: "in_progress",
        startedAt: today,
        now: NOW,
      }),
    ).toBe("high");
  });

  it("returns 'medium' when progress 30-70%", () => {
    expect(
      computeRisk({
        progressPct: 50,
        watchRatio: 80,
        status: "in_progress",
        startedAt: oneDayAgo,
        now: NOW,
      }),
    ).toBe("medium");
  });

  it("returns 'medium' when watch ratio under 50% even at high progress", () => {
    expect(
      computeRisk({
        progressPct: 90,
        watchRatio: 30,
        status: "in_progress",
        startedAt: today,
        now: NOW,
      }),
    ).toBe("medium");
  });

  it("returns 'low' when progress 70%+ and focus healthy", () => {
    expect(
      computeRisk({
        progressPct: 85,
        watchRatio: 80,
        status: "in_progress",
        startedAt: today,
        now: NOW,
      }),
    ).toBe("low");
  });
});

describe("daysSince", () => {
  it("returns 0 for today", () => {
    expect(daysSince(today, NOW)).toBe(0);
  });
  it("returns floored day count", () => {
    expect(daysSince(fourDaysAgo, NOW)).toBe(4);
  });
  it("returns null for null input", () => {
    expect(daysSince(null, NOW)).toBeNull();
  });
  it("returns null for unparseable input", () => {
    expect(daysSince("not-a-date", NOW)).toBeNull();
  });
});

describe("mergeLearnerRows", () => {
  it("merges attendance + engagement by user_id", () => {
    const rows = mergeLearnerRows(
      [
        {
          user_id: "u1",
          name: "Alice",
          student_number: "201912345",
          type: "live",
          started_at: today,
          progress_pct: 80,
          status: "in_progress",
        },
      ],
      [
        {
          userId: "u1",
          name: "Alice",
          student_number: "201912345",
          qaCount: 4,
          respondedCount: 3,
          noResponseCnt: 0,
          watchedSec: 600,
          totalSec: 800,
          responseRate: 75,
          watchRatio: 75,
        },
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe("u1");
    expect(rows[0].progressPct).toBe(80);
    expect(rows[0].watchRatio).toBe(75);
    expect(rows[0].qaCount).toBe(4);
    expect(rows[0].attendanceType).toBe("live");
  });

  it("includes engagement-only rows (no attendance)", () => {
    const rows = mergeLearnerRows(
      [],
      [
        {
          userId: "u2",
          name: "Bob",
          student_number: null,
          qaCount: 1,
          respondedCount: 0,
          noResponseCnt: 0,
          watchedSec: 0,
          totalSec: 0,
          responseRate: null,
          watchRatio: 0,
        },
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe("u2");
    expect(rows[0].progressPct).toBe(0);
  });

  it("includes attendance-only rows (no engagement)", () => {
    const rows = mergeLearnerRows(
      [
        {
          user_id: "u3",
          name: "Carol",
          student_number: "201955555",
          type: "vod",
          started_at: today,
          progress_pct: 25,
          status: "in_progress",
        },
      ],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe("u3");
    expect(rows[0].watchRatio).toBe(0);
    expect(rows[0].qaCount).toBe(0);
  });

  it("returns empty array when both inputs are undefined", () => {
    expect(mergeLearnerRows(undefined, undefined)).toEqual([]);
  });
});
