import { describe, it, expect } from "vitest";
import { aggregateDashboardHub } from "@/components/professor/dashboardHome/aggregate";

const lectures = [
  {
    id: "L1",
    title: "강의 A",
    is_published: true,
    created_at: new Date().toISOString(), // 이번 달
    video_url: null,
  },
  {
    id: "L2",
    title: "강의 B",
    is_published: false,
    created_at: "2024-01-01T00:00:00Z", // 과거
    video_url: null,
  },
];

const failuresAllOk = {
  attendance: false,
  scores: false,
  engagement: false,
  qa: false,
  cost: false,
};

describe("aggregateDashboardHub", () => {
  it("emits zeroed stats with empty maps", () => {
    const out = aggregateDashboardHub({
      lectures: [],
      attendance: new Map(),
      scores: new Map(),
      engagement: new Map(),
      qa: new Map(),
      cost: new Map(),
      failures: failuresAllOk,
    });
    expect(out.stats.watchCompletionPct).toBe(0);
    expect(out.stats.avgAccuracyPct).toBe(0);
    expect(out.stats.pendingQaCount).toBe(0);
    expect(out.stats.activeLearners).toBe(0);
    expect(out.stats.monthlyVideoCount).toBe(0);
    expect(out.stats.totalCostUsd).toBe(0);
    expect(out.donut.total).toBe(0);
    expect(out.attention.pendingQa).toEqual([]);
    expect(out.activity).toEqual([]);
  });

  it("aggregates attendance into watch completion + donut", () => {
    const attendance = new Map<string, unknown>([
      [
        "L1",
        {
          lecture_id: "L1",
          summary: { total: 4, live: 2, vod: 2 },
          students: [
            { user_id: "u1", name: "A", type: "live", started_at: null, progress_pct: 100, status: "completed" },
            { user_id: "u2", name: "B", type: "vod", started_at: null, progress_pct: 100, status: "completed" },
            { user_id: "u3", name: "C", type: "vod", started_at: null, progress_pct: 50, status: "in_progress" },
            { user_id: "u4", name: "D", type: "vod", started_at: null, progress_pct: 0, status: "not_started" },
          ],
        },
      ],
    ]);
    const out = aggregateDashboardHub({
      lectures,
      attendance: attendance as never,
      scores: new Map(),
      engagement: new Map(),
      qa: new Map(),
      cost: new Map(),
      failures: failuresAllOk,
    });
    // 2/4 = 50%
    expect(out.stats.watchCompletionPct).toBe(50);
    expect(out.stats.activeLearners).toBe(4);
    expect(out.donut).toEqual({
      completed: 2,
      inProgress: 1,
      notStarted: 1,
      total: 4,
    });
  });

  it("aggregates scores with weighted average across lectures", () => {
    const scores = new Map<string, unknown>([
      ["L1", { lecture_id: "L1", totalQuestions: 10, overallAccuracy: 80 }],
      ["L2", { lecture_id: "L2", totalQuestions: 30, overallAccuracy: 60 }],
    ]);
    const out = aggregateDashboardHub({
      lectures,
      attendance: new Map(),
      scores: scores as never,
      engagement: new Map(),
      qa: new Map(),
      cost: new Map(),
      failures: failuresAllOk,
    });
    // weighted: (80*10 + 60*30) / 40 = 65
    expect(out.stats.avgAccuracyPct).toBe(65);
  });

  it("counts pending Q&A and surfaces top 5 newest", () => {
    const qa = new Map<string, unknown>([
      [
        "L1",
        {
          lecture_id: "L1",
          totalCount: 6,
          logs: [
            ...Array.from({ length: 6 }, (_, i) => ({
              id: `q${i}`,
              question: `Q${i}`,
              in_scope: true,
              responded: false,
              created_at: new Date(2026, 4, 7, 10 - i).toISOString(),
            })),
          ],
        },
      ],
    ]);
    const out = aggregateDashboardHub({
      lectures,
      attendance: new Map(),
      scores: new Map(),
      engagement: new Map(),
      qa: qa as never,
      cost: new Map(),
      failures: failuresAllOk,
    });
    expect(out.stats.pendingQaCount).toBe(6);
    expect(out.attention.pendingQa.length).toBe(5);
    // 가장 최신(q0) 이 최상단
    expect(out.attention.pendingQa[0].id).toBe("q0");
  });

  it("counts only this-month created lectures into monthlyVideoCount", () => {
    const out = aggregateDashboardHub({
      lectures, // L1 = this month, L2 = old
      attendance: new Map(),
      scores: new Map(),
      engagement: new Map(),
      qa: new Map(),
      cost: new Map(),
      failures: failuresAllOk,
    });
    expect(out.stats.monthlyVideoCount).toBe(1);
  });

  it("activates frequent-pause widget when engagement.slides arrive", () => {
    const engagement = new Map<string, unknown>([
      [
        "L1",
        {
          lecture_id: "L1",
          summary: {
            totalStudents: 0,
            totalQAQuestions: 0,
            overallResponseRate: 0,
            totalNoResponseEvents: 0,
          },
          students: [],
          slides: [
            { index: 2, replays: 9, drops: 0 },
            { index: 4, replays: 4, drops: 1 },
            { index: 1, replays: 12, drops: 2 },
            { index: 0, replays: 1, drops: 0 },
          ],
        },
      ],
    ]);
    const out = aggregateDashboardHub({
      lectures,
      attendance: new Map(),
      scores: new Map(),
      engagement: engagement as never,
      qa: new Map(),
      cost: new Map(),
      failures: failuresAllOk,
    });
    expect(out.attention.frequentPauseSlides.length).toBe(3);
    // 정렬: replays desc → 12, 9, 4
    expect(out.attention.frequentPauseSlides[0].replays).toBe(12);
    expect(out.attention.frequentPauseSlides[1].replays).toBe(9);
    expect(out.attention.frequentPauseSlides[2].replays).toBe(4);
  });
});
