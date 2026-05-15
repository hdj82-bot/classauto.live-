/**
 * Card — v2 (2026-05-12)
 *
 *   bg-card (FFFFFF) + line + shadow-sm. hover 시 shadow-md + bg-hover 옵션.
 *   05·06 prototype 의 카드 패턴 통합. 패딩은 호출자가 정함 (Card 내부에서
 *   고정하지 않아 dense list / spacious detail 양쪽 모두 깔끔).
 *
 * 다크 표면에서 사용 시 `.surface-dark` wrapper 안에 두면 자동으로 다크 카드
 * 토큰을 쓸 수 있도록 `dark` prop 으로 명시 전환.
 *
 * 경계 메모 (후속 정리 ②): `/professor/*` 영역에는 scoped 토큰 + inline-style
 * 기반 `professor/shell/Card` 가 별도로 있고 의도적으로 분리 유지한다. 본
 * ui/Card 는 professor 도메인 밖 전용. (사유는 shell/Card.tsx 헤더 참조.)
 */

import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hoverable?: boolean;
  dark?: boolean;
}

export default function Card({
  children,
  hoverable = false,
  dark = false,
  className = "",
  ...rest
}: CardProps) {
  const base = dark
    ? "bg-[var(--bg-card-dark)] border border-[var(--line-dark)] text-[var(--text-dark)]"
    : "bg-[var(--bg-card)] border border-[var(--line)] text-[var(--text)]";

  const hover = hoverable
    ? dark
      ? "transition-all duration-150 ease-[var(--ease-out)] hover:border-[var(--line-dark-strong)]"
      : "transition-all duration-150 ease-[var(--ease-out)] hover:shadow-[var(--shadow-md)] hover:border-[var(--line-strong)]"
    : "";

  return (
    <div
      className={`rounded-xl shadow-[var(--shadow-sm)] ${base} ${hover} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
