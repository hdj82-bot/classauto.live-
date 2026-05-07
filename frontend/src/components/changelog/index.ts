/**
 * `/changelog` 컴포넌트 묶음 진입점.
 *
 * 시드 데이터(`changelogEntries.ts`)는 백엔드 endpoint 도착 후 fetch 결과로
 * 교체될 수 있도록 `ChangelogContent` 가 `entries` prop 을 받는다.
 */
export { default as ChangelogContent } from "./ChangelogContent";
export { default as CategoryFilter } from "./CategoryFilter";
export { default as EntryCard } from "./EntryCard";
export { useChangelogHubI18n } from "./useChangelogHubI18n";
export { CHANGELOG_SEED } from "./changelogEntries";
export {
  CHANGELOG_CATEGORIES,
  type ChangelogCategory,
  type ChangelogEntry,
} from "./types";
