"use client";

import Link from "next/link";
import { PLAN_ORDER } from "./plans";
import { usePricingHubI18n } from "./usePricingHubI18n";

const ROW_KEYS = [
  "perEpisodeQa",
  "dailyQa",
  "monthlyQa",
  "inputChars",
  "concurrent24h",
  "concurrentPlay",
] as const;
type RowKey = (typeof ROW_KEYS)[number];

interface PlanValuesPatch {
  [planId: string]: Partial<Record<RowKey, string>>;
}

/**
 * 학생 측 사용 한도 비교표.
 *
 * 도크 (`docs/planning/02-guardrails.md` §5.1) 의 6행 매트릭스를 그대로 옮긴다.
 * 표시 문자열은 i18n patch (`limitsTable.values.<plan>.<row>`) 에서, 숫자
 * 정합성은 `plans.ts` 와 매트릭스 lint 테스트 (`__tests__/pricing/plans-matrix.test.ts`)
 * 가 보증한다.
 *
 * - Basic 컬럼은 colors.md §3 의 `--gold-glow-soft` (rgba(255,182,39,0.03)) 톤으로
 *   살짝 배경 강조 — 카드 골드 강조와 시각 일관성.
 */
export default function LimitsTable() {
  const { t, tValue } = usePricingHubI18n();
  const values = tValue<PlanValuesPatch>("limitsTable.values") ?? {};

  return (
    <section
      data-testid="pricing-limits-table"
      aria-labelledby="pricing-limits-heading"
      className="rounded-2xl border border-[rgba(10,10,10,0.08)] bg-white p-5 sm:p-7 shadow-[0_1px_2px_rgba(10,10,10,0.04)]"
    >
      <header className="mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2
            id="pricing-limits-heading"
            className="text-xl font-semibold tracking-tight text-[#0A0A0A]"
          >
            {t("limitsTable.title")}
          </h2>
          <p className="text-sm text-[rgba(10,10,10,0.55)] mt-1">
            {t("limitsTable.subtitle")}
          </p>
        </div>
        <Link
          href={t("limitsTable.linkHref")}
          className="text-xs font-medium text-[#B88308] hover:text-[#E89E0B] self-start sm:self-auto transition motion-reduce:transition-none"
        >
          {t("limitsTable.linkLabel")} →
        </Link>
      </header>

      {/* 모바일 전용 스크롤 안내 — 표가 min-w-[520px] 라 좁은 폰에서 가로
          스크롤이 필요하다는 걸 명시 (2026-05-15 반응형 보강). */}
      <p
        className="sm:hidden text-xs text-[rgba(10,10,10,0.45)] mb-2 text-center"
        aria-hidden="true"
      >
        {t("limitsTable.scrollHint")}
      </p>

      <div className="overflow-x-auto overscroll-x-contain -mx-2 px-2">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-[rgba(10,10,10,0.45)] text-xs uppercase tracking-wider">
              <th scope="col" className="pb-3 pr-3 font-medium">
                {t("limitsTable.headerCategory")}
              </th>
              {PLAN_ORDER.map((p) => (
                <th
                  key={p}
                  scope="col"
                  data-testid={`limits-col-${p}`}
                  className={[
                    "pb-3 px-3 font-medium text-center",
                    p === "basic" ? "text-[#B88308]" : "text-[rgba(10,10,10,0.72)]",
                  ].join(" ")}
                >
                  {t(`plans.${p}.name`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROW_KEYS.map((row) => (
              <tr
                key={row}
                data-testid={`limits-row-${row}`}
                className="border-t border-[rgba(10,10,10,0.06)]"
              >
                <th
                  scope="row"
                  className="py-3 pr-3 text-left font-normal text-[rgba(10,10,10,0.72)]"
                >
                  {t(`limitsTable.rowLabels.${row}`)}
                </th>
                {PLAN_ORDER.map((p) => (
                  <td
                    key={p}
                    data-testid={`limits-cell-${p}-${row}`}
                    className={[
                      "py-3 px-3 text-center tabular-nums",
                      p === "basic"
                        ? "text-[#0A0A0A] bg-[rgba(255,182,39,0.06)]"
                        : "text-[rgba(10,10,10,0.78)]",
                    ].join(" ")}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {values[p]?.[row] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-[rgba(10,10,10,0.40)] mt-4">
        {t("limitsTable.footnote")}
      </p>
    </section>
  );
}
