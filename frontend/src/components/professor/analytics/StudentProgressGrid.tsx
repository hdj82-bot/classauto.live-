"use client";

import { useMemo, useState } from "react";
import type { AttendanceData, AttendanceStudent } from "./types";
import { useAnalyticsI18n } from "./useAnalyticsI18n";
import EmptyState from "./EmptyState";

/**
 * E (docs/planning/11 §E) — 학생 개별 진척도 그리드 + 위험 배지.
 *
 * 기존 `/api/v1/dashboard/{id}/attendance` 응답(AttendanceData.students)만 재활용한다
 * (백엔드 신규 테이블 없음). 정렬(취약 우선/이름순) + 필터(전체/미완주/미시작/주의) +
 * 진행률 바 + 상태·실시간/사후·주의 배지. 정답률·무반응 per-student 는 attendance 에
 * 없어 진행률 기반 신호만 표시한다(C/D 트랙에서 확장).
 */
type Filter = "all" | "incomplete" | "not_started" | "at_risk";

const RISK_THRESHOLD = 50; // 진행률 50% 미만(완료 아님) = 주의

function isNotStarted(s: AttendanceStudent): boolean {
  return s.status === "not_started" || (s.progress_pct ?? 0) <= 0;
}

function isCompleted(s: AttendanceStudent): boolean {
  return s.status === "completed" || (s.progress_pct ?? 0) >= 100;
}

function isAtRisk(s: AttendanceStudent): boolean {
  return !isCompleted(s) && (s.progress_pct ?? 0) < RISK_THRESHOLD;
}

export default function StudentProgressGrid({ data }: { data: AttendanceData }) {
  const { t } = useAnalyticsI18n();
  const [filter, setFilter] = useState<Filter>("all");
  const [sortWeakest, setSortWeakest] = useState(true);

  const students = data.students ?? [];

  const counts = useMemo(
    () => ({
      all: students.length,
      incomplete: students.filter((s) => !isCompleted(s)).length,
      not_started: students.filter(isNotStarted).length,
      at_risk: students.filter(isAtRisk).length,
    }),
    [students],
  );

  const visible = useMemo(() => {
    let list = students.slice();
    if (filter === "incomplete") list = list.filter((s) => !isCompleted(s));
    else if (filter === "not_started") list = list.filter(isNotStarted);
    else if (filter === "at_risk") list = list.filter(isAtRisk);

    list.sort((a, b) =>
      sortWeakest
        ? (a.progress_pct ?? 0) - (b.progress_pct ?? 0)
        : (a.name ?? "").localeCompare(b.name ?? ""),
    );
    return list;
  }, [students, filter, sortWeakest]);

  if (students.length === 0) {
    return <EmptyState title={t("studentGrid.empty")} description={t("studentGrid.emptyDesc")} />;
  }

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: t("studentGrid.filterAll", { count: counts.all }) },
    { key: "incomplete", label: t("studentGrid.filterIncomplete", { count: counts.incomplete }) },
    { key: "not_started", label: t("studentGrid.filterNotStarted", { count: counts.not_started }) },
    { key: "at_risk", label: t("studentGrid.filterAtRisk", { count: counts.at_risk }) },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex gap-1.5 flex-wrap">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                filter === f.key
                  ? "border-[#B88308] bg-[#B88308]/10 text-[#B88308] font-semibold"
                  : "border-black/12 text-black/55 hover:bg-black/[0.03]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSortWeakest((v) => !v)}
          className="text-xs px-2.5 py-1 rounded-md border border-black/12 text-black/60 hover:bg-black/[0.03]"
        >
          {sortWeakest ? t("studentGrid.sortWeakest") : t("studentGrid.sortName")}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visible.map((s) => {
          const pct = Math.max(0, Math.min(100, Math.round(s.progress_pct ?? 0)));
          const risk = isAtRisk(s);
          const notStarted = isNotStarted(s);
          const completed = isCompleted(s);
          return (
            <div
              key={s.user_id}
              className={`rounded-xl border p-3 ${
                risk ? "border-amber-300 bg-amber-50/40" : "border-black/10 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">
                    {s.name || t("studentGrid.noName")}
                  </div>
                  <div className="text-xs text-gray-400">
                    {s.student_number || t("studentGrid.noNumber")}
                  </div>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                    s.type === "live" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {s.type === "live" ? t("studentGrid.badgeLive") : t("studentGrid.badgeVod")}
                </span>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-400">{t("studentGrid.progress")}</span>
                  <span className="tabular-nums font-mono text-gray-600">{pct}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      completed ? "bg-green-500" : risk ? "bg-amber-500" : "bg-indigo-500"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    completed
                      ? "bg-green-100 text-green-700"
                      : notStarted
                        ? "bg-gray-100 text-gray-500"
                        : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {completed
                    ? t("studentGrid.statusCompleted")
                    : notStarted
                      ? t("studentGrid.statusNotStarted")
                      : t("studentGrid.statusInProgress")}
                </span>
                {risk && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium"
                    title={t("studentGrid.riskHint")}
                  >
                    {t("studentGrid.riskAtRisk")}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
