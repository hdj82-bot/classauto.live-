/**
 * Button — v2 (2026-05-12)
 *
 * 3 variants × 3 sizes. 05·06 prototype 의 button 패턴 통합.
 *
 *   variant:
 *     filled  - gold 채움 + 검정 텍스트 (CTA 1개당 1번 원칙, colors.md §3)
 *     outline - bg-card 위 border, gold-on-light 텍스트
 *     ghost   - 투명 배경, text-muted, hover bg-hover
 *
 *   size:
 *     sm 32px / md 38px / lg 44px
 *
 * 다크 표면 (`.surface-dark` 안) 에서는 filled 의 텍스트는 그대로 검정,
 * outline·ghost 는 명도가 자동으로 뒤집힌다 (--text → --text-dark via wrapper).
 *
 * `transition-colors` 만 사용 (animations.md §1.3 60fps 원칙).
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "filled" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

const variantClass: Record<Variant, string> = {
  filled:
    "bg-[var(--gold)] text-[#0A0A0A] hover:bg-[var(--gold-bright)] active:bg-[var(--gold-deep)] disabled:bg-[var(--bg-hover)] disabled:text-[var(--text-subtle)]",
  outline:
    "bg-[var(--bg-card)] text-[var(--gold-on-light)] border border-[var(--line-strong)] hover:border-[var(--gold-on-light)] hover:bg-[var(--gold-soft)] disabled:opacity-50",
  ghost:
    "bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)] disabled:opacity-50",
};

const sizeClass: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-6 text-sm font-semibold gap-2",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "outline",
    size = "md",
    leadingIcon,
    trailingIcon,
    fullWidth = false,
    className = "",
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  const widthCls = fullWidth ? "w-full" : "";
  return (
    <button
      ref={ref}
      type={type}
      className={[
        "inline-flex items-center justify-center rounded-lg font-medium",
        "transition-colors duration-150 ease-[var(--ease-out)]",
        "disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
        variantClass[variant],
        sizeClass[size],
        widthCls,
        className,
      ].join(" ")}
      {...rest}
    >
      {leadingIcon && <span className="shrink-0">{leadingIcon}</span>}
      <span>{children}</span>
      {trailingIcon && <span className="shrink-0">{trailingIcon}</span>}
    </button>
  );
});

export default Button;
