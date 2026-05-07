"use client";

import { useMemo } from "react";
import type { StreakSummary } from "./types";
import { useProfileHubI18n } from "./useProfileHubI18n";

interface Props {
  data: StreakSummary;
}

/**
 * GitHub-스타일 잔디 히트맵.
 *
 * - days 배열은 오늘에서 거꾸로 거슬러 올라간 일별 데이터.
 * - 7행 (요일) × N열 (주). 빈 셀은 어두운 회색, 학습 시간 비례로 골드 농도 4단계.
 * - 모바일에서는 `overflow-x-auto` 로 가로 스크롤.
 */
export default function StreakHeatmap({ data }: Props) {
  const { t, tValue } = useProfileHubI18n();
  const monthLabels = tValue<string[]>("profileHub.streak.monthLabels") ?? [];
  const weekdayLabels = tValue<string[]>("profileHub.streak.weekdayLabels") ?? [];

  const { weeks, maxMinutes } = useMemo(() => buildWeeks(data.days), [data.days]);

  return (
    <section
      data-testid="profile-streak"
      aria-labelledby="profile-streak-heading"
      className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6"
    >
      <header className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2
            id="profile-streak-heading"
            className="text-base font-semibold text-white"
          >
            {t("profileHub.streak.title")}
          </h2>
          <p className="text-xs text-amber-300 mt-1 tabular-nums">
            {data.currentDays > 0
              ? t("profileHub.streak.subtitle", { days: data.currentDays })
              : t("profileHub.streak.subtitleZero")}
          </p>
        </div>
        <div className="flex flex-col gap-1 text-right text-[11px] text-white/55">
          <span className="tabular-nums">
            {t("profileHub.streak.thisWeek", { count: data.thisWeekDays })}
          </span>
          <span className="tabular-nums">
            {t("profileHub.streak.longest", { count: data.longestDays })}
          </span>
        </div>
      </header>

      <div className="overflow-x-auto -mx-1 px-1">
        <div className="inline-block">
          <div className="flex gap-[3px]">
            {/* 요일 라벨 (왼쪽) */}
            <div className="flex flex-col gap-[3px] mr-1.5 text-[9px] text-white/40 pt-3.5">
              {weekdayLabels.map((label, i) => (
                <span
                  key={i}
                  className={`h-[11px] leading-[11px] ${
                    i % 2 === 0 ? "" : "opacity-0"
                  }`}
                  aria-hidden="true"
                >
                  {label}
                </span>
              ))}
            </div>
            <div>
              {/* 월 라벨 (상단) — 각 주의 첫 셀 날짜 기준 월이 바뀌는 곳 */}
              <div
                className="grid grid-flow-col gap-[3px] mb-1 text-[9px] text-white/40"
                style={{ gridTemplateColumns: `repeat(${weeks.length}, 11px)` }}
                aria-hidden="true"
              >
                {weeks.map((w, i) => {
                  const first = w.find((d) => d) ?? null;
                  const month = first ? new Date(first.date).getMonth() : null;
                  const prevWeek = i > 0 ? weeks[i - 1] : null;
                  const prevFirst = prevWeek?.find((d) => d) ?? null;
                  const prevMonth = prevFirst
                    ? new Date(prevFirst.date).getMonth()
                    : null;
                  const showLabel = month !== null && month !== prevMonth;
                  return (
                    <span key={i} className="leading-[10px]">
                      {showLabel && month !== null ? monthLabels[month] : ""}
                    </span>
                  );
                })}
              </div>

              {/* 셀 그리드 — 7행 × N열 */}
              <div
                className="grid grid-flow-col gap-[3px]"
                style={{ gridTemplateColumns: `repeat(${weeks.length}, 11px)` }}
              >
                {weeks.flatMap((week, wi) =>
                  week.map((day, di) => {
                    const key = `${wi}-${di}`;
                    if (!day) {
                      return (
                        <span
                          key={key}
                          aria-hidden="true"
                          className="block w-[11px] h-[11px] rounded-[2px] bg-transparent"
                        />
                      );
                    }
                    const intensity = computeIntensity(day.watchedMinutes, maxMinutes);
                    return (
                      <span
                        key={key}
                        data-testid={`streak-cell-${day.date}`}
                        data-intensity={intensity}
                        title={
                          day.watchedMinutes > 0
                            ? t("profileHub.streak.cellAria", {
                                date: day.date,
                                count: day.watchedMinutes,
                              })
                            : t("profileHub.streak.cellAriaEmpty", { date: day.date })
                        }
                        className={`block w-[11px] h-[11px] rounded-[2px] ${INTENSITY_BG[intensity]}`}
                      />
                    );
                  }),
                )}
              </div>
            </div>
          </div>

          {/* 범례 */}
          <div className="flex items-center gap-1.5 mt-3 text-[10px] text-white/40">
            <span>{t("profileHub.streak.legendLess")}</span>
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                aria-hidden="true"
                className={`block w-[11px] h-[11px] rounded-[2px] ${INTENSITY_BG[i as 0 | 1 | 2 | 3 | 4]}`}
              />
            ))}
            <span>{t("profileHub.streak.legendMore")}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

const INTENSITY_BG: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "bg-white/[0.04]",
  1: "bg-amber-300/20",
  2: "bg-amber-300/40",
  3: "bg-amber-300/65",
  4: "bg-amber-400",
};

function computeIntensity(minutes: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0 || max <= 0) return 0;
  const ratio = minutes / max;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

/**
 * days 배열을 7행×N열 주 그리드로 재배열.
 *
 * - 입력 배열의 가장 이른 날짜의 요일에 맞춰 0~6 빈 셀로 패딩.
 * - 결과: weeks[N][7] 의 2D, 셀은 StreakDay | null.
 */
function buildWeeks(days: { date: string; watchedMinutes: number }[]): {
  weeks: Array<Array<{ date: string; watchedMinutes: number } | null>>;
  maxMinutes: number;
} {
  if (days.length === 0) return { weeks: [], maxMinutes: 0 };

  // 입력은 시간순으로 정렬되어 있다고 가정. 안전을 위해 한 번 더 정렬.
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = new Date(sorted[0].date);
  const startDay = first.getDay(); // 0=Sun
  const padded: Array<{ date: string; watchedMinutes: number } | null> = [];
  for (let i = 0; i < startDay; i++) padded.push(null);
  for (const d of sorted) padded.push(d);
  // 마지막 주를 7개로 맞춤.
  while (padded.length % 7 !== 0) padded.push(null);

  const weeks: Array<Array<{ date: string; watchedMinutes: number } | null>> = [];
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7));
  }

  const maxMinutes = sorted.reduce((m, d) => Math.max(m, d.watchedMinutes), 0);
  return { weeks, maxMinutes };
}
