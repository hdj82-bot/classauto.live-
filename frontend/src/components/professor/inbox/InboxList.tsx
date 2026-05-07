"use client";

import { useMemo } from "react";
import { useInboxI18n } from "./useInboxI18n";
import type { InboxItem, InboxStatus } from "./inboxTypes";

interface Props {
  items: InboxItem[];
  selectedId: string | null;
  selectedIds: Set<string>;
  onSelectItem: (id: string) => void;
  onToggleCheck: (id: string, checked: boolean) => void;
  onToggleSelectAll: (checked: boolean) => void;
}

const STATUS_TAG_KEY: Record<InboxStatus, string> = {
  auto_answered: "list.respondedTag",
  needs_professor: "list.needsReviewTag",
  off_topic_forwarded: "list.offTopicTag",
};

const STATUS_TAG_TONE: Record<InboxStatus, string> = {
  auto_answered: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  needs_professor: "bg-rose-50 text-rose-700 ring-rose-200",
  off_topic_forwarded: "bg-gray-100 text-gray-600 ring-gray-200",
};

/**
 * 인박스 중앙 리스트 — Gmail 스타일.
 *
 * - 항목 좌측에 `<input type="checkbox">` 로 일괄 선택 (BulkAnswerBar 와 연동).
 * - 카드 클릭 시 우측 패널에 상세 (`onSelectItem`).
 * - 시각: 라이트 베이스 + 골드 active outline. 미답변 액션 컬러는 rose (의미적).
 * - tabular-nums 로 시각·카운트 정렬.
 */
export default function InboxList({
  items,
  selectedId,
  selectedIds,
  onSelectItem,
  onToggleCheck,
  onToggleSelectAll,
}: Props) {
  const { t, locale } = useInboxI18n();

  const allChecked = useMemo(
    () => items.length > 0 && items.every((it) => selectedIds.has(it.id)),
    [items, selectedIds],
  );

  if (items.length === 0) {
    return (
      <div
        data-testid="inbox-list-empty"
        className="bg-white border border-gray-200 rounded-2xl p-10 text-center"
      >
        <p className="text-sm font-medium text-gray-700">{t("page.empty")}</p>
        <p className="text-sm text-gray-500 mt-1">{t("page.emptyDesc")}</p>
      </div>
    );
  }

  return (
    <section
      data-testid="inbox-list"
      aria-label={t("list.ariaLabel")}
      className="bg-white border border-gray-200 rounded-2xl"
    >
      {/* 전체 선택 */}
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100">
        <label className="inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            data-testid="inbox-select-all"
            checked={allChecked}
            onChange={(e) => onToggleSelectAll(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/30 accent-amber-500"
            aria-label={
              allChecked ? t("filter.deselectAll") : t("filter.selectAll")
            }
          />
          <span>
            {selectedIds.size > 0
              ? t("filter.selectedCount", { count: selectedIds.size })
              : t("filter.selectAll")}
          </span>
        </label>
        <span className="text-[11px] tabular-nums text-gray-400">
          {items.length}
        </span>
      </header>

      <ul className="divide-y divide-gray-100">
        {items.map((it) => (
          <li key={it.id}>
            <Row
              item={it}
              isSelected={selectedId === it.id}
              isChecked={selectedIds.has(it.id)}
              onSelect={() => onSelectItem(it.id)}
              onCheck={(checked) => onToggleCheck(it.id, checked)}
              t={t}
              locale={locale}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

interface RowProps {
  item: InboxItem;
  isSelected: boolean;
  isChecked: boolean;
  onSelect: () => void;
  onCheck: (checked: boolean) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: "ko" | "en";
}

function Row({ item, isSelected, isChecked, onSelect, onCheck, t, locale }: RowProps) {
  const tagToneCls = STATUS_TAG_TONE[item.status];
  const studentName = item.student.name ?? t("list.studentAnonymous");
  const slidesLabel =
    item.rag.topSlideNumbers.length > 0
      ? t("list.slideRef", {
          slides: item.rag.topSlideNumbers.join(", "),
        })
      : null;

  return (
    <div
      data-testid={`inbox-row-${item.id}`}
      data-selected={isSelected}
      data-checked={isChecked}
      className={[
        "flex items-start gap-3 px-3 py-3 transition motion-reduce:transition-none",
        isSelected
          ? "bg-amber-50/70 ring-1 ring-inset ring-amber-200"
          : "hover:bg-gray-50",
      ].join(" ")}
    >
      <input
        type="checkbox"
        data-testid={`inbox-row-check-${item.id}`}
        checked={isChecked}
        onChange={(e) => {
          e.stopPropagation();
          onCheck(e.target.checked);
        }}
        onClick={(e) => e.stopPropagation()}
        aria-label={t("list.selectItem")}
        className="mt-1 h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/30 accent-amber-500"
      />
      <button
        type="button"
        data-testid={`inbox-row-open-${item.id}`}
        onClick={onSelect}
        aria-label={t("list.openItem")}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span
            className={[
              "text-[10px] uppercase tracking-[0.14em] font-semibold rounded-full px-2 py-0.5 ring-1 ring-inset",
              tagToneCls,
            ].join(" ")}
          >
            {t(STATUS_TAG_KEY[item.status])}
          </span>
          {item.professorAnswered && (
            <span
              className="text-[10px] uppercase tracking-[0.14em] font-semibold rounded-full px-2 py-0.5 ring-1 ring-inset bg-amber-50 text-amber-800 ring-amber-200"
              data-testid={`inbox-row-confirmed-${item.id}`}
            >
              {t("list.professorAnsweredTag")}
            </span>
          )}
          {item.rag.topSimilarity !== null && (
            <span className="text-[10px] tabular-nums text-gray-400 font-medium">
              {t("list.similarityLabel", {
                value: Math.round(item.rag.topSimilarity * 100),
              })}
            </span>
          )}
        </div>

        <p className="text-sm font-semibold text-gray-900 truncate">
          {item.question}
        </p>
        <p className="text-xs text-gray-500 mt-1 truncate">
          {studentName}
          <span className="text-gray-300 mx-1.5" aria-hidden="true">
            ·
          </span>
          {item.lecture.courseTitle}
          <span className="text-gray-300 mx-1.5" aria-hidden="true">
            ·
          </span>
          {item.lecture.lectureTitle}
          {slidesLabel && (
            <>
              <span className="text-gray-300 mx-1.5" aria-hidden="true">
                ·
              </span>
              {slidesLabel}
            </>
          )}
        </p>
      </button>

      <span
        className="shrink-0 text-[11px] text-gray-400 tabular-nums whitespace-nowrap mt-1"
        title={item.createdAt}
      >
        {formatRelative(item.createdAt, locale, t)}
      </span>
    </div>
  );
}

/**
 * 간단한 상대 시간 포매터. Intl.RelativeTimeFormat 가 jsdom 에서도 동작하지만
 * 일관된 i18n 통제를 위해 직접 분기.
 */
function formatRelative(
  iso: string,
  _locale: "ko" | "en",
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const diffMin = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (diffMin < 1) return t("list.timeJustNow");
  if (diffMin < 60) return t("list.timeMinutesAgo", { n: diffMin });
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return t("list.timeHoursAgo", { n: diffHr });
  const diffDay = Math.round(diffHr / 24);
  return t("list.timeDaysAgo", { n: diffDay });
}
