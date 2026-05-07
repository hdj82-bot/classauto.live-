"use client";

import { useId } from "react";
import { useHelpHubI18n } from "./useHelpHubI18n";

/**
 * 도움말 검색 입력 박스 — 다크 베이스 마케팅 톤(`MarketingShell`)에 맞춤.
 *
 * - controlled input. 부모(HelpContent)가 `query` 와 setter 를 보유.
 * - "지우기" 버튼은 `query.length > 0` 시에만 등장.
 * - aria-label 은 placeholder 와 별개로 i18n.
 */
interface SearchBoxProps {
  query: string;
  onQueryChange: (q: string) => void;
}

export default function SearchBox({ query, onQueryChange }: SearchBoxProps) {
  const { t } = useHelpHubI18n();
  const id = useId();
  const inputId = `${id}-help-search`;

  return (
    <div className="relative">
      <label htmlFor={inputId} className="sr-only">
        {t("search.label")}
      </label>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-white/40"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M21 21l-4.35-4.35M11 17a6 6 0 100-12 6 6 0 000 12z"
          />
        </svg>
      </span>
      <input
        id={inputId}
        type="search"
        inputMode="search"
        autoComplete="off"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={t("search.placeholder")}
        aria-label={t("search.label")}
        className="w-full rounded-2xl border border-white/10 bg-white/[0.03] py-3.5 pl-11 pr-12 text-sm text-white placeholder:text-white/35 outline-none focus:border-amber-400/60 focus:bg-white/[0.05]"
      />
      {query.length > 0 && (
        <button
          type="button"
          onClick={() => onQueryChange("")}
          aria-label={t("search.clear")}
          className="absolute inset-y-0 right-0 flex items-center pr-4 text-xs font-medium text-white/50 hover:text-white"
        >
          {t("search.clear")}
        </button>
      )}
    </div>
  );
}
