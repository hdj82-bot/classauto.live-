"use client";

import { useMemo } from "react";
import { useInboxI18n } from "./useInboxI18n";
import { ALL_STATUSES, aggregateByCourse } from "./inboxFilters";
import type {
  InboxFilters,
  InboxItem,
  InboxSort,
  InboxStatus,
} from "./inboxTypes";

interface Props {
  filters: InboxFilters;
  /** 전체 (필터 적용 *전*) 항목 — 강의/탭 카운트를 위해 필요. */
  allItems: InboxItem[];
  onChange: (next: InboxFilters) => void;
}

const SORT_OPTIONS: InboxSort[] = ["newest", "oldest", "similarity"];

const TAB_HINT_KEY: Record<InboxStatus, string> = {
  auto_answered: "filter.tabAutoHint",
  needs_professor: "filter.tabNeedsProfessorHint",
  off_topic_forwarded: "filter.tabOffTopicHint",
};

const TAB_LABEL_KEY: Record<InboxStatus, string> = {
  auto_answered: "filter.tabAuto",
  needs_professor: "filter.tabNeedsProfessor",
  off_topic_forwarded: "filter.tabOffTopic",
};

/**
 * 인박스 상단 필터 바 + 좌측 사이드바 — Gmail 스타일 3단 중 좌측·상단 통합.
 *
 * 데스크톱: 사이드바(강의 트리) + 상단 탭/검색/정렬을 한 컴포넌트로 합쳐
 * `inbox/page.tsx` 가 grid 로 배치하기 쉽게 함.
 *
 * 디자인:
 *   - 라이트 베이스 (`bg-white`) + 골드 활성 강조 (`amber-500`).
 *   - 데이터 시각화는 의미적 컬러 (`emerald` = 정상, `rose` = 액션) 허용.
 *   - prefers-reduced-motion 대응: 모든 transition 에 motion-reduce:transition-none.
 */
export default function FilterBar({ filters, allItems, onChange }: Props) {
  const { t } = useInboxI18n();

  const courses = useMemo(() => aggregateByCourse(allItems), [allItems]);

  /** 활성 강의에 속한 강의 영상만 노출. courseId === 'all' 일 땐 빈 배열. */
  const lecturesOfActiveCourse = useMemo(() => {
    if (filters.courseId === "all") return [];
    const c = courses.find((x) => x.courseId === filters.courseId);
    if (!c) return [];
    return c.lectures.map((l) => ({
      id: l.lectureId,
      title: l.lectureTitle,
      unanswered: l.unanswered,
      total: l.total,
    }));
  }, [courses, filters.courseId]);

  /** 탭별 카운트 — 현재 강의/탭 외 필터(미답변/검색)는 적용 안 함 (탭 자체가 status). */
  const tabCounts = useMemo(() => {
    const lowerSearch = filters.search.trim().toLowerCase();
    const out: Record<InboxStatus, { total: number; unanswered: number }> = {
      auto_answered: { total: 0, unanswered: 0 },
      needs_professor: { total: 0, unanswered: 0 },
      off_topic_forwarded: { total: 0, unanswered: 0 },
    };
    for (const it of allItems) {
      if (
        filters.courseId !== "all" &&
        it.lecture.courseId !== filters.courseId
      )
        continue;
      if (
        filters.lectureId !== "all" &&
        it.lecture.lectureId !== filters.lectureId
      )
        continue;
      if (lowerSearch) {
        const hay = (it.question + " " + (it.aiDraft ?? "")).toLowerCase();
        if (!hay.includes(lowerSearch)) continue;
      }
      out[it.status].total++;
      if (!it.professorAnswered) out[it.status].unanswered++;
    }
    return out;
  }, [allItems, filters.courseId, filters.lectureId, filters.search]);

  const handleCourseSelect = (courseId: string) => {
    if (courseId === filters.courseId) return;
    onChange({ ...filters, courseId, lectureId: "all" });
  };

  return (
    <section
      data-testid="inbox-filter-bar"
      className="flex flex-col gap-4"
      aria-label={t("filter.courseFilterTitle")}
    >
      {/* 강의별 사이드 — 라이트 베이스 + 골드 active */}
      <nav
        data-testid="inbox-course-filter"
        className="bg-white border border-gray-200 rounded-2xl p-3"
        aria-label={t("filter.courseFilterTitle")}
      >
        <h3 className="px-2 mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
          {t("filter.courseFilterTitle")}
        </h3>
        <ul className="space-y-1">
          <li>
            <button
              type="button"
              data-testid="inbox-course-all"
              data-active={filters.courseId === "all"}
              onClick={() => handleCourseSelect("all")}
              className={[
                "w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium transition motion-reduce:transition-none",
                filters.courseId === "all"
                  ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                  : "text-gray-700 hover:bg-gray-50",
              ].join(" ")}
            >
              <span className="truncate">{t("filter.courseAll")}</span>
              <CountBadge
                total={allItems.length}
                unanswered={allItems.reduce(
                  (n, it) => n + (it.professorAnswered ? 0 : 1),
                  0,
                )}
              />
            </button>
          </li>
          {courses.map((c) => (
            <li key={c.courseId}>
              <button
                type="button"
                data-testid={`inbox-course-${c.courseId}`}
                data-active={filters.courseId === c.courseId}
                onClick={() => handleCourseSelect(c.courseId)}
                className={[
                  "w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition motion-reduce:transition-none",
                  filters.courseId === c.courseId
                    ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200 font-medium"
                    : "text-gray-700 hover:bg-gray-50",
                ].join(" ")}
              >
                <span className="truncate">{c.courseTitle}</span>
                <CountBadge total={c.total} unanswered={c.unanswered} />
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* 강의 영상 단위 보조 필터 — 활성 강의가 정해지면 노출. */}
      {lecturesOfActiveCourse.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-3">
          <label
            htmlFor="inbox-lecture-select"
            className="block px-1 mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400"
          >
            {t("filter.lectureAll")}
          </label>
          <select
            id="inbox-lecture-select"
            data-testid="inbox-lecture-select"
            value={filters.lectureId}
            onChange={(e) =>
              onChange({ ...filters, lectureId: e.target.value })
            }
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
          >
            <option value="all">{t("filter.lectureAll")}</option>
            {lecturesOfActiveCourse.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title} ({l.unanswered}/{l.total})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 탭 — 3개 status. */}
      <div
        data-testid="inbox-status-tabs"
        role="tablist"
        aria-label={t("page.title")}
        className="bg-white border border-gray-200 rounded-2xl p-1.5 flex gap-1 overflow-x-auto"
      >
        {ALL_STATUSES.map((status) => {
          const active = filters.status === status;
          const count = tabCounts[status];
          return (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`inbox-tab-${status}`}
              onClick={() => onChange({ ...filters, status })}
              className={[
                "flex-1 min-w-fit text-left rounded-xl px-3 py-2 transition motion-reduce:transition-none",
                active
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-gray-700 hover:bg-gray-50",
              ].join(" ")}
            >
              <span className="block text-sm font-semibold leading-tight">
                {t(TAB_LABEL_KEY[status])}
              </span>
              <span
                className={[
                  "block text-[10px] mt-0.5 leading-none uppercase tracking-[0.14em]",
                  active ? "text-amber-50/90" : "text-gray-400",
                ].join(" ")}
              >
                {t(TAB_HINT_KEY[status])} ·{" "}
                <span
                  className="tabular-nums font-semibold"
                  data-testid={`inbox-tab-count-${status}`}
                >
                  {count.total}
                </span>
                {count.unanswered > 0 && (
                  <span className="ml-1 inline-flex items-center gap-0.5 align-middle">
                    <span
                      aria-hidden="true"
                      className={[
                        "w-1 h-1 rounded-full",
                        active ? "bg-white" : "bg-rose-500",
                      ].join(" ")}
                    />
                    <span className="tabular-nums">{count.unanswered}</span>
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* 검색 + 정렬 + 미답변 토글 */}
      <div className="flex flex-col sm:flex-row gap-2">
        <label className="relative flex-1">
          <span className="sr-only">{t("filter.searchPlaceholder")}</span>
          <input
            type="search"
            value={filters.search}
            data-testid="inbox-search"
            onChange={(e) =>
              onChange({ ...filters, search: e.target.value })
            }
            placeholder={t("filter.searchPlaceholder")}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
          />
        </label>
        <select
          aria-label={t("filter.sortLabel")}
          data-testid="inbox-sort-select"
          value={filters.sort}
          onChange={(e) =>
            onChange({ ...filters, sort: e.target.value as InboxSort })
          }
          className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {t(
                s === "newest"
                  ? "filter.sortNewest"
                  : s === "oldest"
                    ? "filter.sortOldest"
                    : "filter.sortSimilarity",
              )}
            </option>
          ))}
        </select>
        <label
          className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 cursor-pointer hover:bg-gray-50 transition motion-reduce:transition-none"
          data-testid="inbox-unanswered-only"
        >
          <input
            type="checkbox"
            checked={filters.unansweredOnly}
            onChange={(e) =>
              onChange({ ...filters, unansweredOnly: e.target.checked })
            }
            className="h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/30 accent-amber-500"
          />
          <span>{t("filter.unansweredOnly")}</span>
        </label>
      </div>
    </section>
  );
}

function CountBadge({
  total,
  unanswered,
}: {
  total: number;
  unanswered: number;
}) {
  if (total === 0) {
    return (
      <span className="text-[11px] tabular-nums text-gray-300">0</span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] tabular-nums">
      <span className="text-gray-500 font-medium">{total}</span>
      {unanswered > 0 && (
        <span
          className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-100 text-rose-700 font-semibold"
          aria-label={`${unanswered} unanswered`}
        >
          {unanswered}
        </span>
      )}
    </span>
  );
}
