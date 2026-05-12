/**
 * Han — 한자 강조 wrapper (typography.md §1.1)
 *
 *   <Han>中国语文法</Han>  →  serif + gold-on-light
 *
 * 다크 표면 안 (`.surface-dark` wrapper) 에서는 globals.css 의 `.han` 셀렉터가
 * 자동으로 색을 `--gold` 로 전환한다. 따라서 컴포넌트는 .han 클래스만 부여.
 *
 * 본문 안의 한자 단어에만 사용. UI 라벨·버튼에는 사용 금지.
 */

import type { ReactNode } from "react";

interface HanProps {
  children: ReactNode;
  className?: string;
}

export default function Han({ children, className = "" }: HanProps) {
  return <span className={`han ${className}`}>{children}</span>;
}
