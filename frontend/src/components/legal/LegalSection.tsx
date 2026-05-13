"use client";

import type { Block, SectionData } from "./types";

/**
 * 한 법무 조항을 렌더하는 표시 전용 컴포넌트 — v2 라이트 톤.
 *
 * 입력은 `useLegalI18n().tValue<SectionData>(...)` 로 dictionary 에서 꺼낸
 * 구조화 객체 + anchor id. 모든 자식 노드가 i18n 텍스트라 페이지 본체는
 * 콘텐츠를 한 줄도 들고 있지 않게 됨 → 한·영 동수 작성이 자연스럽게 검증됨.
 *
 * 디자인:
 *   - h2 는 Paperlogy fallback chain — `font-extrabold tracking-tight`
 *   - 본문은 Pretendard 16px / leading-relaxed (라이트 베이스 가독성)
 *   - 표는 골드 outline 으로 강조 (의미적 컬러 없음)
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
      {/* 사용자 결정 2026-05-13 PM: 번호 라벨을 별도 작은 골드 카피로 띄우지
          않고 h2 안에 번호 + 제목을 한 줄로 통합 ("1. 총칙"). 시각 위계를
          단순화 — 사이드바 TOC 가 이미 같은 형식이라 일관성도 높아진다. */}
      <header className="mb-4">
        <h2
          id={`${id}-heading`}
          className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#0A0A0A]"
          style={{
            fontFamily:
              "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
            letterSpacing: "-0.025em",
          }}
        >
          {data.number} {data.title}
        </h2>
      </header>

      <div className="space-y-4 text-sm sm:text-[15px] text-[rgba(10,10,10,0.78)] leading-relaxed">
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
        <ul className="list-disc pl-5 space-y-1.5 marker:text-[rgba(184,131,8,0.70)]">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="list-decimal pl-5 space-y-1.5 marker:text-[#B88308] marker:font-semibold">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border border-[rgba(10,10,10,0.08)]">
          <table className="w-full text-xs sm:text-sm border-collapse">
            <thead className="bg-[#FAFAF7] text-[#0A0A0A]">
              <tr>
                {block.head.map((cell, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="px-3 sm:px-4 py-2 text-left font-semibold border-b border-[rgba(10,10,10,0.08)]"
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
                  className="border-b border-[rgba(10,10,10,0.06)] last:border-b-0 align-top"
                >
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-3 sm:px-4 py-2 text-[rgba(10,10,10,0.72)] leading-relaxed"
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
