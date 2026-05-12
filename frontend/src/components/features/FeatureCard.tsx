"use client";

import type { ReactNode } from "react";

/**
 * 9-up "capability" 카드 — v2 라이트 톤.
 *
 * 한 카드 = README 의 한 줄. PrincipleCard 와 비슷한 톤이지만, 본 페이지는
 * 4종 그라데이션을 한 페이지에서 모두 보여주려고 카드별 accent 를 명시적으로
 * 받는다.
 *
 * accent → icon container gradient (icons.md §3 의 4종 + success).
 * 카드 자체는 흰색 베이스, hover 시 골드 글로우.
 */
export type FeatureAccent =
  | "electric"
  | "violet"
  | "cyan"
  | "pink"
  | "success";

// 아이콘 컨테이너용 그라데이션 — 라이트 베이스에서도 명도 차이 확보를 위해
// 색 강도를 조금 더 올림 (다크 톤 0.30 → 라이트 톤 0.85 채도).
const ACCENT_BG: Record<FeatureAccent, string> = {
  electric: "linear-gradient(135deg, #FFB627 0%, #F59E0B 100%)",
  violet: "linear-gradient(135deg, #A78BFA 0%, #6366F1 100%)",
  cyan: "linear-gradient(135deg, #22D3EE 0%, #0EA5E9 100%)",
  pink: "linear-gradient(135deg, #F472B6 0%, #EC4899 100%)",
  success: "linear-gradient(135deg, #34D399 0%, #059669 100%)",
};

export default function FeatureCard({
  title,
  description,
  icon,
  accent = "electric",
  testId,
}: {
  title: string;
  description: string;
  icon: ReactNode | string;
  accent?: FeatureAccent;
  testId?: string;
}) {
  return (
    <article
      data-testid={testId}
      className="group rounded-2xl border border-[rgba(10,10,10,0.08)] bg-white p-6 transition motion-reduce:transition-none hover:border-[rgba(184,131,8,0.30)] hover:shadow-[0_8px_28px_rgba(255,182,39,0.10)] hover:-translate-y-0.5"
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 text-white transition-transform duration-300 motion-reduce:transition-none group-hover:scale-110 group-hover:rotate-[-6deg]"
        style={{ background: ACCENT_BG[accent] }}
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
