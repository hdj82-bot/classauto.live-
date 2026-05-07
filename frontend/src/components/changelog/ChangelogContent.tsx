"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import MarketingShell from "@/components/marketing/MarketingShell";
import SectionHeader from "@/components/marketing/SectionHeader";
import { useChangelogHubI18n } from "./useChangelogHubI18n";
import CategoryFilter from "./CategoryFilter";
import EntryCard from "./EntryCard";
import { CHANGELOG_SEED } from "./changelogEntries";
import type { ChangelogCategory, ChangelogEntry } from "./types";

/**
 * `/changelog` 본체. 시간 역순으로 시드된 정적 배열(`CHANGELOG_SEED`)을 받아
 * 카테고리 필터로 좁혀보는 단순 UI.
 *
 * 백엔드 endpoint(`GET /api/v1/public/changelog`) 도착 시 `entries` prop 으로
 * 외부 데이터를 받을 수 있도록 구조화 (현재는 default = SEED).
 *
 * 시간 역순 정렬은 시드 배열 순서를 신뢰 — 새 항목이 추가될 때 author 가
 * 적절한 위치에 삽입한다는 전제. 다중 entry 가 같은 날짜를 가져도 입력 순서
 * 보존.
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
    <MarketingShell topCta={{ href: "/beta-apply", label: t("cta.primary") }}>
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-8">
        <SectionHeader
          eyebrow={t("hero.eyebrow")}
          title={t("hero.title")}
          subtitle={t("hero.subtitle")}
        />
        <div className="mt-6 flex flex-col items-center gap-3">
          {/* RSS 는 후속 PR — 비활성 ghost 버튼으로 자리만 잡음 */}
          <span
            aria-disabled="true"
            className="inline-flex cursor-not-allowed select-none items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-white/45"
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
          <p className="text-xs tabular-nums text-white/40">
            {t("filters.selectedSummary", { count: filtered.length })}
          </p>
        </header>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
            <p className="text-sm font-medium text-white/85">
              {t("labels.noMatch")}
            </p>
            <p className="mt-1 text-xs text-white/45">
              {t("labels.noMatchHint")}
            </p>
          </div>
        ) : (
          <ol
            className="relative space-y-8 border-l border-white/5 pl-2"
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
        <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-400/10 to-transparent p-8 sm:p-10 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {t("cta.title")}
          </h2>
          <p className="mt-3 text-white/70 max-w-xl mx-auto">
            {t("cta.description")}
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/beta-apply"
              className="inline-flex justify-center rounded-xl bg-amber-400 text-black font-semibold px-6 py-3 text-sm hover:bg-amber-300 transition motion-reduce:transition-none"
            >
              {t("cta.primary")}
            </Link>
            <Link
              href="/contact"
              className="inline-flex justify-center rounded-xl border border-white/15 px-6 py-3 text-sm font-medium text-white/90 hover:bg-white/5 transition motion-reduce:transition-none"
            >
              {t("cta.secondary")}
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
