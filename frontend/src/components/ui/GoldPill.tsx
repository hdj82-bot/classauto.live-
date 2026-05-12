/**
 * GoldPill — v2 (2026-05-12)
 *
 * 06 prototype 의 강의 메타 chip 패턴:
 *   gold-soft 배경 + gold-medium border + gold-on-light 텍스트.
 *
 * 사용:
 *   <GoldPill>把자문</GoldPill>
 *   <GoldPill leadingIcon={<Icon/>}>중급</GoldPill>
 *
 * 한자 강조와 결합 시 children 안에 <Han> 사용. 두 토큰이 같은 gold-on-light
 * 라 색은 일치하되 폰트 (serif) 만 한자에 적용된다.
 */

import type { ReactNode } from "react";

interface GoldPillProps {
  children: ReactNode;
  leadingIcon?: ReactNode;
  className?: string;
  /** 다크 표면 위에서는 색 자동 보정 (--gold 사용) */
  dark?: boolean;
}

export default function GoldPill({
  children,
  leadingIcon,
  className = "",
  dark = false,
}: GoldPillProps) {
  const colorCls = dark
    ? "text-[var(--gold)] border-[color:rgba(255,182,39,0.30)] bg-[color:rgba(255,182,39,0.12)]"
    : "text-[var(--gold-on-light)] border-[var(--gold-medium)] bg-[var(--gold-soft)]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorCls} ${className}`}
    >
      {leadingIcon && <span className="shrink-0">{leadingIcon}</span>}
      {children}
    </span>
  );
}
