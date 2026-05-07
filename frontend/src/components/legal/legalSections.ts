import type { DocumentSpec } from "./types";

/**
 * 두 법무 문서의 섹션 순서. JSON dictionary 의 sections 키와 1:1 일치해야
 * 하며, 본 배열의 길이가 곧 페이지의 조항 수입니다.
 *
 * 변경 시:
 *   1. `messages/_patches/legalHub.{ko,en}.json` 의 `sections.<slug>` 추가/제거
 *   2. 본 배열 갱신
 *   3. JSON 의 `changeLog` 에 변경 이력 한 줄 추가 (필요 시)
 *   4. `__tests__/legal/legalSections.test.ts` 가 회귀 검증
 */

export const TERMS: DocumentSpec = {
  kind: "terms",
  i18nKey: "terms",
  sectionSlugs: [
    "purpose",
    "definitions",
    "effect",
    "service",
    "account",
    "duties",
    "content",
    "studentData",
    "billing",
    "termination",
    "limits",
    "abuse",
    "dispute",
    "notice",
  ],
};

export const PRIVACY: DocumentSpec = {
  kind: "privacy",
  i18nKey: "privacy",
  sectionSlugs: [
    "preamble",
    "items",
    "method",
    "purpose",
    "retention",
    "thirdParty",
    "delegation",
    "embeddings",
    "studentSpecial",
    "demoData",
    "rights",
    "safeguards",
    "cookies",
    "dpo",
    "amendment",
  ],
};

/** Anchor id helper — 두 문서 모두 prefix 가 충돌하지 않도록 분리. */
export function sectionAnchorId(kind: "terms" | "privacy", slug: string): string {
  return `${kind}-section-${slug}`;
}

export const CHANGELOG_ANCHOR = {
  terms: "terms-changelog",
  privacy: "privacy-changelog",
} as const;
