"use client";

import type { ReactNode } from "react";

/**
 * 9-up "capability" 카드. 한 카드 = README 의 한 줄. PrincipleCard 와 비슷한
 * 톤이지만, 본 페이지는 4종 그라데이션을 한 페이지에서 모두 보여주려고 카드별
 * accent 를 명시적으로 받는다.
 *
 * accent → icon container gradient (icons.md §3 의 4종 + success).
 */
export type FeatureAccent =
  | "electric"
  | "violet"
  | "cyan"
  | "pink"
  | "success";

const ACCENT_BG: Record<FeatureAccent, string> = {
  electric: "from-amber-400/30 to-amber-600/30",
  violet: "from-violet-400/30 to-indigo-500/30",
  cyan: "from-cyan-400/30 to-sky-500/30",
  pink: "from-pink-400/30 to-rose-500/30",
  success: "from-emerald-400/30 to-emerald-600/30",
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
      className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition motion-reduce:transition-none hover:bg-white/[0.04] hover:border-white/15"
    >
      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 bg-gradient-to-br ${ACCENT_BG[accent]} text-white`}
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
      <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-white/60 leading-relaxed">{description}</p>
    </article>
  );
}
