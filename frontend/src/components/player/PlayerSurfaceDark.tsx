"use client";

import type { ReactNode } from "react";
import tokensCss from "../student/v2/tokens-v2.module.css";
import GradientDefs from "../student/v2/GradientDefs";

/**
 * PlayerSurfaceDark — 영상 시청 페이지(/lecture/[slug])의 다크 톤 래퍼.
 *
 * - colors.md §1: 영상이 화면에 있으면 다크 (`#0A0A0A`).
 * - 토큰은 .surfaceDark 클래스에 묶여 자식 컴포넌트가 var(--bg-dark) 등을
 *   바로 참조한다. StudentSurfaceLight 와 같은 디자인 토큰 카드(2개)지만
 *   적용 노드만 다르다.
 * - aurora(라이트용) 는 깔지 않는다 — 다크에서는 영상 자체가 주인공이라
 *   배경에 미세 효과도 자제 (06 prototype 의 .v4 화면도 plain 다크).
 */
export interface PlayerSurfaceDarkProps {
  children: ReactNode;
}

export default function PlayerSurfaceDark({ children }: PlayerSurfaceDarkProps) {
  return (
    <main className={tokensCss.surfaceDark} style={{ display: "flex", flexDirection: "column" }}>
      <GradientDefs />
      {children}
    </main>
  );
}
