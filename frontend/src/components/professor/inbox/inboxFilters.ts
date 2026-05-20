import type {
  InboxFilters,
  InboxItem,
  InboxSort,
  InboxStatsSummary,
  InboxStatus,
} from "./inboxTypes";

export const ALL_STATUSES: InboxStatus[] = [
  "needs_professor",
  "auto_answered",
  "off_topic_forwarded",
];

export const DEFAULT_FILTERS: InboxFilters = {
  courseId: "all",
  lectureId: "all",
  status: "needs_professor",
  unansweredOnly: false,
  sort: "newest",
  search: "",
};

/** 정렬 비교자 — 동률일 때는 createdAt 보조키. */
export function sortItems(items: InboxItem[], sort: InboxSort): InboxItem[] {
  const sorted = [...items];
  switch (sort) {
    case "newest":
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      break;
    case "oldest":
      sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      break;
    case "similarity": {
      sorted.sort((a, b) => {
        const sa = a.rag.topSimilarity ?? -1;
        const sb = b.rag.topSimilarity ?? -1;
        if (sb !== sa) return sb - sa;
        return b.createdAt.localeCompare(a.createdAt);
      });
      break;
    }
  }
  return sorted;
}

/**
 * `filters.status` 는 *현재 활성 탭* 이고, `filters.courseId` /
 * `filters.lectureId` / `filters.unansweredOnly` / `filters.search` 는
 * 모든 탭 공통으로 적용. 본 함수는 활성 탭에 한정한 결과를 돌려준다.
 */
export function applyFilters(
  items: InboxItem[],
  filters: InboxFilters,
): InboxItem[] {
  const lowerSearch = filters.search.trim().toLowerCase();
  const filtered = items.filter((it) => {
    if (it.status !== filters.status) return false;
    if (filters.courseId !== "all" && it.lecture.courseId !== filters.courseId) {
      return false;
    }
    if (
      filters.lectureId !== "all" &&
      it.lecture.lectureId !== filters.lectureId
    ) {
      return false;
    }
    if (filters.unansweredOnly && it.professorAnswered) {
      return false;
    }
    if (lowerSearch) {
      const hay = (it.question + " " + (it.aiDraft ?? "")).toLowerCase();
      if (!hay.includes(lowerSearch)) return false;
    }
    return true;
  });
  return sortItems(filtered, filters.sort);
}

/** 강의 단위로 미답변 수를 합산해 사이드바 카운트 배지 데이터로 쓰기 좋게. */
export interface CourseAggregate {
  courseId: string;
  courseTitle: string;
  unanswered: number;
  total: number;
  lectures: LectureAggregate[];
}

export interface LectureAggregate {
  lectureId: string;
  lectureTitle: string;
  unanswered: number;
  total: number;
}

export function aggregateByCourse(items: InboxItem[]): CourseAggregate[] {
  const map = new Map<string, CourseAggregate>();
  for (const it of items) {
    const key = it.lecture.courseId;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        courseId: it.lecture.courseId,
        courseTitle: it.lecture.courseTitle,
        unanswered: 0,
        total: 0,
        lectures: [],
      };
      map.set(key, entry);
    }
    entry.total++;
    if (!it.professorAnswered) entry.unanswered++;

    let lec = entry.lectures.find(
      (l) => l.lectureId === it.lecture.lectureId,
    );
    if (!lec) {
      lec = {
        lectureId: it.lecture.lectureId,
        lectureTitle: it.lecture.lectureTitle,
        unanswered: 0,
        total: 0,
      };
      entry.lectures.push(lec);
    }
    lec.total++;
    if (!it.professorAnswered) lec.unanswered++;
  }
  return Array.from(map.values()).sort((a, b) =>
    a.courseTitle.localeCompare(b.courseTitle),
  );
}

/** 활성 탭의 미답변 카운트만 빠르게 뽑기. */
export function countByStatus(items: InboxItem[]): Record<InboxStatus, number> {
  const out: Record<InboxStatus, number> = {
    auto_answered: 0,
    needs_professor: 0,
    off_topic_forwarded: 0,
  };
  for (const it of items) out[it.status]++;
  return out;
}

// ── 단순화된 리포트 뷰 전용 헬퍼 ────────────────────────────────────────────

/**
 * 강의(course) + 검색만 적용해 정렬한 리스트. 기존 `applyFilters` 와 달리
 * status 필터를 적용하지 않아 모든 질문을 한 번에 본다 (리포트 뷰).
 */
export function applyReportFilters(
  items: InboxItem[],
  filters: { courseId: string; search: string; sort: InboxSort },
): InboxItem[] {
  const lowerSearch = filters.search.trim().toLowerCase();
  const filtered = items.filter((it) => {
    if (filters.courseId !== "all" && it.lecture.courseId !== filters.courseId) {
      return false;
    }
    if (lowerSearch) {
      const hay = (it.question + " " + (it.aiDraft ?? "")).toLowerCase();
      if (!hay.includes(lowerSearch)) return false;
    }
    return true;
  });
  return sortItems(filtered, filters.sort);
}

/** 강의 영상(lecture) 단위 묶음 — 리포트 그루핑 뷰. */
export interface LectureGroup {
  courseId: string;
  courseTitle: string;
  lectureId: string;
  lectureTitle: string;
  items: InboxItem[];
}

export function groupByLecture(items: InboxItem[]): LectureGroup[] {
  const map = new Map<string, LectureGroup>();
  for (const it of items) {
    const key = it.lecture.lectureId;
    let g = map.get(key);
    if (!g) {
      g = {
        courseId: it.lecture.courseId,
        courseTitle: it.lecture.courseTitle,
        lectureId: it.lecture.lectureId,
        lectureTitle: it.lecture.lectureTitle,
        items: [],
      };
      map.set(key, g);
    }
    g.items.push(it);
  }
  return Array.from(map.values());
}

/** UI 가 인박스 통계 카드 렌더에 쓰는 보조. */
export function summariseStats(
  items: InboxItem[],
  fallback?: InboxStatsSummary,
): InboxStatsSummary {
  const byStatus = countByStatus(items);
  const unanswered = items.reduce(
    (n, it) => n + (it.professorAnswered ? 0 : 1),
    0,
  );
  return {
    total: items.length,
    byStatus,
    unanswered,
    avgResponseHours: fallback?.avgResponseHours,
  };
}
