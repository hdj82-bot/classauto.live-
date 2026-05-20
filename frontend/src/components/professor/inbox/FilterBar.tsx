"use client";

import { useMemo } from "react";
import { useInboxI18n } from "./useInboxI18n";
import { aggregateByCourse } from "./inboxFilters";
import type { InboxItem, InboxSort } from "./inboxTypes";

interface Props {
  /** "all" 또는 courseId. */
  courseId: string;
  search: string;
  sort: InboxSort;
  /** 전체 항목 — 강의 카운트 표시용. */
  allItems: InboxItem[];
  onChange: (next: { courseId: string; search: string; sort: InboxSort }) => void;
}

/**
 * 리포트 뷰 필터 — 좌측 강의별 사이드바 + 검색·정렬.
 *
 * 2026-05 redesign: status 탭, 미답변 토글, 유사도 정렬은 폐기되었습니다.
 * 강의별 카운트는 status 와 무관하게 강의(course) 전체 질문 수로 노출.
 */
const SORT_OPTIONS: InboxSort[] = ["newest", "oldest"];

export default function FilterBar({
  courseId,
  search,
  sort,
  allItems,
  onChange,
}: Props) {
  const { t } = useInboxI18n();
  const courses = useMemo(() => aggregateByCourse(allItems), [allItems]);

  const handleCourse = (next: string) => {
    if (next === courseId) return;
    onChange({ courseId: next, search, sort });
  };

  return (
    <section
      data-testid="inbox-filter-bar"
      className="flex flex-col gap-4"
      aria-label={t("filter.courseFilterTitle")}
    >
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
              data-active={courseId === "all"}
              onClick={() => handleCourse("all")}
              className={[
                "w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium transition motion-reduce:transition-none",
                courseId === "all"
                  ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                  : "text-gray-700 hover:bg-gray-50",
              ].join(" ")}
            >
              <span className="truncate">{t("filter.courseAll")}</span>
              <span className="text-[11px] tabular-nums text-gray-500 font-medium">
                {allItems.length}
              </span>
            </button>
          </li>
          {courses.map((c) => (
            <li key={c.courseId}>
              <button
                type="button"
                data-testid={`inbox-course-${c.courseId}`}
                data-active={courseId === c.courseId}
                onClick={() => handleCourse(c.courseId)}
                className={[
                  "w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition motion-reduce:transition-none",
                  courseId === c.courseId
                    ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200 font-medium"
                    : "text-gray-700 hover:bg-gray-50",
                ].join(" ")}
              >
                <span className="truncate">{c.courseTitle}</span>
                <span className="text-[11px] tabular-nums text-gray-500 font-medium">
                  {c.total}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="bg-white border border-gray-200 rounded-2xl p-3 flex flex-col gap-2">
        <label className="relative">
          <span className="sr-only">{t("filter.searchPlaceholder")}</span>
          <input
            type="search"
            value={search}
            data-testid="inbox-search"
            onChange={(e) => onChange({ courseId, search: e.target.value, sort })}
            placeholder={t("filter.searchPlaceholder")}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
          />
        </label>
        <select
          aria-label={t("filter.sortLabel")}
          data-testid="inbox-sort-select"
          value={sort}
          onChange={(e) =>
            onChange({ courseId, search, sort: e.target.value as InboxSort })
          }
          className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {t(s === "newest" ? "filter.sortNewest" : "filter.sortOldest")}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
