"use client";

import LightMarketingShell from "@/components/marketing/LightMarketingShell";

/**
 * `/student-guide` — 학습자 가이드 (2026-05-15).
 *
 * 디자인 프로토타입(`docs/prototypes/06-student-flow.html.html`) 을 그대로 보여주는
 * 페이지. 프로토타입은 4.4MB 자기완결형 HTML(자체 CSS·JS 번들) 이라 JSX 로 옮기지
 * 않고 `frontend/public/prototypes/06-student-flow.html` 에 정적 자원으로 두고
 * iframe 으로 임베드. 마케팅 chrome(header + footer) 은 그대로 두고 iframe 이
 * main 영역을 채운다. `/analytics-example`, `/features` 와 동일한 패턴.
 *
 * 4개 화면이 한 페이지 안에서 좌측 하단 데모 네비게이션으로 전환:
 *   1) `/v/[강의ID]` 진입 (라이트)
 *   2) 학교 이메일 회원가입 3단계 (라이트)
 *   3) 1분 온보딩 4슬라이드 (라이트→다크 전환)
 *   4) 영상 시청 화면 + Q&A + 인터스티셜 퀴즈 (다크)
 *
 * 정책 근거:
 *   - 사용자 결정 2026-05-15: 상단 메뉴에 "학습자 가이드" 항목 추가 (위치: 기능과
 *     분석 예시 사이). 페이지 본문은 06-student-flow.html 그대로 사용.
 *   - docs/planning/06-student-pages.md — 학생 진입/온보딩/시청 흐름 사양
 */
export default function StudentGuidePage() {
  return (
    <LightMarketingShell>
      {/* iframe 은 마케팅 헤더(56px = LightMarketingShell h-14) 아래 뷰포트를
          전부 채운다. 프로토타입 자체에 여백·헤더가 있어 wrapping padding 불필요.
          2026-05-15: 64px→56px (실제 헤더 높이) + 100vh→100dvh (모바일 주소창
          토글 시 하단 잘림·이중 스크롤 방지). */}
      <iframe
        src="/prototypes/06-student-flow.html"
        title="ClassAuto · 학습자 가이드"
        className="block w-full border-0"
        style={{ height: "calc(100dvh - 56px)" }}
      />
    </LightMarketingShell>
  );
}
