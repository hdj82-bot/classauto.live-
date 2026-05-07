import { describe, it, expect, vi, beforeEach } from "vitest";

const apiGet = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    get: (url: string) => apiGet(url),
  },
}));

import {
  fetchProfileSnapshot,
  mockStreak,
} from "@/components/student/profile/fetchProfile";
import type { UserBasic } from "@/components/student/profile/types";

const USER: UserBasic = {
  id: "u1",
  email: "alice@kyonggi.ac.kr",
  name: "앨리스",
  school: "경기대학교",
  department: "중어중문학과",
  studentNumber: "201912345",
};

beforeEach(() => {
  apiGet.mockReset();
});

describe("fetchProfileSnapshot", () => {
  it("returns the integrated endpoint payload when /api/v1/profile/me succeeds", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/v1/profile/me") {
        return {
          data: {
            user: USER,
            streak: { currentDays: 1, longestDays: 1, thisWeekDays: 1, days: [] },
            stats: {
              watchedMinutes: 10,
              videosCompleted: 0,
              averageAccuracy: null,
              questionsSent: 0,
              encouragementsReceived: 0,
            },
            inProgress: [],
            completed: [],
            certificates: [],
            encouragements: [],
            recentQuestions: [],
            mocked: false,
          },
        };
      }
      throw new Error("unreachable");
    });
    const snap = await fetchProfileSnapshot(USER);
    expect(snap.mocked).toBe(false);
    expect(snap.user.id).toBe("u1");
    expect(snap.stats.watchedMinutes).toBe(10);
  });

  it("falls back to fan-out (sessions) + mocks when /profile/me fails", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/v1/profile/me") throw new Error("404");
      if (url === "/api/v1/sessions") {
        return {
          data: [
            {
              id: "s1",
              lecture_id: "l1",
              status: "completed",
              watched_sec: 600,
              total_sec: 600,
              progress_pct: 100,
              started_at: "2026-05-04T09:00:00Z",
            },
          ],
        };
      }
      return { data: [] };
    });
    const snap = await fetchProfileSnapshot(USER);
    expect(snap.mocked).toBe(true);
    expect(snap.stats.watchedMinutes).toBe(10); // 600/60
    expect(snap.stats.videosCompleted).toBe(1);
    // 비-empty mock 콜백
    expect(snap.inProgress.length).toBeGreaterThan(0);
  });

  it("returns full mock when both endpoints fail", async () => {
    apiGet.mockRejectedValue(new Error("network down"));
    const snap = await fetchProfileSnapshot(USER);
    expect(snap.mocked).toBe(true);
    expect(snap.streak.days.length).toBeGreaterThan(0);
  });
});

describe("mockStreak", () => {
  it("produces a deterministic 90-day window", () => {
    const a = mockStreak([]);
    const b = mockStreak([]);
    expect(a.days.length).toBe(90);
    expect(a.days.length).toBe(b.days.length);
    // 두 호출이 같은 내용이어야 결정론적 (의사난수 해시).
    expect(a.days[0].date).toBe(b.days[0].date);
    expect(a.days[0].watchedMinutes).toBe(b.days[0].watchedMinutes);
  });

  it("boosts a date that appears in actualDates set", () => {
    const today = new Date().toISOString().slice(0, 10);
    const boosted = mockStreak([today]);
    const day = boosted.days.find((d) => d.date === today);
    expect(day).toBeDefined();
    expect(day!.watchedMinutes).toBeGreaterThanOrEqual(15);
  });
});
