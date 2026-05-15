"use client";

import LightMarketingShell from "@/components/marketing/LightMarketingShell";

/**
 * `/analytics-example` — 학습 분석 화면 미리보기 (2026-05-15).
 *
 * 디자인 프로토타입(`docs/prototypes/07-analytics.html.html`) 을 그대로 보여주는
 * 페이지. 프로토타입은 4.8MB 자기완결형 HTML(자체 CSS·JS 번들) 이라 JSX 로 옮기지
 * 않고 `frontend/public/prototypes/07-analytics.html` 에 정적 자원으로 두고 iframe
 * 으로 임베드. 마케팅 chrome(header + footer) 은 그대로 두고 iframe 이 main 영역을
 * 채운다.
 *
 * 정책 근거:
 *   - 사용자 결정 2026-05-15: 상단 메뉴에서 "데모" 제거 후 "기능" 옆에 "분석 예시"
 *     추가. 페이지 본문은 07-analytics.html 그대로 사용.
 */
export default function AnalyticsExamplePage() {
  return (
    <LightMarketingShell>
      {/* iframe 은 마케팅 헤더(64px) 아래 뷰포트를 전부 채운다. 프로토타입 자체에
          여백·헤더가 있으므로 wrapping padding 은 불필요. */}
      <iframe
        src="/prototypes/07-analytics.html"
        title="ClassAuto · 학습 분석 예시"
        className="block w-full border-0"
        style={{ height: "calc(100vh - 64px)" }}
      />
    </LightMarketingShell>
  );
}
