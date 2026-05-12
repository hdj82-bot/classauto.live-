"use client";

import type { ReactNode } from "react";

/**
 * 4-up "promise" / "principle" 카드 v2 — 라이트 베이지 + 골드.
 *
 * /trust 페이지의 4가지 약속 (RAG / 한도 투명성 / 부정행위 방지 / 학생 데이터)
 * 노출용. 호출자는 title + description + 아이콘 path(string) 만 전달.
 *
 * accent → 아이콘 그라데이션 색상. 카드 자체는 흰 베이스 + 골드 호버 글로우.
 */
export default function PrincipleCard({
  title,
  description,
  icon,
  accent = "violet",
}: {
  title: string;
  description: string;
  icon: ReactNode | string;
  accent?: "violet" | "gold" | "cyan" | "pink";
}) {
  // 라이트 베이스에서도 채도 충분히 확보 (다크 톤 0.30 → 라이트 톤 fill 그라데이션).
  const gradientByAccent: Record<typeof accent, string> = {
    violet: "linear-gradient(135deg, #A78BFA 0%, #6366F1 100%)",
    gold: "linear-gradient(135deg, #FFB627 0%, #F59E0B 100%)",
    cyan: "linear-gradient(135deg, #22D3EE 0%, #0EA5E9 100%)",
    pink: "linear-gradient(135deg, #F472B6 0%, #EC4899 100%)",
  };

  return (
    <article className="group rounded-2xl border border-[rgba(10,10,10,0.08)] bg-white p-6 transition motion-reduce:transition-none hover:border-[rgba(184,131,8,0.30)] hover:shadow-[0_8px_28px_rgba(255,182,39,0.10)] hover:-translate-y-0.5">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 text-white transition-transform duration-300 motion-reduce:transition-none group-hover:scale-110 group-hover:rotate-[-6deg]"
        style={{ background: gradientByAccent[accent] }}
        aria-hidden="true"
      >
        {typeof icon === "string" ? (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.6}
              d={icon}
            />
          </svg>
        ) : (
          icon
        )}
      </div>
      <h3 className="text-base font-semibold text-[#0A0A0A] mb-2 tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-[rgba(10,10,10,0.62)] leading-relaxed">
        {description}
      </p>
    </article>
  );
}
