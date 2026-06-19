"use client";

import type { CSSProperties, ReactNode } from "react";
import ProfessorTopbar, { type ProfessorTopbarProps } from "./Topbar";
import ProfessorSidebar from "./Sidebar";
import ProfessorSvgGradients from "./SvgGradients";
import { professorTokens } from "./tokens";

/**
 * Professor v2 App Shell.
 *
 * `/professor/*` 영역 wrapper. CSS 변수 토큰 주입 + topbar + (선택) sidebar.
 *
 * variant:
 * - "default" — 좌측 sidebar (220px) + 메인. dashboard, inbox, analytics,
 *   learners, lecture, subscription 등 일반 작업 페이지.
 * - "focused" — sidebar 없음. studio 마법사처럼 단일 작업에 몰입하는 화면.
 *
 * 스크롤 정책:
 * - shell 자체는 100vh, overflow:hidden — topbar 항상 고정.
 * - main 영역만 자체 overflow-y:auto. studio wizard 는 main 안에서 3단 그리드를
 *   다시 짜고 각 column 이 독립 스크롤 (prototype §5.3.2).
 */
export interface ProfessorAppShellProps {
  children: ReactNode;
  /** 좌측 사이드바 표시 여부. studio 영역은 false. 기본 true. */
  variant?: "default" | "focused";
  /** Topbar props 그대로 통과. */
  topbar?: ProfessorTopbarProps;
  /**
   * main 영역의 overflow 정책.
   * - "auto" (기본): 메인이 자체 스크롤. dashboard / list 페이지 표준.
   * - "hidden": 메인이 스크롤하지 않음 — studio wizard 처럼 내부에서 3단 그리드를
   *   다시 짜고 각 column 이 독립 스크롤할 때 사용.
   */
  mainScroll?: "auto" | "hidden";
}

const shellStyle: CSSProperties = {
  ...professorTokens,
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  fontSize: 14,
  lineHeight: 1.5,
  WebkitFontSmoothing: "antialiased",
};

const stageStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  minHeight: 0,
  overflow: "hidden",
};

const mainBaseStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  background: "var(--bg)",
};

export default function ProfessorAppShell({
  children,
  variant = "default",
  topbar,
  mainScroll = "auto",
}: ProfessorAppShellProps) {
  const mainStyle: CSSProperties =
    mainScroll === "hidden"
      ? { ...mainBaseStyle, overflow: "hidden" }
      : { ...mainBaseStyle, overflowY: "auto" };

  return (
    // data-pro-* 마커: 인쇄 시 globals.css @media print 가 셸 크롬(topbar/sidebar)을
    // 숨기고 100vh/overflow:hidden 을 풀어 본문 전체가 출력되게 한다(분석 PDF, 스펙 11 §A).
    <div style={shellStyle} data-pro-shell>
      <ProfessorSvgGradients />
      <ProfessorTopbar {...topbar} />
      <div style={stageStyle} data-pro-stage>
        {variant === "default" && <ProfessorSidebar />}
        <main style={mainStyle} data-pro-main>
          {children}
        </main>
      </div>
    </div>
  );
}
