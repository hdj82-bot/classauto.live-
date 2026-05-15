"use client";

import Link from "next/link";
import AnalyticsPrototype from "@/components/analyticsExample/analyticsPrototype/AnalyticsPrototype";
import LightMarketingShell from "@/components/marketing/LightMarketingShell";
import { useMarketingI18n } from "@/components/marketing/useMarketingI18n";

/**
 * `/analytics-example` — 학습 분석 화면 미리보기 (2026-05-15).
 *
 * 디자인 프로토타입(`docs/prototypes/07-analytics.extracted.html`) 을 충실히
 * 재구현한 React 컴포넌트(`AnalyticsPrototype`) 를 보여주는 페이지. 마케팅
 * chrome(header + footer) 은 그대로 두고 컴포넌트가 main 영역을 채운다.
 *
 * 정책 근거:
 *   - 사용자 결정 2026-05-15 AM: 상단 메뉴에서 "데모" 제거 후 "기능" 옆에 "분석 예시"
 *     추가. 페이지 본문은 07-analytics 프로토타입 사용.
 *   - 사용자 보고 2026-05-15 PM: 좌측 사이드바 등이 클릭해도 이동이 안 됨 — 이는
 *     prototype 의 사이드바가 라우팅이 아니라 토스트만 띄우는 시각적 chrome 이기
 *     때문. "분석 리포트 한 화면 미리보기" 라는 사실을 명시하는 sticky 안내 배너를
 *     본문 위에 띄워 혼란을 차단한다.
 *   - 2026-05-15: 4.8MB 자기완결형 iframe → 반응형 React 재구현으로 교체.
 *     모바일 가로 오버플로우/이중 스크롤 제거, 마케팅 번들과 폰트·토큰 일원화.
 */
export default function AnalyticsExamplePage() {
  const { t } = useMarketingI18n();

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

      {/* 프로토타입 컴포넌트가 자체 min-height 로 흐른다 (고정 높이 제거). */}
      <AnalyticsPrototype />
    </LightMarketingShell>
  );
}
