"use client";

/**
 * 제목 + 리스트 카드 — /trust / /security 에서 사용. v2 라이트 베이지 톤.
 *
 * `tone`:
 *  - "default": 흰 카드 (대부분의 섹션)
 *  - "highlight": 골드 글로우 카드 (학생 권리 등 강조 섹션)
 *
 * `items` 가 string 이면 ✓ 불릿, {label,value} 면 인프라 테이블 row.
 */
export type InfoBlockItem = string | { label: string; value: string };

export default function InfoBlock({
  title,
  items,
  tone = "default",
}: {
  title: string;
  items: InfoBlockItem[];
  tone?: "default" | "highlight";
}) {
  return (
    <section
      className={
        tone === "highlight"
          ? "rounded-2xl border border-[rgba(184,131,8,0.30)] bg-[rgba(255,182,39,0.06)] p-6 sm:p-8 shadow-[0_4px_16px_rgba(255,182,39,0.10)]"
          : "rounded-2xl border border-[rgba(10,10,10,0.08)] bg-white p-6 sm:p-8 shadow-[0_1px_2px_rgba(10,10,10,0.04)]"
      }
    >
      <h2 className="text-lg font-semibold text-[#0A0A0A] mb-4 tracking-tight">
        {title}
      </h2>
      <ul className="space-y-2.5">
        {items.map((item, idx) => {
          if (typeof item === "string") {
            return (
              <li
                key={`${title}-${idx}`}
                className="flex items-start gap-2.5 text-sm text-[rgba(10,10,10,0.72)] leading-relaxed"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 text-[#B88308] font-bold shrink-0"
                >
                  ✓
                </span>
                <span>{item}</span>
              </li>
            );
          }
          return (
            <li
              key={`${title}-${idx}`}
              className="flex items-baseline justify-between gap-3 text-sm border-b border-[rgba(10,10,10,0.06)] pb-2 last:border-0 last:pb-0"
            >
              <span className="text-[#0A0A0A] font-medium">{item.label}</span>
              <span className="text-[rgba(10,10,10,0.55)] text-right">
                {item.value}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
