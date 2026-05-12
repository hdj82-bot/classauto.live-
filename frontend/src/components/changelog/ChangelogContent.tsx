"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import LightMarketingShell from "@/components/marketing/LightMarketingShell";
import { useChangelogHubI18n } from "./useChangelogHubI18n";
import CategoryFilter from "./CategoryFilter";
import EntryCard from "./EntryCard";
import { CHANGELOG_SEED } from "./changelogEntries";
import type { ChangelogCategory, ChangelogEntry } from "./types";

/**
 * `/changelog` v2 — 라이트 베이지 + 골드 톤.
 *
 * 시드된 정적 배열 + 카테고리 필터. 백엔드 endpoint 도착 시 `entries` prop 으로
 * 외부 데이터 받을 수 있는 구조는 유지.
 */
interface ChangelogContentProps {
  entries?: ChangelogEntry[];
}

export default function ChangelogContent({
  entries = CHANGELOG_SEED,
}: ChangelogContentProps) {
  const { t } = useChangelogHubI18n();
  const [active, setActive] = useState<ChangelogCategory | null>(null);

  const counts = useMemo(() => {
    const c: Record<ChangelogCategory | "all", number> = {
      all: entries.length,
      feature: 0,
      improvement: 0,
      fix: 0,
      breaking: 0,
    };
    for (const e of entries) {
      c[e.category] += 1;
    }
    return c;
  }, [entries]);

  const filtered = useMemo(() => {
    if (active === null) return entries;
    return entries.filter((e) => e.category === active);
  }, [entries, active]);

  return (
    <LightMarketingShell topCta={{ href: "/beta-apply", label: t("cta.primary") }}>
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-8 text-center">
        <p className="text-[11px] sm:text-xs font-semibold tracking-[0.22em] text-[#B88308] uppercase mb-5">
          {t("hero.eyebrow")}
        </p>
        <h1
          className="text-[#0A0A0A] tracking-tight leading-[1.08]"
          style={{
            fontFamily:
              "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
            fontSize: "clamp(32px, 5vw, 56px)",
            fontWeight: 800,
            letterSpacing: "-0.035em",
          }}
        >
          {t("hero.title")}
        </h1>
        <p className="mt-5 text-base sm:text-lg text-[rgba(10,10,10,0.62)] max-w-2xl mx-auto leading-relaxed">
          {t("hero.subtitle")}
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <span
            aria-disabled="true"
            className="inline-flex cursor-not-allowed select-none items-center gap-1.5 rounded-full border border-[rgba(10,10,10,0.10)] bg-white px-3 py-1.5 text-xs text-[rgba(10,10,10,0.45)]"
            title={t("hero.rssDisabled")}
          >
            <svg
              aria-hidden="true"
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 11a9 9 0 019 9M4 4a16 16 0 0116 16M5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
              />
            </svg>
            {t("hero.rss")}
          </span>
        </div>
      </section>

      {/* 필터 + 본문 */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-16">
        <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CategoryFilter
            active={active}
            onChange={setActive}
            counts={counts}
          />
          <p className="text-xs tabular-nums text-[rgba(10,10,10,0.45)]">
            {t("filters.selectedSummary", { count: filtered.length })}
          </p>
        </header>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[rgba(10,10,10,0.16)] bg-white px-6 py-12 text-center">
            <p className="text-sm font-medium text-[#0A0A0A]">
              {t("labels.noMatch")}
            </p>
            <p className="mt-1 text-xs text-[rgba(10,10,10,0.45)]">
              {t("labels.noMatchHint")}
            </p>
          </div>
        ) : (
          <ol
            className="relative space-y-8 border-l border-[rgba(10,10,10,0.08)] pl-2"
            data-testid="changelog-timeline"
          >
            {filtered.map((entry, i) => (
              <li
                key={`${entry.date}-${entry.version}-${i}`}
                data-testid={`changelog-entry-${i}`}
              >
                <EntryCard entry={entry} />
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
        <div
          className="rounded-3xl px-6 sm:px-10 py-10 sm:py-14 text-center"
          style={{
            background:
              "linear-gradient(135deg, #FFF5DA 0%, #FFE9A8 50%, #FFD46B 100%)",
            boxShadow: "0 16px 48px rgba(255,182,39,0.18)",
          }}
        >
          <h2
            className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1A1A1A]"
            style={{
              fontFamily:
                "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
              letterSpacing: "-0.025em",
            }}
          >
            {t("cta.title")}
          </h2>
          <p className="mt-3 text-[rgba(26,26,26,0.72)] max-w-xl mx-auto">
            {t("cta.description")}
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/beta-apply"
              className="inline-flex justify-center rounded-xl bg-[#1A1A1A] text-white font-semibold px-6 py-3 text-sm hover:bg-black transition motion-reduce:transition-none shadow-lg shadow-black/15"
            >
              {t("cta.primary")}
            </Link>
            <Link
              href="/contact"
              className="inline-flex justify-center rounded-xl border border-[rgba(26,26,26,0.20)] px-6 py-3 text-sm font-semibold text-[#1A1A1A] hover:bg-white/40 transition motion-reduce:transition-none"
            >
              {t("cta.secondary")}
            </Link>
          </div>
        </div>
      </section>
    </LightMarketingShell>
  );
}
