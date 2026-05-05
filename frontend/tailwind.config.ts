import type { Config } from "tailwindcss";

/**
 * N3 (round 4): 다크 모드 1차 도입 — `prefers-color-scheme: dark` 자동 추적.
 *
 * 'media' 전략은 OS 설정을 그대로 따라가므로 토글 UI 가 필요 없다. 추후
 * 사용자 토글 + persist 가 필요해지면 'class' 로 전환하고 ThemeProvider 추가.
 *
 * Tailwind v4 는 CSS 측 `@import "tailwindcss"` + `@theme inline` 으로
 * 설정을 흡수하지만, 본 파일은 darkMode 전략을 명시적으로 문서화하기 위해
 * 유지한다 (PostCSS plugin 이 존재 시 인지).
 */
const config: Config = {
  darkMode: "media",
  content: [
    "./src/**/*.{ts,tsx,js,jsx,mdx}",
  ],
};

export default config;
