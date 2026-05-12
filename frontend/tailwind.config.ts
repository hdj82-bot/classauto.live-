import type { Config } from "tailwindcss";

/**
 * Design System v2 (2026-05-12) — Tailwind v4 설정
 *
 * Tailwind v4 는 CSS 측의 `@import "tailwindcss"` + `@theme inline` 으로
 * 토큰을 흡수한다 (실제 토큰 정의는 `src/app/globals.css`).
 *
 * v2 변경:
 * - darkMode 전략: "media" → "class"
 *   학생 시청 player·인터스티셜 퀴즈 등 일부 영역만 다크로 토글하기 위함.
 *   라이트 베이지가 사이트 전체 기본이므로 OS 다크 자동 적용은 정책 위반.
 *   `surface-dark` wrapper 클래스 (globals.css) 또는 `dark:` Tailwind
 *   variant 로 명시 다크 처리.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx,js,jsx,mdx}",
  ],
};

export default config;
