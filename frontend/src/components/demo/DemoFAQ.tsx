"use client";

import { useState } from "react";
import { useDemoI18n } from "./useDemoI18n";

/**
 * 데모 한정 FAQ — 4문항 (기획서 Section 18).
 *
 * 2026-05-13 PM: 라이트 톤 변환 (페이지 라이트 베이지 위 흰 카드).
 */
export default function DemoFAQ() {
  const { t } = useDemoI18n();
  const items = [
    { q: t("faq.q1"), a: t("faq.a1") },
    { q: t("faq.q2"), a: t("faq.a2") },
    { q: t("faq.q3"), a: t("faq.a3") },
    { q: t("faq.q4"), a: t("faq.a4") },
  ];
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section
      className="py-16 px-4 sm:px-6"
      aria-labelledby="demo-faq-heading"
    >
      <div className="max-w-3xl mx-auto">
        <h2
          id="demo-faq-heading"
          className="text-2xl sm:text-3xl font-bold text-[#0A0A0A] mb-8 text-center"
          style={{
            fontFamily:
              "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
            letterSpacing: "-0.03em",
          }}
        >
          {t("faq.title")}
        </h2>
        <ul className="space-y-2">
          {items.map((it, i) => {
            const isOpen = openIdx === i;
            return (
              <li
                key={i}
                className="rounded-xl border border-[rgba(10,10,10,0.08)] bg-white overflow-hidden shadow-[0_1px_2px_rgba(10,10,10,0.04)]"
              >
                <button
                  type="button"
                  className="w-full flex items-center justify-between text-left px-4 py-3 text-sm font-medium text-[#0A0A0A] hover:bg-[rgba(10,10,10,0.02)] transition motion-reduce:transition-none"
                  aria-expanded={isOpen}
                  aria-controls={`demo-faq-panel-${i}`}
                  onClick={() => setOpenIdx(isOpen ? null : i)}
                >
                  <span>{it.q}</span>
                  <span
                    aria-hidden="true"
                    className={`text-[rgba(10,10,10,0.55)] transition-transform motion-reduce:transition-none ${isOpen ? "rotate-45" : ""}`}
                  >
                    +
                  </span>
                </button>
                {isOpen && (
                  <div
                    id={`demo-faq-panel-${i}`}
                    className="px-4 pb-4 text-sm text-[rgba(10,10,10,0.65)] leading-relaxed animate-fade-in"
                  >
                    {it.a}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
