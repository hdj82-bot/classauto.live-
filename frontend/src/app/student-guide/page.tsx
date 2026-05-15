"use client";

import LightMarketingShell from "@/components/marketing/LightMarketingShell";
import StudentFlowPrototype from "@/components/studentGuide/studentFlowPrototype/StudentFlowPrototype";

/**
 * `/student-guide` — 학습자 가이드 (2026-05-15).
 *
 * 디자인 프로토타입(`docs/prototypes/06-student-flow.html`) 을 충실히 옮긴
 * 모바일 반응형 React 재구현(`StudentFlowPrototype`). 기존에는 자기완결형 HTML
 * 을 iframe 으로 임베드했으나, 모바일에서 가로 스크롤·이중 스크롤 문제가 있어
 * React 컴포넌트로 재작성. 마케팅 chrome(header + footer) 은 그대로 두고
 * 컴포넌트가 main 영역을 채운다.
 *
 * 4개 화면이 한 페이지 안에서 좌측 하단(모바일은 하단) 데모 네비게이션으로 전환:
 *   1) `/v/[강의ID]` 진입 (라이트)
 *   2) 학교 이메일 회원가입 3단계 (라이트)
 *   3) 1분 온보딩 4슬라이드 (라이트→다크 전환)
 *   4) 영상 시청 화면 + Q&A + 인터스티셜 퀴즈 (다크)
 *
 * 정책 근거:
 *   - 사용자 결정 2026-05-15: 상단 메뉴에 "학습자 가이드" 항목 추가 (위치: 기능과
 *     분석 예시 사이). 페이지 본문은 06-student-flow 프로토타입 그대로 사용.
 *   - docs/planning/06-student-pages.md — 학생 진입/온보딩/시청 흐름 사양
 *   - localStorage 미사용 (CLAUDE.md 금지) — 모든 상태는 React state.
 */
export default function StudentGuidePage() {
  return (
    <LightMarketingShell>
      <StudentFlowPrototype />
    </LightMarketingShell>
  );
}
