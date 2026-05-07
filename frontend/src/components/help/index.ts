/**
 * `/help` 컴포넌트 묶음 진입점.
 *
 * 통합 PR 머지 후 `useHelpHubI18n` 만 thin wrapper 로 정리하면 본 묶음
 * (HelpContent · CategoryGrid · FaqAccordion · SearchBox) 은 그대로 재사용
 * 가능 (MERGE_NOTES.HELP_CHANGELOG.md 참조).
 */
export { default as HelpContent } from "./HelpContent";
export { default as CategoryGrid } from "./CategoryGrid";
export { default as FaqAccordion } from "./FaqAccordion";
export { default as SearchBox } from "./SearchBox";
export { useHelpHubI18n } from "./useHelpHubI18n";
export { buildSearchIndex, searchHelp } from "./search";
export {
  HELP_CATEGORY_IDS,
  type HelpCategoryId,
  type HelpFaqItem,
  type HelpSearchHit,
} from "./types";
