/**
 * Demo 페이지에서 사용하는 도메인 타입.
 *
 * 베타 단계 mock 응답 → 추후 backend `/api/demo/qa` 연동 시
 * 동일 형태(`DemoAnswer`)로 응답을 받도록 설계.
 */

export type DemoField = "social" | "natural";

export interface DemoFieldConfig {
  /** 영상 파일명 (확장자 제외) — `/public/demo/{slug}.mp4` 로 매핑 */
  slug: string;
  /** RAG mock 의 추천 질문 키 (i18n) */
  suggestedKeys: ReadonlyArray<string>;
  /** 추천 질문에 대응하는 답변 키 (i18n) */
  answerKeys: ReadonlyArray<string>;
  /** 답변 시 표시할 출처 슬라이드 i18n 키 */
  sourceSlideKey: string;
  /** 답변 시 표시할 영상 시점 범위 i18n 키 */
  videoTimeRangeKey: string;
}

export const DEMO_FIELDS: Record<DemoField, DemoFieldConfig> = {
  social: {
    slug: "social-science",
    suggestedKeys: ["suggested.socialQ1", "suggested.socialQ2"],
    answerKeys: ["mockAnswers.socialQ1", "mockAnswers.socialQ2"],
    sourceSlideKey: "answer.sourceSlideSocial",
    videoTimeRangeKey: "answer.videoTimeRangeSocial",
  },
  natural: {
    slug: "natural-science",
    suggestedKeys: ["suggested.naturalQ1", "suggested.naturalQ2"],
    answerKeys: ["mockAnswers.naturalQ1", "mockAnswers.naturalQ2"],
    sourceSlideKey: "answer.sourceSlideNatural",
    videoTimeRangeKey: "answer.videoTimeRangeNatural",
  },
};

export interface DemoAnswer {
  id: string;
  /** RAG 가드레일에 의해 강의 외 질문으로 거부된 경우 true */
  offTopic: boolean;
  /** 답변 본문 (offTopic === true 인 경우 거부 메시지) */
  body: string;
  /** 출처 슬라이드 (offTopic 인 경우 null) */
  sourceSlide: string | null;
  /** 영상 시점 (offTopic 인 경우 null) */
  videoTimeRange: string | null;
}

/** 데모 한도 — 02-guardrails.md Section 7 참조 */
export const DEMO_QUESTION_LIMIT = 3;

/** 데모 입력 글자 수 한도 — 실서비스 500자 → 데모 200자 */
export const DEMO_INPUT_MAX = 200;

/**
 * 강의 외 질문 휴리스틱.
 *
 * 베타 단계 mock 분기. 실제 RAG 임계값(0.65) 적용은 backend `/api/demo/qa`
 * 연동 후. 여기서는 강의 키워드 사전 비교로 단순 분기.
 *
 * 강의 주제 (PR #116 디자인 갱신 이후, 2026-05-13):
 *   - social  = 인문계열 · "중국어문법의 이해" (把자문 어순 규칙)
 *   - natural = 자연계열 · "광합성의 원리" (빛 에너지 → 화학 에너지)
 *
 * v1 의 GDP/위안화/광속/상대성 키워드는 폐기 (옛 강의 주제). 자연스러운 학생
 * 질문 ("광합성은 무슨 원리인가요?", "把자문은 언제 쓰나요?") 이 한 키워드만
 * 포함하면 통과하도록 충분히 넓게 깔되, 학습과 무관한 일상 질문은 막는다.
 */
export function isOnTopic(question: string, field: DemoField): boolean {
  const q = question.toLowerCase().trim();
  if (!q) return false;
  const keywords: Record<DemoField, ReadonlyArray<string>> = {
    // 인문계열 · 중국어문법의 이해 (把자문)
    social: [
      "把",
      "把자문",
      "把字句",
      "ba구문",
      "ba sentence",
      "중국어",
      "중국어문법",
      "한어",
      "汉语",
      "中文",
      "chinese",
      "어순",
      "어법",
      "문법",
      "syntax",
      "grammar",
      "동사",
      "verb",
      "목적어",
      "object",
      "주어",
      "subject",
      "전치사",
      "preposition",
      "처치",
      "처치문",
      "처치식",
    ],
    // 자연계열 · 광합성의 원리
    natural: [
      "광합성",
      "photosynthesis",
      "엽록",
      "chlorophyl",
      "chloroplast",
      "빛",
      "light",
      "명반응",
      "암반응",
      "calvin",
      "이산화탄소",
      "co2",
      "carbon dioxide",
      "산소",
      "oxygen",
      "포도당",
      "glucose",
      "atp",
      "nadph",
      "화학",
      "chemical",
      "에너지",
      "energy",
      "식물",
      "plant",
      "잎",
      "leaf",
      "원리",
      "principle",
    ],
  };
  return keywords[field].some((k) => q.includes(k.toLowerCase()));
}
