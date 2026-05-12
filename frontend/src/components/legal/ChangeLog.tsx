"use client";

import type { ChangeLogEntry } from "./types";
import { useLegalI18n } from "./useLegalI18n";

/**
 * 변경 이력 표 — 두 문서 모두 페이지 마지막 섹션으로 노출.
 *
 * `/terms` · `/privacy` 가 본 컴포넌트에 (id, entries) 만 전달하면 된다. 항목이
 * 없으면 안내 문구만 노출 (현 시점에는 첫 시행 단계라 시행 일자 entry 가 1개씩).
 */
export default function ChangeLog({
  id,
  entries,
}: {
  id: string;
  entries: ChangeLogEntry[];
}) {
  const { t } = useLegalI18n();

  return (
    <section
      id={id}
      data-testid={`legal-changelog-${id}`}
      className="scroll-mt-24"
      aria-labelledby={`${id}-heading`}
    >
      <h2
        id={`${id}-heading`}
        className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#0A0A0A] mb-4"
        style={{
          fontFamily:
            "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
          letterSpacing: "-0.025em",
        }}
      >
        {t("common.changeHistoryTitle")}
      </h2>

      {entries.length === 0 ? (
        <p className="text-sm text-[rgba(10,10,10,0.62)]">
          {t("common.changeHistoryEmpty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[rgba(10,10,10,0.08)]">
          <table className="w-full text-xs sm:text-sm border-collapse">
            <thead className="bg-[#FAFAF7] text-[#0A0A0A]">
              <tr>
                <th
                  scope="col"
                  className="px-3 sm:px-4 py-2 text-left font-semibold border-b border-[rgba(10,10,10,0.08)] w-32 tabular-nums"
                >
                  {t("common.lastUpdatedLabel")}
                </th>
                <th
                  scope="col"
                  className="px-3 sm:px-4 py-2 text-left font-semibold border-b border-[rgba(10,10,10,0.08)]"
                >
                  {t("common.changeHistoryTitle")}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr
                  key={entry.date + i}
                  data-testid={`legal-changelog-row-${i}`}
                  className="border-b border-[rgba(10,10,10,0.06)] last:border-b-0 align-top"
                >
                  <td className="px-3 sm:px-4 py-2 tabular-nums text-[#B88308] font-semibold">
                    {entry.date}
                  </td>
                  <td className="px-3 sm:px-4 py-2 text-[rgba(10,10,10,0.72)] leading-relaxed">
                    {entry.summary}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
