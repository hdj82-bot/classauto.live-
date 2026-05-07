"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import MarketingShell from "@/components/marketing/MarketingShell";
import SectionHeader from "@/components/marketing/SectionHeader";
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
 * `/help` 페이지의 본체. MarketingShell 안에서 다음 4 모드를 전환한다:
 *
 *   1) 기본 — 검색 비어있고 활성 카테고리 없음 → 카테고리 그리드 + 인기 FAQ
 *   2) 카테고리 선택 — 그리드 위 카테고리 클릭 → 해당 카테고리 FAQ 만 노출
 *   3) 검색 활성 — 검색 입력에 글자가 있으면 카테고리 무시하고 매칭 결과
 *   4) 검색 결과 0 건 — 친절한 안내 + 카테고리 fallback
 *
 * 검색은 `useDeferredValue` 로 입력 부드럽게 처리. 별도 debounce 없이도
 * React 19 가 input 입력을 우선해 결과 계산은 양보된 frame 에서 수행.
 */
export default function HelpContent() {
  const { t, tValue } = useHelpHubI18n();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [activeCategory, setActiveCategory] = useState<HelpCategoryId | null>(
    null,
  );

  // i18n 패치에서 카테고리별 FAQ 배열 모두 끌어오기
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

  // 검색 활성 시 카테고리는 무시. 사용자가 검색을 비우면 활성 카테고리가 다시
  // 효과 발휘.
  const showSearch = hasQuery;
  const activeCategoryItems: HelpFaqItem[] | null = activeCategory
    ? faqsByCategory[activeCategory]
    : null;

  return (
    <MarketingShell
      topCta={{ href: "/contact", label: t("cta.primary") }}
    >
      {/* Hero + Search */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-10">
        <SectionHeader
          eyebrow={t("hero.eyebrow")}
          title={t("hero.title")}
          subtitle={t("hero.subtitle")}
          badge={t("hero.badge")}
        />
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
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/45">
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
        <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-400/10 to-transparent p-8 sm:p-10 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {t("cta.title")}
          </h2>
          <p className="mt-3 text-white/70 max-w-xl mx-auto">
            {t("cta.description")}
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/contact"
              className="inline-flex justify-center rounded-xl bg-amber-400 text-black font-semibold px-6 py-3 text-sm hover:bg-amber-300 transition motion-reduce:transition-none"
            >
              {t("cta.primary")}
            </Link>
            <a
              href={t("communityHref")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex justify-center rounded-xl border border-white/15 px-6 py-3 text-sm font-medium text-white/90 hover:bg-white/5 transition motion-reduce:transition-none"
            >
              {t("cta.secondary")}
            </a>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

/**
 * 카테고리 상세 — 뒤로가기 + 항목 수 + 아코디언.
 */
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
        className="text-xs font-medium text-white/55 hover:text-white motion-reduce:transition-none"
      >
        {t("categoryView.back")}
      </button>
      <header className="mt-3 mb-6">
        <h2 className="text-2xl font-bold tracking-tight">
          {t(`categories.${categoryId}.title`)}
        </h2>
        <p className="mt-1 text-sm text-white/55">
          {t(`categories.${categoryId}.description`)}
        </p>
        <p className="mt-2 text-xs tabular-nums text-white/40">
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

/**
 * 검색 결과 — 평탄화된 hits 를 카테고리별로 그룹핑하지 않고 단일 리스트로
 * 노출 (점수 내림차순). matchedField 를 보조 라벨로 항상 함께.
 */
function SearchResults({ hits }: { hits: HelpSearchHit[] }) {
  const { t } = useHelpHubI18n();

  if (hits.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
        <p className="text-sm font-medium text-white/85">
          {t("search.noResults")}
        </p>
        <p className="mt-1 text-xs text-white/45">
          {t("search.noResultsHint")}
        </p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("search.resultsTitle")}
        </h2>
        <p className="text-xs tabular-nums text-white/45">
          {t("search.matches", { count: hits.length })}
        </p>
      </header>
      <ul className="space-y-3" data-testid="help-search-results">
        {hits.map((hit, i) => (
          <li
            key={`${hit.categoryId}-${hit.index}`}
            className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4"
            data-testid={`help-search-hit-${i}`}
          >
            <p className="text-[11px] uppercase tracking-wider text-white/40">
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
            <h3 className="mt-1 text-sm font-medium leading-relaxed text-white">
              {hit.q}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
              {hit.a}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
