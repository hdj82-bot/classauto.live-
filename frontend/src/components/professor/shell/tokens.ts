/**
 * Professor v2 — design tokens (scoped CSS variables).
 *
 * docs/prototypes/05-studio-flow.extracted.html 의 :root 토큰을 그대로 옮긴 것.
 * globals.css 와 tailwind.config.ts 는 창 1(디자인 시스템 v2) 영역이라 직접
 * 변경할 수 없어 본 토큰은 `/professor/*` 영역 wrapper 의 inline style 로
 * 주입한다. 외부 페이지에는 누출되지 않음.
 *
 * 라이트 베이지 + 골드 액센트. 다크 표면(학생 player) 토큰은 본 wrapper 범위
 * 밖이라 포함하지 않는다.
 */
import type { CSSProperties } from "react";

/**
 * `/professor/*` 영역 wrapper 의 root style 에 spread 한다.
 * Tailwind arbitrary value (`bg-[var(--bg)]`, `border-[var(--line)]`) 또는
 * inline style 양쪽 모두에서 참조 가능.
 */
export const professorTokens: CSSProperties = {
  // Surface — light
  ["--bg" as string]: "#FAFAF7",
  ["--bg-card" as string]: "#FFFFFF",
  ["--bg-sidebar" as string]: "#FAFAF7",
  ["--bg-hover" as string]: "#F4F0E2",
  ["--bg-subtle" as string]: "#F5F4EF",

  // Text
  ["--text" as string]: "#0A0A0A",
  ["--text-muted" as string]: "rgba(10, 10, 10, 0.62)",
  ["--text-subtle" as string]: "rgba(10, 10, 10, 0.40)",
  ["--text-faint" as string]: "rgba(10, 10, 10, 0.28)",

  // Line
  ["--line" as string]: "#ECECE6",
  ["--line-strong" as string]: "#E0E0DA",

  // Gold — light surface (on-light 5.1:1)
  ["--gold" as string]: "#B88308",
  ["--gold-bright" as string]: "#FFB627",
  ["--gold-deep" as string]: "#E89E0E",
  ["--gold-soft" as string]: "rgba(255, 182, 39, 0.10)",
  ["--gold-medium" as string]: "rgba(255, 182, 39, 0.20)",
  ["--gold-glow" as string]: "rgba(255, 182, 39, 0.18)",

  // Semantic
  ["--success" as string]: "#10B981",
  ["--warning" as string]: "#EF4444",
  ["--info" as string]: "#3B82F6",

  // Shadow (light surface; 다크 surface 는 본 wrapper 범위 밖)
  // 라이트 베이지 위에서 카드 입체감이 보이도록 sm/md 를 강화(기존 0.04/0.06 은 거의
  // 안 보였다). 2단 그림자로 가까운 윤곽 + 넓은 깊이를 동시에 준다.
  ["--shadow-sm" as string]:
    "0 1px 2px rgba(10, 10, 10, 0.05), 0 2px 6px rgba(10, 10, 10, 0.06)",
  ["--shadow-md" as string]:
    "0 2px 6px rgba(10, 10, 10, 0.06), 0 8px 22px rgba(10, 10, 10, 0.12)",
  ["--shadow-lg" as string]: "0 16px 48px rgba(10, 10, 10, 0.10)",
  ["--shadow-xl" as string]: "0 24px 64px rgba(10, 10, 10, 0.16)",

  // Typography (Geist 가 root layout 에서 강제되어 있어 본 wrapper 에서 덮음)
  ["--font-display" as string]:
    "'Paperlogy', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif",
  ["--font-body" as string]:
    "'Pretendard Variable', 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  ["--font-han" as string]:
    "'Noto Serif KR', 'Source Han Serif KR', serif",

  // Motion
  ["--ease-out" as string]: "cubic-bezier(0.22, 1, 0.36, 1)",
  ["--ease-spring" as string]: "cubic-bezier(0.34, 1.56, 0.64, 1)",

  // 본 wrapper 의 base font / color — Geist body 를 덮음
  fontFamily: "var(--font-body)",
  background: "var(--bg)",
  color: "var(--text)",
};

/**
 * 한자 강조 — `.han` 대용. `<span style={hanStyle}>把</span>` 형태로 사용.
 * docs/design-system/typography.md §1.1 + colors.md §4.
 */
export const hanStyle: CSSProperties = {
  fontFamily: "var(--font-han)",
  color: "var(--gold)",
};

/**
 * Display 헤드라인 — Paperlogy 사용.
 * docs/design-system/typography.md §2.
 */
export const displayStyle: CSSProperties = {
  fontFamily: "var(--font-display)",
  letterSpacing: "-0.02em",
};

/**
 * Tabular numerals — 숫자 정렬 (가격·통계·진행률).
 * Geist Mono 폐기, Pretendard tabular-nums 로 통일.
 */
export const tabularStyle: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: "'tnum'",
};
