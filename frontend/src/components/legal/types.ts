/**
 * /terms · /privacy 양쪽 페이지가 공유하는 타입 정의.
 *
 * 본 PR 의 본문은 `messages/_patches/legalHub.{ko,en}.json` 에 살아있으며,
 * 컴포넌트는 i18n key 만 들고 다닌다. `useLegalI18n().tValue<...>()` 로 아래
 * 인터페이스에 맞는 구조화 데이터를 dictionary 에서 lookup.
 *
 * `Block` 4종 (p / ol / ul / table) 만 지원 — 법무 문서에 필요한 표현은 이
 * 네 가지로 충분합니다. 다른 형식 (예: callout, image) 이 추가될 경우 본
 * 인터페이스에 새 kind 를 추가하고 `LegalSection` 에서 분기하세요.
 */

export interface ParagraphBlock {
  kind: "p";
  text: string;
}

export interface OrderedListBlock {
  kind: "ol";
  items: string[];
}

export interface UnorderedListBlock {
  kind: "ul";
  items: string[];
}

export interface TableBlock {
  kind: "table";
  head: string[];
  rows: string[][];
}

export type Block =
  | ParagraphBlock
  | OrderedListBlock
  | UnorderedListBlock
  | TableBlock;

export interface SectionData {
  /** 표시용 번호 — "제1조" / "1." 등. i18n 으로 들어옴. */
  number: string;
  title: string;
  blocks: Block[];
}

export interface ChangeLogEntry {
  date: string;
  summary: string;
}

/** TocSidebar 가 받아 anchor 점프와 active highlight 에 사용. */
export interface TocItem {
  /** Section anchor id — `terms-section-${slug}` 또는 `privacy-section-${slug}`. */
  id: string;
  /** i18n 에서 가져오는 section number 와 title 의 사전 결합 결과. */
  label: string;
}

export type LegalDocumentKind = "terms" | "privacy";

/**
 * 한 문서의 콘텐츠 구성을 정의하는 정적 메타데이터. `legalSections.ts` 에 두
 * 문서 (terms / privacy) 의 slug 순서를 둠. JSON 의 키 trie 와 1:1 매칭되어
 * 한 곳에서 추가/제거하면 다른 곳도 함께 갱신되어야 한다 — 테스트가 회귀
 * 검증한다 (`legalSections.test.ts`).
 */
export interface DocumentSpec {
  kind: LegalDocumentKind;
  /** 섹션 slug 배열 (i18n 의 sections.<slug>.* 와 1:1 매칭). */
  sectionSlugs: readonly string[];
  /** 페이지 이름의 i18n key prefix — `terms` 또는 `privacy`. */
  i18nKey: LegalDocumentKind;
}
