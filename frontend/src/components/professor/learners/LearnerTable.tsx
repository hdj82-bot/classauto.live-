"use client";

import { useMemo } from "react";
import ProgressBar from "./ProgressBar";
import RiskBadge from "./RiskBadge";
import { computeRisk, daysSince, type RiskLevel } from "./risk";
import type { LearnerRow } from "./types";
import { useLearnersI18n } from "./useLearnersI18n";

export type LearnerFilter = "all" | "at-risk" | "completed" | "in-progress";
export type LearnerSortKey =
  | "name"
  | "progressPct"
  | "watchRatio"
  | "qaCount"
  | "responseRate"
  | "lastActivity";

interface Props {
  rows: LearnerRow[];
  filter: LearnerFilter;
  sortKey: LearnerSortKey;
  sortDir: "asc" | "desc";
  search: string;
  selectedIds: Set<string>;
  onToggleSelect: (userId: string) => void;
  onToggleSelectAll: (next: boolean) => void;
  onSort: (key: LearnerSortKey) => void;
  onOpenDetail: (userId: string) => void;
  /** 시간 비교 기준 — 테스트에서 결정론적으로 주입. */
  now?: number;
}

interface Decorated extends LearnerRow {
  risk: RiskLevel;
  daysIdle: number | null;
}

function decorate(row: LearnerRow, now: number): Decorated {
  return {
    ...row,
    risk: computeRisk({
      progressPct: row.progressPct,
      watchRatio: row.watchRatio,
      status: row.status,
      startedAt: row.startedAt,
      now,
    }),
    daysIdle: daysSince(row.startedAt, now),
  };
}

function applyFilter(rows: Decorated[], f: LearnerFilter): Decorated[] {
  switch (f) {
    case "at-risk":
      return rows.filter((r) => r.risk === "high");
    case "completed":
      return rows.filter((r) => r.risk === "completed");
    case "in-progress":
      return rows.filter((r) => r.risk !== "completed");
    case "all":
    default:
      return rows;
  }
}

function applySearch(rows: Decorated[], q: string): Decorated[] {
  const trimmed = q.trim().toLowerCase();
  if (!trimmed) return rows;
  return rows.filter((r) => {
    const inName = r.name?.toLowerCase().includes(trimmed);
    const inNumber = (r.studentNumber ?? "").toLowerCase().includes(trimmed);
    return inName || inNumber;
  });
}

function applySort(
  rows: Decorated[],
  key: LearnerSortKey,
  dir: "asc" | "desc",
): Decorated[] {
  const out = [...rows];
  out.sort((a, b) => {
    let av: number | string;
    let bv: number | string;
    switch (key) {
      case "name":
        av = a.name ?? "";
        bv = b.name ?? "";
        break;
      case "progressPct":
        av = a.progressPct;
        bv = b.progressPct;
        break;
      case "watchRatio":
        av = a.watchRatio;
        bv = b.watchRatio;
        break;
      case "qaCount":
        av = a.qaCount;
        bv = b.qaCount;
        break;
      case "responseRate":
        av = a.responseRate ?? -1;
        bv = b.responseRate ?? -1;
        break;
      case "lastActivity":
        // daysIdle 가 작을수록 최근, null 은 가장 오래됨으로 처리.
        av = a.daysIdle === null ? Number.POSITIVE_INFINITY : a.daysIdle;
        bv = b.daysIdle === null ? Number.POSITIVE_INFINITY : b.daysIdle;
        break;
    }
    if (av < bv) return dir === "asc" ? -1 : 1;
    if (av > bv) return dir === "asc" ? 1 : -1;
    return 0;
  });
  return out;
}

function progressTone(risk: RiskLevel): "neutral" | "high" | "medium" | "low" | "completed" {
  if (risk === "high") return "high";
  if (risk === "medium") return "medium";
  if (risk === "low") return "low";
  if (risk === "completed") return "completed";
  return "neutral";
}

/**
 * Notion 스타일 학습자 테이블.
 *
 * - 정렬 헤더(`button` + aria-sort) — 키보드 접근성 보장
 * - 행 단위 체크박스 + 헤더 전체 선택 체크박스
 * - 모바일에서는 가로 스크롤 (overflow-x-auto)
 *
 * 의도적으로 어떤 학생 데이터도 외부로 흘리는 UI 를 두지 않는다
 * (행 메뉴에 "공유"/"마케팅" 류 액션 금지).
 */
export default function LearnerTable({
  rows,
  filter,
  sortKey,
  sortDir,
  search,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onSort,
  onOpenDetail,
  now,
}: Props) {
  const { t, locale } = useLearnersI18n();
  const nowTs = now ?? Date.now();

  const visible = useMemo(() => {
    const decorated = rows.map((r) => decorate(r, nowTs));
    return applySort(applySearch(applyFilter(decorated, filter), search), sortKey, sortDir);
  }, [rows, filter, sortKey, sortDir, search, nowTs]);

  const allVisibleSelected =
    visible.length > 0 && visible.every((r) => selectedIds.has(r.userId));

  const dirArrow = (col: LearnerSortKey) => {
    if (sortKey !== col) return null;
    return (
      <span aria-hidden="true" className="text-[10px] text-gray-400">
        {sortDir === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  const headerButton = (col: LearnerSortKey, label: string) => (
    <button
      type="button"
      onClick={() => onSort(col)}
      className="inline-flex items-center gap-1 hover:text-gray-900"
      aria-label={`${label} ${sortKey === col ? sortDir : ""}`.trim()}
    >
      {label}
      {dirArrow(col)}
    </button>
  );

  return (
    <div className="overflow-x-auto -mx-2 px-2" data-testid="learner-table">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="w-10 pb-2 pr-2" scope="col">
              <input
                type="checkbox"
                aria-label={t(allVisibleSelected ? "deselectAll" : "selectAll")}
                checked={allVisibleSelected}
                onChange={(e) => onToggleSelectAll(e.currentTarget.checked)}
                data-testid="learner-table-select-all"
                className="w-4 h-4 rounded border-gray-300"
              />
            </th>
            <th className="pb-2 pr-2 font-medium" scope="col"
                aria-sort={sortKey === "name" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
              {headerButton("name", t("colName"))}
            </th>
            <th className="pb-2 pr-2 font-medium" scope="col">{t("colStudentNumber")}</th>
            <th className="pb-2 pr-2 font-medium" scope="col"
                aria-sort={sortKey === "progressPct" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
              {headerButton("progressPct", t("colProgress"))}
            </th>
            <th className="pb-2 pr-2 font-medium" scope="col"
                aria-sort={sortKey === "watchRatio" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
              {headerButton("watchRatio", t("colWatchRatio"))}
            </th>
            <th className="pb-2 pr-2 font-medium" scope="col"
                aria-sort={sortKey === "qaCount" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
              {headerButton("qaCount", t("colQaCount"))}
            </th>
            <th className="pb-2 pr-2 font-medium" scope="col"
                aria-sort={sortKey === "responseRate" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
              {headerButton("responseRate", t("colResponseRate"))}
            </th>
            <th className="pb-2 pr-2 font-medium" scope="col">{t("colRisk")}</th>
            <th className="pb-2 pr-2 font-medium" scope="col"
                aria-sort={sortKey === "lastActivity" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
              {headerButton("lastActivity", t("colLastActivity"))}
            </th>
            <th className="pb-2 font-medium text-right" scope="col" aria-label={t("actionViewDetail")} />
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr data-testid="learner-table-empty">
              <td colSpan={10} className="py-10 text-center text-gray-400 text-sm">
                {t("emptyRoster")}
              </td>
            </tr>
          ) : (
            visible.map((r) => {
              const checked = selectedIds.has(r.userId);
              return (
                <tr
                  key={r.userId}
                  data-testid={`learner-row-${r.userId}`}
                  data-risk={r.risk}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="py-2.5 pr-2">
                    <input
                      type="checkbox"
                      data-testid={`learner-row-select-${r.userId}`}
                      aria-label={t("selectRow", { name: r.name })}
                      checked={checked}
                      onChange={() => onToggleSelect(r.userId)}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                  </td>
                  <td className="py-2.5 pr-2 text-gray-900 font-medium truncate max-w-[180px]">
                    {r.name}
                  </td>
                  <td className="py-2.5 pr-2 text-gray-500 tabular-nums">
                    {r.studentNumber ?? "—"}
                  </td>
                  <td className="py-2.5 pr-2 min-w-[140px]">
                    <ProgressBar
                      value={r.progressPct}
                      tone={progressTone(r.risk)}
                      ariaLabel={`${t("colProgress")}: ${r.progressPct.toFixed(0)}%`}
                    />
                  </td>
                  <td className="py-2.5 pr-2 min-w-[120px]">
                    <ProgressBar
                      value={r.watchRatio}
                      tone={r.watchRatio < 50 ? "medium" : "neutral"}
                      ariaLabel={`${t("colWatchRatio")}: ${r.watchRatio.toFixed(0)}%`}
                    />
                  </td>
                  <td className="py-2.5 pr-2 text-gray-700 tabular-nums">{r.qaCount}</td>
                  <td className="py-2.5 pr-2 text-gray-500 tabular-nums">
                    {r.responseRate === null ? "—" : `${r.responseRate.toFixed(0)}%`}
                  </td>
                  <td className="py-2.5 pr-2">
                    <RiskBadge level={r.risk} />
                  </td>
                  <td className="py-2.5 pr-2 text-gray-500 text-xs whitespace-nowrap">
                    {r.daysIdle === null
                      ? t("never")
                      : r.daysIdle === 0
                        ? t("today")
                        : t("daysAgo", { count: r.daysIdle })}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onOpenDetail(r.userId)}
                      data-testid={`learner-row-detail-${r.userId}`}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                      lang={locale}
                    >
                      {t("actionViewDetail")} →
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
