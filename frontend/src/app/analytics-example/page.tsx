"use client";

import Link from "next/link";
import LightMarketingShell from "@/components/marketing/LightMarketingShell";
import { useMarketingI18n } from "@/components/marketing/useMarketingI18n";

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
 *   - 사용자 결정 2026-05-15 AM: 상단 메뉴에서 "데모" 제거 후 "기능" 옆에 "분석 예시"
 *     추가. 페이지 본문은 07-analytics.html 그대로 사용.
 *   - 사용자 보고 2026-05-15 PM: 좌측 사이드바("대시보드"·"강의 영상" 등) 가 클릭해도
 *     이동이 안 됨. 원인은 prototype 이 React SPA 번들로 사이드바 항목이 `<a href>`
 *     가 아니라 내부 state 토글 버튼이고, 설사 링크였더라도 iframe 안이라 부모
 *     라우터에 닿지 않음. 마케팅 방문자에게 해당 메뉴는 시각적 chrome 일 뿐이므로,
 *     "분석 리포트 한 화면 미리보기" 라는 사실을 명시하는 sticky 안내 배너를 iframe
 *     위에 띄워 혼란을 차단한다.
 */
export default function AnalyticsExamplePage() {
  const { t } = useMarketingI18n();

  // 마케팅 헤더 56px (LightMarketingShell h-14) + 안내 배너 56px (h-14) = 112px.
  const iframeHeight = "calc(100vh - 112px)";

  return (
    <LightMarketingShell>
      <div
        role="note"
        aria-live="polite"
        className="sticky top-14 z-20 backdrop-blur-md bg-[#FAFAF7]/85 border-b border-[rgba(10,10,10,0.08)]"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span
              aria-hidden="true"
              className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider"
              style={{
                background: "linear-gradient(135deg, #FFC74D 0%, #FFB627 100%)",
                color: "#1A1A1A",
                fontFamily:
                  "var(--font-body, 'Pretendard Variable'), 'Pretendard', sans-serif",
              }}
            >
              {t("analyticsExample.previewBadge")}
            </span>
            <p className="text-[12px] sm:text-[13px] leading-snug text-[rgba(10,10,10,0.7)] truncate sm:whitespace-normal">
              {t("analyticsExample.previewBody")}
            </p>
          </div>

          <Link
            href="/beta-apply"
            className="shrink-0 inline-flex items-center text-xs font-semibold rounded-lg px-3 py-1.5 transition motion-reduce:transition-none"
            style={{
              backgroundColor: "#FFB627",
              color: "#1A1A1A",
              boxShadow: "0 1px 2px rgba(184,131,8,0.18)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#FFC74D";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#FFB627";
            }}
          >
            {t("analyticsExample.previewCta")}
          </Link>
        </div>
      </div>

      {/* iframe 은 헤더 56 + 배너 56 = 112px 아래 뷰포트를 채운다. */}
      <iframe
        src="/prototypes/07-analytics.html"
        title="ClassAuto · 학습 분석 예시"
        className="block w-full border-0"
        style={{ height: iframeHeight }}
      />
    </LightMarketingShell>
  );
}
