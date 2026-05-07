"use client";

import type { Block, SectionData } from "./types";

/**
 * 한 법무 조항을 렌더하는 표시 전용 컴포넌트.
 *
 * 입력은 `useLegalI18n().tValue<SectionData>(...)` 로 dictionary 에서 꺼낸
 * 구조화 객체 + anchor id. 모든 자식 노드가 i18n 텍스트라 페이지 본체는
 * 콘텐츠를 한 줄도 들고 있지 않게 됨 → 한·영 동수 작성이 자연스럽게 검증됨.
 *
 * 디자인:
 *   - h2 는 `Paperlogy 7 Bold` (typography.md §1) — Tailwind `font-extrabold tracking-tight` 로 근사.
 *   - 본문은 Pretendard 16px / leading-relaxed (다크 베이스에서 가독성 우선).
 *   - 표는 골드 outline 으로 강조 (의미적 컬러 없음 — 마케팅 페이지와 동일 톤).
 */
export default function LegalSection({
  id,
  data,
}: {
  id: string;
  data: SectionData;
}) {
  return (
    <section
      id={id}
      data-testid={`legal-section-${id}`}
      data-section-id={id}
      className="scroll-mt-24"
      aria-labelledby={`${id}-heading`}
    >
      <header className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400/80 mb-2">
          {data.number}
        </p>
        <h2
          id={`${id}-heading`}
          className="text-xl sm:text-2xl font-extrabold tracking-tight text-white"
        >
          {data.title}
        </h2>
      </header>

      <div className="space-y-4 text-sm sm:text-[15px] text-white/75 leading-relaxed">
        {data.blocks.map((block, idx) => (
          <BlockRenderer key={idx} block={block} />
        ))}
      </div>
    </section>
  );
}

function BlockRenderer({ block }: { block: Block }) {
  switch (block.kind) {
    case "p":
      return <p>{block.text}</p>;
    case "ul":
      return (
        <ul className="list-disc pl-5 space-y-1.5 marker:text-amber-400/60">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="list-decimal pl-5 space-y-1.5 marker:text-amber-400/70 marker:font-semibold">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-xs sm:text-sm border-collapse">
            <thead className="bg-white/[0.03] text-white/85">
              <tr>
                {block.head.map((cell, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="px-3 sm:px-4 py-2 text-left font-semibold border-b border-white/10"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr
                  key={ri}
                  className="border-b border-white/5 last:border-b-0 align-top"
                >
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-3 sm:px-4 py-2 text-white/70 leading-relaxed"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}
