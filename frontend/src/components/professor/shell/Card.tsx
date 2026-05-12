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
