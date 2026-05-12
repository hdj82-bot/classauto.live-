"use client";

import type { CSSProperties, ReactNode } from "react";
import { displayStyle } from "./tokens";

/**
 * 페이지 상단 헤더 — eyebrow + h1(Paperlogy) + subtitle + 우측 액션.
 *
 * docs/design-system/typography.md §2 Paperlogy 사용 규칙 (히어로 헤딩 1회만)
 * 을 페이지 상단에 적용한다. 카드 내부 작은 라벨에는 본 컴포넌트 미사용.
 *
 * 디자인 정합:
 * - eyebrow: 11px UPPERCASE letter-spacing 0.10em (gold-on-light)
 * - h1: Paperlogy 32-40px Bold, letter-spacing -0.02em
 * - subtitle: 14-15px text-muted
 * - 우측: 액션 버튼 슬롯
 */
export interface PageHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** 우측 액션 영역 (버튼 등). */
  actions?: ReactNode;
}

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  color: "var(--gold)",
  marginBottom: 8,
};

const h1Style: CSSProperties = {
  ...displayStyle,
  margin: 0,
  fontSize: "clamp(26px, 3.4vw, 34px)",
  fontWeight: 700,
  color: "var(--text)",
  lineHeight: 1.15,
};

const subtitleStyle: CSSProperties = {
  marginTop: 8,
  fontSize: 14,
  color: "var(--text-muted)",
  lineHeight: 1.55,
};

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: PageHeaderProps) {
  return (
    <header
      className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
      style={{ marginBottom: 28 }}
    >
      <div className="min-w-0">
        {eyebrow && <p style={eyebrowStyle}>{eyebrow}</p>}
        <h1 style={h1Style}>{title}</h1>
        {subtitle && <p style={subtitleStyle}>{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </header>
  );
}
