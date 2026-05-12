"use client";

import { useState } from "react";
import { useHelpHubI18n } from "./useHelpHubI18n";
import type { HelpFaqItem } from "./types";

/**
 * 도움말 FAQ 아코디언 — pricing 의 `FaqAccordion` 과 같은 details/summary
 * 톤이지만 props 로 items 배열을 받는 범용 변종이다(pricing 쪽은
 * `usePricingHubI18n` 에 강결합되어 있어 그대로 import 하면 다국어 키 충돌).
 *
 * - 다중 패널 동시 펼침 허용 — 비교 학습 시 유리.
 * - `aria-expanded` + `aria-controls` 로 보조기기 호환.
 * - rotate 화살표는 `motion-reduce:transition-none` 으로 환원 모션 보호.
 */
interface FaqAccordionProps {
  items: HelpFaqItem[];
  /** 검색 결과로 한정 노출할 때 — 매칭된 인덱스를 모두 펼침으로 시작. */
  initialOpen?: number[];
  testIdPrefix?: string;
}

export default function FaqAccordion({
  items,
  initialOpen = [],
  testIdPrefix = "help-faq",
}: FaqAccordionProps) {
  const { t } = useHelpHubI18n();
  const [openIndex, setOpenIndex] = useState<Set<number>>(
    () => new Set(initialOpen),
  );

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[rgba(10,10,10,0.16)] bg-white px-6 py-10 text-center">
        <p className="text-sm font-medium text-[#0A0A0A]">
          {t("categoryView.empty")}
        </p>
        <p className="mt-1 text-xs text-[rgba(10,10,10,0.45)]">
          {t("categoryView.emptyDesc")}
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[rgba(10,10,10,0.06)] rounded-2xl border border-[rgba(10,10,10,0.08)] bg-white shadow-[0_1px_2px_rgba(10,10,10,0.04)]">
      {items.map((item, i) => {
        const open = openIndex.has(i);
        return (
          <li key={i} data-testid={`${testIdPrefix}-item-${i}`} className="px-5">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`${testIdPrefix}-panel-${i}`}
              onClick={() =>
                setOpenIndex((prev) => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                })
              }
              className="flex w-full items-start justify-between gap-4 py-4 text-left text-[rgba(10,10,10,0.88)] hover:text-[#0A0A0A] transition motion-reduce:transition-none"
              data-testid={`${testIdPrefix}-toggle-${i}`}
            >
              <span className="text-sm font-medium leading-relaxed">
                {item.q}
              </span>
              <svg
                className={`mt-1 h-4 w-4 shrink-0 text-[rgba(10,10,10,0.40)] transition-transform duration-300 motion-reduce:transition-none ${
                  open ? "rotate-180" : ""
                }`}
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {open && (
              <div
                id={`${testIdPrefix}-panel-${i}`}
                data-testid={`${testIdPrefix}-panel-${i}`}
                className="pb-5 text-sm leading-relaxed text-[rgba(10,10,10,0.65)]"
              >
                {item.a}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
