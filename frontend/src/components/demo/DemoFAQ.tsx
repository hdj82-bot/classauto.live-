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
  // 사용자 결정 2026-05-13 PM: q1 ("회원가입 없이 정말 다 써볼 수 있나요?") 항목
  // 삭제. 실제 데모 진입 경로가 회원가입을 요구하는 상황과 어긋나는 카피였다.
  // i18n 키(faq.q1/a1)는 보존 — 다른 곳에서 import 가능성 + 정책 재변경 시 복원
  // 비용 최소화. 화면에 렌더되는 항목만 q2~q4 로 축소.
  const items = [
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
