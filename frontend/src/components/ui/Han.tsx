/**
 * Han — 한자 강조 wrapper (typography.md §1.1)
 *
 *   <Han>中国语文法</Han>  →  serif + gold-on-light
 *
 * 다크 표면 안 (`.surface-dark` wrapper) 에서는 globals.css 의 `.han` 셀렉터가
 * 자동으로 색을 `--gold` 로 전환한다. 따라서 컴포넌트는 .han 클래스만 부여.
 *
 * 본문 안의 한자 단어에만 사용. UI 라벨·버튼에는 사용 금지.
 *
 * 경계 메모 (후속 정리 ②): 랜딩 히어로용 `landing/HanCharBadge` 와는 별개다
 * — 그쪽은 한 글자를 골드 박스+ruby 로 장식하는 decoration 이고, 본 Han 은
 * 본문 단어 인라인 typography 강조다. 서로 대체 불가. (사유는 HanCharBadge
 * 헤더 참조.)
 */

import type { ReactNode } from "react";

interface HanProps {
  children: ReactNode;
  className?: string;
}

export default function Han({ children, className = "" }: HanProps) {
  return <span className={`han ${className}`}>{children}</span>;
}
