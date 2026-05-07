/**
 * 도움말 카테고리 ID — i18n 패치의 `categories.<id>` 와 `faqs.<id>` 의 키와
 * 일치한다. 새 카테고리를 추가할 때는 두 곳에 동일하게 추가.
 */
export type HelpCategoryId =
  | "getting-started"
  | "video-creation"
  | "students"
  | "billing"
  | "security"
  | "troubleshooting";

export const HELP_CATEGORY_IDS: HelpCategoryId[] = [
  "getting-started",
  "video-creation",
  "students",
  "billing",
  "security",
  "troubleshooting",
];

export interface HelpFaqItem {
  q: string;
  a: string;
}

/**
 * 검색 결과 모델 — 모든 카테고리의 FAQ 를 단일 평탄화 배열로 본 뒤 매칭.
 * `matchedField` 는 결과 카드에 "질문/답변/카테고리에서 일치" 보조 라벨로 노출.
 */
export interface HelpSearchHit {
  categoryId: HelpCategoryId;
  index: number;
  q: string;
  a: string;
  matchedField: "question" | "answer" | "category";
}
