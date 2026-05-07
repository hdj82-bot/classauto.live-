import { describe, it, expect } from "vitest";
import {
  ALL_STATUSES,
  DEFAULT_FILTERS,
  aggregateByCourse,
  applyFilters,
  countByStatus,
  sortItems,
  summariseStats,
} from "@/components/professor/inbox/inboxFilters";
import type { InboxItem, InboxStatus } from "@/components/professor/inbox/inboxTypes";

function makeItem(over: Partial<InboxItem> & { id: string; status: InboxStatus }): InboxItem {
  return {
    id: over.id,
    status: over.status,
    inScope: over.inScope ?? over.status !== "off_topic_forwarded",
    professorAnswered: over.professorAnswered ?? false,
    responded: over.responded ?? over.status !== "off_topic_forwarded",
    question: over.question ?? `q-${over.id}`,
    aiDraft: over.aiDraft ?? null,
    professorAnswer: over.professorAnswer ?? null,
    costUsd: over.costUsd ?? 0,
    createdAt: over.createdAt ?? "2026-05-01T00:00:00.000Z",
    reviewedAt: over.reviewedAt ?? null,
    student: over.student ?? { id: "s1", name: "Alice" },
    lecture:
      over.lecture ?? {
        lectureId: "l1",
        lectureTitle: "L1",
        courseId: "c1",
        courseTitle: "C1",
        timestampSec: null,
      },
    rag:
      over.rag ?? {
        topSlideNumbers: [],
        topSimilarity: 0.8,
      },
  };
}

describe("inboxFilters", () => {
  describe("DEFAULT_FILTERS", () => {
    it("starts on the needs_professor tab so action items are surfaced first", () => {
      expect(DEFAULT_FILTERS.status).toBe("needs_professor");
      expect(ALL_STATUSES).toContain("needs_professor");
    });
  });

  describe("sortItems", () => {
    const a = makeItem({ id: "a", status: "auto_answered", createdAt: "2026-05-01T00:00:00.000Z", rag: { topSlideNumbers: [], topSimilarity: 0.5 } });
    const b = makeItem({ id: "b", status: "auto_answered", createdAt: "2026-05-03T00:00:00.000Z", rag: { topSlideNumbers: [], topSimilarity: 0.9 } });
    const c = makeItem({ id: "c", status: "auto_answered", createdAt: "2026-05-02T00:00:00.000Z", rag: { topSlideNumbers: [], topSimilarity: 0.7 } });

    it("sorts newest first by default", () => {
      const sorted = sortItems([a, b, c], "newest").map((it) => it.id);
      expect(sorted).toEqual(["b", "c", "a"]);
    });

    it("sorts oldest first", () => {
      const sorted = sortItems([a, b, c], "oldest").map((it) => it.id);
      expect(sorted).toEqual(["a", "c", "b"]);
    });

    it("sorts by similarity (descending) with createdAt as tiebreaker", () => {
      const sorted = sortItems([a, b, c], "similarity").map((it) => it.id);
      expect(sorted).toEqual(["b", "c", "a"]);
    });
  });

  describe("applyFilters", () => {
    const items: InboxItem[] = [
      makeItem({
        id: "n1",
        status: "needs_professor",
        professorAnswered: false,
        question: "후커우 제도",
        lecture: {
          lectureId: "l1",
          lectureTitle: "1주차",
          courseId: "c1",
          courseTitle: "현대중국",
          timestampSec: null,
        },
      }),
      makeItem({
        id: "n2",
        status: "needs_professor",
        professorAnswered: true,
        question: "다른 질문",
        lecture: {
          lectureId: "l2",
          lectureTitle: "2주차",
          courseId: "c1",
          courseTitle: "현대중국",
          timestampSec: null,
        },
      }),
      makeItem({
        id: "a1",
        status: "auto_answered",
        question: "별개 강의 질문",
        lecture: {
          lectureId: "l3",
          lectureTitle: "1주차",
          courseId: "c2",
          courseTitle: "코퍼스",
          timestampSec: null,
        },
      }),
      makeItem({
        id: "o1",
        status: "off_topic_forwarded",
        inScope: false,
        question: "시험범위 알려주세요",
        lecture: {
          lectureId: "l1",
          lectureTitle: "1주차",
          courseId: "c1",
          courseTitle: "현대중국",
          timestampSec: null,
        },
      }),
    ];

    it("only returns items whose status matches the active tab", () => {
      const result = applyFilters(items, {
        ...DEFAULT_FILTERS,
        status: "needs_professor",
      });
      expect(result.map((it) => it.id).sort()).toEqual(["n1", "n2"]);
    });

    it("filters by course", () => {
      const result = applyFilters(items, {
        ...DEFAULT_FILTERS,
        status: "auto_answered",
        courseId: "c2",
      });
      expect(result.map((it) => it.id)).toEqual(["a1"]);
    });

    it("filters by lecture inside the chosen course", () => {
      const result = applyFilters(items, {
        ...DEFAULT_FILTERS,
        status: "needs_professor",
        courseId: "c1",
        lectureId: "l2",
      });
      expect(result.map((it) => it.id)).toEqual(["n2"]);
    });

    it("hides professor-answered items when unansweredOnly is set", () => {
      const result = applyFilters(items, {
        ...DEFAULT_FILTERS,
        status: "needs_professor",
        unansweredOnly: true,
      });
      expect(result.map((it) => it.id)).toEqual(["n1"]);
    });

    it("matches the search string against question text", () => {
      const result = applyFilters(items, {
        ...DEFAULT_FILTERS,
        status: "off_topic_forwarded",
        search: "시험",
      });
      expect(result.map((it) => it.id)).toEqual(["o1"]);
    });
  });

  describe("aggregateByCourse", () => {
    it("groups items by course and counts unanswered per lecture", () => {
      const items: InboxItem[] = [
        makeItem({
          id: "1",
          status: "needs_professor",
          professorAnswered: false,
          lecture: {
            lectureId: "lA",
            lectureTitle: "A",
            courseId: "course-x",
            courseTitle: "X",
            timestampSec: null,
          },
        }),
        makeItem({
          id: "2",
          status: "auto_answered",
          professorAnswered: true,
          lecture: {
            lectureId: "lA",
            lectureTitle: "A",
            courseId: "course-x",
            courseTitle: "X",
            timestampSec: null,
          },
        }),
        makeItem({
          id: "3",
          status: "needs_professor",
          professorAnswered: false,
          lecture: {
            lectureId: "lB",
            lectureTitle: "B",
            courseId: "course-y",
            courseTitle: "Y",
            timestampSec: null,
          },
        }),
      ];
      const agg = aggregateByCourse(items);
      expect(agg.map((c) => c.courseId).sort()).toEqual(["course-x", "course-y"]);
      const x = agg.find((c) => c.courseId === "course-x")!;
      expect(x.total).toBe(2);
      expect(x.unanswered).toBe(1);
      expect(x.lectures).toHaveLength(1);
      expect(x.lectures[0].unanswered).toBe(1);
      expect(x.lectures[0].total).toBe(2);
    });
  });

  describe("countByStatus / summariseStats", () => {
    it("counts items per status and unanswered total", () => {
      const items: InboxItem[] = [
        makeItem({ id: "1", status: "auto_answered", professorAnswered: true }),
        makeItem({ id: "2", status: "needs_professor", professorAnswered: false }),
        makeItem({ id: "3", status: "needs_professor", professorAnswered: false }),
        makeItem({ id: "4", status: "off_topic_forwarded", professorAnswered: false }),
      ];
      const counts = countByStatus(items);
      expect(counts.auto_answered).toBe(1);
      expect(counts.needs_professor).toBe(2);
      expect(counts.off_topic_forwarded).toBe(1);

      const stats = summariseStats(items, { total: 4, byStatus: counts, unanswered: 0, avgResponseHours: 5 });
      expect(stats.total).toBe(4);
      expect(stats.unanswered).toBe(3);
      expect(stats.avgResponseHours).toBe(5);
    });
  });
});
