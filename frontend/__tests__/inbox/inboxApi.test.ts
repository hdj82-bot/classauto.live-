import { describe, it, expect, vi, beforeEach } from "vitest";

const apiGet = vi.fn();
const apiPatch = vi.fn();
const apiPost = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    get: (url: string) => apiGet(url),
    patch: (url: string, body: unknown) => apiPatch(url, body),
    post: (url: string, body: unknown) => apiPost(url, body),
  },
}));

import { inboxApi } from "@/components/professor/inbox/inboxApi";

const RESOLVE = (k: string) => `[${k}]`;

beforeEach(() => {
  apiGet.mockReset();
  apiPatch.mockReset();
  apiPost.mockReset();
  inboxApi._clearLocalOverrides();
});

describe("inboxApi.list", () => {
  it("uses /api/v1/inbox when available", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/v1/inbox") {
        return {
          data: {
            items: [
              {
                id: "x1",
                status: "needs_professor",
                inScope: true,
                professorAnswered: false,
                responded: true,
                question: "Q",
                aiDraft: null,
                professorAnswer: null,
                costUsd: 0,
                createdAt: "2026-05-01T00:00:00Z",
                reviewedAt: null,
                student: { id: "s", name: "S", studentNumber: null },
                lecture: { lectureId: "l", lectureTitle: "L", courseId: "c", courseTitle: "C", timestampSec: null },
                rag: { topSlideNumbers: [], topSimilarity: null },
              },
            ],
            stats: {
              total: 1,
              byStatus: { auto_answered: 0, needs_professor: 1, off_topic_forwarded: 0 },
              unanswered: 1,
            },
          },
        };
      }
      throw new Error("not called");
    });
    const result = await inboxApi.list({ resolve: RESOLVE });
    expect(result.deferred).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("x1");
  });

  it("falls back to dashboard fan-out when /api/v1/inbox 404s", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/v1/inbox") {
        const err = Object.assign(new Error("not found"), {
          response: { status: 404 },
        });
        throw err;
      }
      if (url === "/api/courses") {
        return { data: [{ id: "c1", title: "Course 1" }] };
      }
      if (url === "/api/courses/c1/lectures") {
        return { data: [{ id: "lec1", title: "Lecture 1" }] };
      }
      if (url.startsWith("/api/v1/dashboard/lec1/qa")) {
        return {
          data: {
            lecture_id: "lec1",
            page: 1,
            limit: 200,
            totalCount: 2,
            totalPages: 1,
            logs: [
              {
                id: "log-a",
                question: "in scope, ai answered",
                answer: "draft a",
                in_scope: true,
                responded: true,
                cost_usd: 0.001,
                created_at: "2026-05-01T00:00:00Z",
              },
              {
                id: "log-b",
                question: "out of scope",
                answer: null,
                in_scope: false,
                responded: false,
                cost_usd: 0,
                created_at: "2026-05-02T00:00:00Z",
              },
            ],
          },
        };
      }
      throw new Error(`unhandled ${url}`);
    });

    const result = await inboxApi.list({ resolve: RESOLVE });
    expect(result.deferred).toBe(false);
    expect(result.items).toHaveLength(2);
    const auto = result.items.find((it) => it.id === "log-a");
    const off = result.items.find((it) => it.id === "log-b");
    expect(auto?.status).toBe("auto_answered");
    expect(auto?.lecture.courseTitle).toBe("Course 1");
    expect(off?.status).toBe("off_topic_forwarded");
    expect(off?.inScope).toBe(false);
  });

  it("falls back to mock seeds when courses API yields nothing", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/v1/inbox") {
        const err = Object.assign(new Error("not found"), {
          response: { status: 404 },
        });
        throw err;
      }
      if (url === "/api/courses") {
        return { data: [] };
      }
      throw new Error(`unhandled ${url}`);
    });

    const result = await inboxApi.list({ resolve: RESOLVE });
    expect(result.deferred).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);
    // mock 데이터에는 3개 상태가 모두 포함되어야 함 (UI 데모 가능)
    const statuses = new Set(result.items.map((it) => it.status));
    expect(statuses.has("auto_answered")).toBe(true);
    expect(statuses.has("needs_professor")).toBe(true);
    expect(statuses.has("off_topic_forwarded")).toBe(true);
    // resolve 가 questionI18nKey 를 텍스트로 바꿔준다
    expect(result.items[0].question.startsWith("[mock.")).toBe(true);
  });
});

describe("inboxApi.answer (deferred path)", () => {
  it("stores override locally when backend rejects", async () => {
    // first list call → mock path so we have the seed
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/v1/inbox") throw Object.assign(new Error(), { response: { status: 404 } });
      if (url === "/api/courses") return { data: [] };
      throw new Error(`unhandled ${url}`);
    });
    apiPatch.mockRejectedValue(Object.assign(new Error(), { response: { status: 404 } }));

    const before = await inboxApi.list({ resolve: RESOLVE });
    const target = before.items.find((it) => it.status === "needs_professor")!;
    expect(target).toBeDefined();

    const res = await inboxApi.answer(target.id, {
      body: "Confirmed reply",
      notify: true,
      mode: "send",
    });
    expect(res.ok).toBe(true);
    expect(res.deferred).toBe(true);

    const after = await inboxApi.list({ resolve: RESOLVE });
    const persisted = after.items.find((it) => it.id === target.id);
    expect(persisted?.professorAnswer).toBe("Confirmed reply");
    expect(persisted?.professorAnswered).toBe(true);
    expect(persisted?.responded).toBe(true);
  });
});

describe("inboxApi.bulkConfirm (deferred path)", () => {
  it("returns all ids as success and persists locally", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/v1/inbox") throw Object.assign(new Error(), { response: { status: 404 } });
      if (url === "/api/courses") return { data: [] };
      throw new Error(`unhandled ${url}`);
    });
    apiPost.mockRejectedValue(Object.assign(new Error(), { response: { status: 404 } }));

    const before = await inboxApi.list({ resolve: RESOLVE });
    const ids = before.items.slice(0, 2).map((it) => it.id);
    const res = await inboxApi.bulkConfirm({ ids, useAiDraft: true, notify: true });
    expect(res.deferred).toBe(true);
    expect(res.successIds).toEqual(ids);
    expect(res.failedIds).toEqual([]);

    const after = await inboxApi.list({ resolve: RESOLVE });
    for (const id of ids) {
      const it = after.items.find((x) => x.id === id);
      expect(it?.professorAnswered).toBe(true);
    }
  });
});
