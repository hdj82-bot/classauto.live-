"use client";

import type { ReactNode } from "react";

/**
 * 4-up "promise" / "principle" card used on /trust to surface the four
 * differentiators from CLAUDE.md. Self-contained — caller passes title +
 * description + an icon path (single SVG path string) so we don't ship a
 * library of icons just for this page.
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
  const gradientByAccent: Record<typeof accent, string> = {
    violet: "from-violet-400/30 to-indigo-500/30",
    gold: "from-amber-400/30 to-amber-600/30",
    cyan: "from-cyan-400/30 to-sky-500/30",
    pink: "from-pink-400/30 to-rose-500/30",
  };

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition hover:bg-white/[0.04]">
      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 bg-gradient-to-br ${gradientByAccent[accent]} text-white`}
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
