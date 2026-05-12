"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import LightMarketingShell from "@/components/marketing/LightMarketingShell";
import { useHelpHubI18n } from "./useHelpHubI18n";
import CategoryGrid from "./CategoryGrid";
import FaqAccordion from "./FaqAccordion";
import SearchBox from "./SearchBox";
import { buildSearchIndex, searchHelp } from "./search";
import {
  HELP_CATEGORY_IDS,
  type HelpCategoryId,
  type HelpFaqItem,
  type HelpSearchHit,
} from "./types";

/**
 * `/help` v2 — 라이트 베이지 + 골드.
 *
 * 4 모드 (기본 / 카테고리 선택 / 검색 / 검색 결과 0건) 그대로 유지.
 * `useDeferredValue` 로 입력 부드럽게 처리.
 */
export default function HelpContent() {
  const { t, tValue } = useHelpHubI18n();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [activeCategory, setActiveCategory] = useState<HelpCategoryId | null>(
    null,
  );

  const faqsByCategory = useMemo(() => {
    const map = {} as Record<HelpCategoryId, HelpFaqItem[]>;
    for (const id of HELP_CATEGORY_IDS) {
      map[id] = tValue<HelpFaqItem[]>(`faqs.${id}`) ?? [];
    }
    return map;
  }, [tValue]);

  const categoryLabels = useMemo(() => {
    const out = {} as Record<HelpCategoryId, string>;
    for (const id of HELP_CATEGORY_IDS) {
      out[id] = t(`categories.${id}.title`);
    }
    return out;
  }, [t]);

  const searchIndex = useMemo(
    () => buildSearchIndex(faqsByCategory, categoryLabels),
    [faqsByCategory, categoryLabels],
  );

  const itemCounts = useMemo(() => {
    const map = {} as Record<HelpCategoryId, number>;
    for (const id of HELP_CATEGORY_IDS) {
      map[id] = faqsByCategory[id]?.length ?? 0;
    }
    return map;
  }, [faqsByCategory]);

  const hasQuery = deferredQuery.trim().length > 0;
  const hits: HelpSearchHit[] = useMemo(() => {
    if (!hasQuery) return [];
    return searchHelp(searchIndex, deferredQuery);
  }, [searchIndex, deferredQuery, hasQuery]);

  const showSearch = hasQuery;
  const activeCategoryItems: HelpFaqItem[] | null = activeCategory
    ? faqsByCategory[activeCategory]
    : null;

  return (
    <LightMarketingShell topCta={{ href: "/contact", label: t("cta.primary") }}>
      {/* Hero + Search */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-10 text-center">
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
        <span className="mt-5 inline-flex items-center rounded-full border border-[rgba(184,131,8,0.30)] bg-[rgba(255,182,39,0.06)] px-3 py-1 text-xs font-medium text-[#B88308]">
          {t("hero.badge")}
        </span>
        <div className="mt-8 sm:mt-10">
          <SearchBox query={query} onQueryChange={setQuery} />
        </div>
      </section>

      {/* 본문 */}
      <section
        className="max-w-5xl mx-auto px-4 sm:px-6 pb-16"
        aria-live="polite"
      >
        {showSearch ? (
          <SearchResults hits={hits} />
        ) : activeCategoryItems !== null && activeCategory ? (
          <CategoryDetail
            categoryId={activeCategory}
            items={activeCategoryItems}
            onBack={() => setActiveCategory(null)}
          />
        ) : (
          <div className="space-y-12">
            <div>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[rgba(10,10,10,0.50)]">
                {t("categories.title")}
              </h2>
              <CategoryGrid
                itemCounts={itemCounts}
                onSelect={(id) => setActiveCategory(id)}
                active={activeCategory}
              />
            </div>
          </div>
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
              href="/contact"
              className="inline-flex justify-center rounded-xl bg-[#1A1A1A] text-white font-semibold px-6 py-3 text-sm hover:bg-black transition motion-reduce:transition-none shadow-lg shadow-black/15"
            >
              {t("cta.primary")}
            </Link>
            <a
              href={t("communityHref")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex justify-center rounded-xl border border-[rgba(26,26,26,0.20)] px-6 py-3 text-sm font-semibold text-[#1A1A1A] hover:bg-white/40 transition motion-reduce:transition-none"
            >
              {t("cta.secondary")}
            </a>
          </div>
        </div>
      </section>
    </LightMarketingShell>
  );
}

function CategoryDetail({
  categoryId,
  items,
  onBack,
}: {
  categoryId: HelpCategoryId;
  items: HelpFaqItem[];
  onBack: () => void;
}) {
  const { t } = useHelpHubI18n();
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="text-xs font-medium text-[rgba(10,10,10,0.55)] hover:text-[#0A0A0A] transition motion-reduce:transition-none"
      >
        {t("categoryView.back")}
      </button>
      <header className="mt-3 mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-[#0A0A0A]">
          {t(`categories.${categoryId}.title`)}
        </h2>
        <p className="mt-1 text-sm text-[rgba(10,10,10,0.55)]">
          {t(`categories.${categoryId}.description`)}
        </p>
        <p className="mt-2 text-xs tabular-nums text-[rgba(10,10,10,0.40)]">
          {t("categoryView.count", { count: items.length })}
        </p>
      </header>
      <FaqAccordion
        items={items}
        testIdPrefix={`help-category-${categoryId}`}
      />
    </div>
  );
}

function SearchResults({ hits }: { hits: HelpSearchHit[] }) {
  const { t } = useHelpHubI18n();

  if (hits.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[rgba(10,10,10,0.16)] bg-white px-6 py-12 text-center">
        <p className="text-sm font-medium text-[#0A0A0A]">
          {t("search.noResults")}
        </p>
        <p className="mt-1 text-xs text-[rgba(10,10,10,0.45)]">
          {t("search.noResultsHint")}
        </p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-[#0A0A0A]">
          {t("search.resultsTitle")}
        </h2>
        <p className="text-xs tabular-nums text-[rgba(10,10,10,0.45)]">
          {t("search.matches", { count: hits.length })}
        </p>
      </header>
      <ul className="space-y-3" data-testid="help-search-results">
        {hits.map((hit, i) => (
          <li
            key={`${hit.categoryId}-${hit.index}`}
            className="rounded-2xl border border-[rgba(10,10,10,0.08)] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(10,10,10,0.04)]"
            data-testid={`help-search-hit-${i}`}
          >
            <p className="text-[11px] uppercase tracking-wider text-[rgba(10,10,10,0.45)]">
              <span data-testid={`help-search-hit-${i}-category`}>
                {t(`categories.${hit.categoryId}.title`)}
              </span>
              <span aria-hidden="true" className="mx-1.5">
                ·
              </span>
              <span>
                {t("search.matchedIn", {
                  field:
                    hit.matchedField === "question"
                      ? t("search.fieldQuestion")
                      : hit.matchedField === "answer"
                        ? t("search.fieldAnswer")
                        : t("search.fieldCategory"),
                })}
              </span>
            </p>
            <h3 className="mt-1 text-sm font-medium leading-relaxed text-[#0A0A0A]">
              {hit.q}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[rgba(10,10,10,0.65)]">
              {hit.a}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
