/**
 * 변경 로그 카테고리 — Keep a Changelog 표준의 4종에 1:1 매핑.
 * - feature   = Added
 * - improvement = Changed
 * - fix       = Fixed
 * - breaking  = Removed/Breaking (정책 변경 등)
 *
 * UI 의 카테고리 칩 색상은 색약자 친화 위해 색 + 글리프(▲ ✓ ✗ !) 이중 부호화.
 */
export type ChangelogCategory =
  | "feature"
  | "improvement"
  | "fix"
  | "breaking";

export const CHANGELOG_CATEGORIES: ChangelogCategory[] = [
  "feature",
  "improvement",
  "fix",
  "breaking",
];

/**
 * 단일 변경 항목 — i18n 의 본문 평탄화는 가독성이 떨어져 정적 배열로 둔다.
 * 백엔드 endpoint 가 도착하면 fetch 결과를 본 shape 으로 매핑해 공급.
 */
export interface ChangelogEntry {
  /** ISO date YYYY-MM-DD. 시간은 표시하지 않음. */
  date: string;
  /** 표시용 버전 라벨. semver 가 아니어도 됨. */
  version: string;
  /**
   * 표제. 한 줄 요약. 본문은 `bullets` 가 담당하며, 상세 링크는 `prs`.
   * 한국어 우선, 영어가 함께 필요한 경우 별도 i18n 패치 추가 가능 (현재는
   * 한국어로 통일 — 학계 사용자 비중 99%+).
   */
  title: string;
  category: ChangelogCategory;
  /** Markdown 가능 — 현재는 평문 string 으로 처리. */
  bullets: string[];
  /** GitHub PR 번호 또는 URL. 외부 링크가 아닌 PR 번호면 prefix 자동 적용. */
  prs?: Array<{ label: string; href: string }>;
}
