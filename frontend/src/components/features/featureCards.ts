import type { FeatureAccent } from "./FeatureCard";

/**
 * /features 페이지 9개 카드의 정적 메타. README 의 §주요 기능 표 9개 항목을
 * 그대로 옮긴 것 — 본 PR 의 source-of-truth 는 README 입니다.
 *
 * 순서는 README 표와 동일하되, 사용자 멘탈 모델에 맞춰 "콘텐츠 제작 → 학습 →
 * 분석/운영" 흐름을 따라가도록 카드 grid 가 자연스럽게 읽히게 배열.
 */

export interface FeatureCardMeta {
  /** i18n key suffix under `featuresHub.cards.items.*`. */
  key: string;
  accent: FeatureAccent;
  /** Single SVG path string — passed to FeatureCard `icon` prop. */
  iconPath: string;
}

export const FEATURE_CARDS: FeatureCardMeta[] = [
  {
    key: "pipeline",
    accent: "electric",
    iconPath:
      "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
  },
  {
    key: "assess",
    accent: "violet",
    iconPath:
      "M9 12l2 2 4-4 m-7 8h10a2 2 0 002-2V6a2 2 0 00-2-2H8a2 2 0 00-2 2v12a2 2 0 002 2z",
  },
  {
    key: "session",
    accent: "cyan",
    iconPath:
      "M12 8v4l3 2 m-3-9a9 9 0 11-9 9 9 9 0 019-9z",
  },
  {
    key: "attention",
    accent: "pink",
    iconPath:
      "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
  },
  {
    key: "rag",
    accent: "electric",
    iconPath:
      "M8 10h.01 M12 10h.01 M16 10h.01 M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
  },
  {
    key: "billing",
    accent: "success",
    iconPath:
      "M3 10h18 M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z M7 14h2",
  },
  {
    key: "translate",
    accent: "cyan",
    iconPath:
      "M3 5h12 M9 3v2 m1.048 9.5A18.022 18.022 0 016.412 9 m6.088 9h7 M11 21l5-10 5 10 M12.751 5C11.783 10.77 8.07 15.61 3 18.129",
  },
  {
    key: "i18n",
    accent: "violet",
    iconPath:
      "M21 12a9 9 0 11-18 0 9 9 0 0118 0z M3.6 9h16.8 M3.6 15h16.8 M11.5 3a17 17 0 010 18 M12.5 3a17 17 0 010 18",
  },
  {
    key: "dashboard",
    accent: "pink",
    iconPath:
      "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2z m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10 m-6 0a2 2 0 002 2h2a2 2 0 002-2 m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  },
];
