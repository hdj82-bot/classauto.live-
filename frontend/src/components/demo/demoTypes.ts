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
 */
export function isOnTopic(question: string, field: DemoField): boolean {
  const q = question.toLowerCase().trim();
  if (!q) return false;
  const keywords: Record<DemoField, ReadonlyArray<string>> = {
    social: [
      "gdp",
      "gnp",
      "위안",
      "yuan",
      "중국",
      "china",
      "디지털",
      "digital",
      "경제",
      "economy",
      "사회",
      "society",
      "무역",
      "trade",
      "blockchain",
      "블록체인",
      "비트코인",
      "bitcoin",
      "암호화폐",
      "crypto",
    ],
    natural: [
      "광속",
      "speed of light",
      "빛",
      "light",
      "상대성",
      "relativ",
      "시간",
      "time",
      "팽창",
      "dilation",
      "쌍둥이",
      "twin",
      "관성",
      "inertial",
      "에너지",
      "energy",
      "질량",
      "mass",
    ],
  };
  return keywords[field].some((k) => q.includes(k));
}
