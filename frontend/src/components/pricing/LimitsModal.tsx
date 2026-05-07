"use client";

import { useEffect, useRef } from "react";
import { PLAN_ORDER, type PlanId } from "./plans";
import { usePricingHubI18n } from "./usePricingHubI18n";

const ROW_KEYS = [
  "perEpisodeQa",
  "dailyQa",
  "monthlyQa",
  "inputChars",
  "concurrent24h",
  "concurrentPlay",
] as const;

interface PlanValuesPatch {
  [planId: string]: Partial<Record<(typeof ROW_KEYS)[number], string>>;
}

interface Props {
  open: boolean;
  /** 모달이 강조할 플랜. 같은 모달에서 다른 컬럼도 비교용으로 함께 보여준다. */
  plan: PlanId | null;
  onClose: () => void;
}

/**
 * "세부 한도 보기" 모달.
 *
 * 각 플랜 카드의 ⓘ 버튼 (PlanCard) 에서 진입. 단일 플랜만 보여주는 대신
 * 비교가 의미 있도록 6행 매트릭스 전체를 노출하되, 호출 플랜 컬럼만 골드로
 * 강조한다 — 02-guardrails.md §8.1 "각 플랜 카드에 '세부 한도 보기 ⓘ' 모달".
 *
 * - `localStorage` 사용 0건 — open/plan 상태는 호스트 페이지의 React state.
 * - ESC 닫기, 배경 클릭 닫기, 첫 진입 시 닫기 버튼에 포커스, 닫힐 때 트리거에
 *   포커스 반환은 호스트 컴포넌트의 책임 (간소화 — 헤드리스 dialog 라이브러리
 *   미도입).
 */
export default function LimitsModal({ open, plan, onClose }: Props) {
  const { t, tValue } = usePricingHubI18n();
  const closeBtn = useRef<HTMLButtonElement | null>(null);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 마운트 직후 닫기 버튼에 포커스
  useEffect(() => {
    if (open) closeBtn.current?.focus();
  }, [open]);

  if (!open || !plan) return null;

  const values = tValue<PlanValuesPatch>("limitsTable.values") ?? {};
  const planName = t(`plans.${plan}.name`);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pricing-limits-modal-title"
      data-testid="pricing-limits-modal"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
    >
      {/* 배경 — 클릭 시 닫기 */}
      <button
        type="button"
        aria-label={t("limitsModal.close")}
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        data-testid="pricing-limits-modal-backdrop"
      />

      <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-[#141414] p-6 sm:p-8 shadow-xl">
        <header className="flex items-start justify-between gap-4 mb-5">
          <h2
            id="pricing-limits-modal-title"
            className="text-lg font-semibold text-white"
          >
            {t("limitsModal.title", { plan: planName })}
          </h2>
          <button
            ref={closeBtn}
            type="button"
            onClick={onClose}
            aria-label={t("limitsModal.close")}
            data-testid="pricing-limits-modal-close"
            className="text-white/50 hover:text-white transition w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </header>

        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/45 text-xs uppercase tracking-wider">
                <th scope="col" className="pb-3 pr-3 font-medium">
                  {t("limitsTable.headerCategory")}
                </th>
                {PLAN_ORDER.map((p) => (
                  <th
                    key={p}
                    scope="col"
                    className={[
                      "pb-3 px-3 font-medium text-center",
                      p === plan ? "text-amber-300" : "text-white/60",
                    ].join(" ")}
                  >
                    {t(`plans.${p}.name`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROW_KEYS.map((row) => (
                <tr key={row} className="border-t border-white/5">
                  <th
                    scope="row"
                    className="py-3 pr-3 text-left font-normal text-white/70"
                  >
                    {t(`limitsTable.rowLabels.${row}`)}
                  </th>
                  {PLAN_ORDER.map((p) => (
                    <td
                      key={p}
                      className={[
                        "py-3 px-3 text-center tabular-nums",
                        p === plan
                          ? "text-amber-300 bg-amber-400/10"
                          : "text-white/70",
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

        <p className="text-xs text-white/40 mt-5 leading-relaxed">
          {t("limitsModal.footer")}
        </p>
      </div>
    </div>
  );
}
