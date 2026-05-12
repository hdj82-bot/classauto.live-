"use client";

import type { ButtonHTMLAttributes, CSSProperties } from "react";

/**
 * v2 primary CTA — gold gradient fill, 검정 텍스트. ghost / secondary 변형 포함.
 *
 * docs/prototypes/05-studio-flow.extracted.html `.btn` / `.btn.primary` /
 * `.btn.ghost` 패턴.
 *
 * CTA 채움은 페이지당 1~2개로 제한 (colors.md §3-1).
 */
export interface ProfessorButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  /** 크기 — "sm"(36) / "md"(40, 기본) / "lg"(46) */
  size?: "sm" | "md" | "lg";
  /** 좌측 아이콘 (선택) */
  leadingIcon?: React.ReactNode;
  /** 우측 아이콘 (선택) */
  trailingIcon?: React.ReactNode;
}

const baseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  borderRadius: 10,
  fontWeight: 600,
  cursor: "pointer",
  border: "1px solid transparent",
  transition:
    "background 140ms var(--ease-out), border-color 140ms var(--ease-out), transform 100ms var(--ease-out), box-shadow 140ms var(--ease-out)",
};

const sizeMap: Record<NonNullable<ProfessorButtonProps["size"]>, CSSProperties> =
  {
    sm: { padding: "7px 12px", fontSize: 12.5 },
    md: { padding: "9px 16px", fontSize: 13.5 },
    lg: { padding: "12px 22px", fontSize: 14.5 },
  };

const variantMap: Record<NonNullable<ProfessorButtonProps["variant"]>, CSSProperties> =
  {
    primary: {
      background: "linear-gradient(135deg, #FFB627, #E89E0E)",
      color: "#0A0A0A",
      borderColor: "transparent",
      boxShadow: "0 4px 14px rgba(255, 182, 39, 0.34)",
    },
    secondary: {
      background: "var(--bg-card)",
      color: "var(--text)",
      borderColor: "var(--line-strong)",
    },
    ghost: {
      background: "transparent",
      color: "var(--text-muted)",
      borderColor: "transparent",
    },
  };

export default function ProfessorButton({
  variant = "secondary",
  size = "md",
  leadingIcon,
  trailingIcon,
  children,
  style,
  ...rest
}: ProfessorButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      style={{
        ...baseStyle,
        ...sizeMap[size],
        ...variantMap[variant],
        ...style,
      }}
    >
      {leadingIcon && (
        <span aria-hidden="true" className="inline-flex flex-shrink-0">
          {leadingIcon}
        </span>
      )}
      {children}
      {trailingIcon && (
        <span aria-hidden="true" className="inline-flex flex-shrink-0">
          {trailingIcon}
        </span>
      )}
    </button>
  );
}
