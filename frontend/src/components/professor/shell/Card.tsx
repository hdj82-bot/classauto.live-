"use client";

import type { CSSProperties, ReactNode, HTMLAttributes } from "react";

/**
 * v2 card — light surface 위 카드 패턴.
 *
 * docs/prototypes/05-studio-flow.extracted.html `.preview-card` / `.script-card`
 * / `.done-stat` 패턴을 통합. `bg-card` + `border: 1px solid line` + `border-radius
 * 14px` + `shadow-sm` 기본, hover 시 `shadow-md`.
 *
 * `interactive` true 일 때 hover transform + shadow 변경 (대시보드 카드 등).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ui/Card 와의 경계 (후속 정리 ② — 의도적 분리 유지)
 *
 * ui/Card(Tailwind 클래스 + 전역 토큰, `dark` prop)와 역할이 겹치지만
 * 통합하지 않는다. 본 Card 는 `/professor/*` wrapper 의 scoped 토큰 위
 * inline-style 로 prototype 05 카드 수치(radius 14·shadow·hover transform)를
 * 픽셀 그대로 재현하며, padding/radius 를 prop 으로 노출해 교수자 화면의
 * dense list ↔ spacious detail 을 한 컴포넌트로 커버한다. ui/Card 로
 * 치환하면 메커니즘(class vs inline)·토큰 스코프가 달라 교수자 전 페이지
 * 회귀 위험이 있어 분리 유지. professor 도메인 안에서만 사용.
 * ─────────────────────────────────────────────────────────────────────────
 */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** 카드 padding (기본 18px). */
  padding?: number | string;
  /** 둥근 정도 (기본 14). */
  radius?: number;
  /** hover 인터랙션 표시. */
  interactive?: boolean;
}

const baseStyle = (
  padding: number | string,
  radius: number,
): CSSProperties => ({
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  borderRadius: radius,
  boxShadow: "var(--shadow-sm)",
  padding,
  transition:
    "border-color 180ms var(--ease-out), box-shadow 180ms var(--ease-out), transform 180ms var(--ease-out)",
});

export default function Card({
  children,
  padding = 18,
  radius = 14,
  interactive = false,
  style,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: CardProps) {
  const handleEnter: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (interactive) {
      e.currentTarget.style.borderColor = "var(--line-strong)";
      e.currentTarget.style.boxShadow = "var(--shadow-md)";
      e.currentTarget.style.transform = "translateY(-2px)";
    }
    onMouseEnter?.(e);
  };

  const handleLeave: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (interactive) {
      e.currentTarget.style.borderColor = "var(--line)";
      e.currentTarget.style.boxShadow = "var(--shadow-sm)";
      e.currentTarget.style.transform = "translateY(0)";
    }
    onMouseLeave?.(e);
  };

  return (
    <div
      {...rest}
      style={{ ...baseStyle(padding, radius), ...style }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}
    </div>
  );
}
