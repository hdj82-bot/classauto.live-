"use client";

import { useState } from "react";
import { usePricingHubI18n } from "./usePricingHubI18n";

interface Item {
  q: string;
  a: string;
}

/**
 * 단순 details/summary 기반 아코디언.
 *
 * 가드레일 정책 관련 질문 (Q&A 챗봇 학습 외 질문 / 학생 자리비움) 2개를 반드시
 * 포함한다 — `02-guardrails.md` §8.1 정책. 본 PR 의 i18n patch
 * (`faq.items` 배열) 의 마지막에 두 항목을 명시적으로 배치하고, 매트릭스 lint
 * 테스트가 그 존재 여부를 검증한다.
 *
 * 다중 패널 동시 펼침을 허용 — 비교 학습 시 유리하고, "details" semantics 가
 * 제공하는 키보드 접근성을 유지한다.
 */
export default function FaqAccordion() {
  const { t, tValue } = usePricingHubI18n();
  const items = tValue<Item[]>("faq.items") ?? [];
  const [openIndex, setOpenIndex] = useState<Set<number>>(new Set());

  return (
    <section
      data-testid="pricing-faq"
      aria-labelledby="pricing-faq-heading"
      className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-7"
    >
      <h2
        id="pricing-faq-heading"
        className="text-xl font-semibold tracking-tight text-white mb-5"
      >
        {t("faq.title")}
      </h2>
      <ul className="divide-y divide-white/5">
        {items.map((it, i) => {
          const open = openIndex.has(i);
          return (
            <li key={i} data-testid={`pricing-faq-item-${i}`}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`pricing-faq-panel-${i}`}
                onClick={() =>
                  setOpenIndex((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  })
                }
                className="w-full flex items-start justify-between gap-4 py-4 text-left text-white/90 hover:text-white transition"
                data-testid={`pricing-faq-toggle-${i}`}
              >
                <span className="text-sm font-medium leading-relaxed">{it.q}</span>
                <svg
                  className={`w-4 h-4 mt-1 shrink-0 text-white/40 transition-transform duration-300 motion-reduce:transition-none ${
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
                  id={`pricing-faq-panel-${i}`}
                  data-testid={`pricing-faq-panel-${i}`}
                  className="pb-5 text-sm text-white/65 leading-relaxed"
                >
                  {it.a}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
