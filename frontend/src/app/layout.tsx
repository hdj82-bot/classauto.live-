import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { I18nProvider } from "@/contexts/I18nContext";
import { ToastProvider } from "@/components/ui/Toast";
// 우하단 글로벌 피드백 버튼은 제거됨(2026-06-27) — 스튜디오 ActionBar CTA 와 겹쳐
// 보였고, 베타 의견 수집 창구를 대문 nav 의 공개 "자유게시판"(/board)으로 일원화했다.
// 운영자 비공개 피드백 콘솔(/admin/feedback)과 백엔드(POST /api/v1/feedback)는 그대로
// 유지되므로, 특정 페이지에서 다시 띄우고 싶으면 GlobalFeedbackButton 을 직접 import 한다.
// 사용자 결정 2026-05-13 PM: 글로벌 OfflineBanner 제거 (모든 페이지에서 상단
// 빨간 띠 노출 차단). 컴포넌트 파일(`@/components/OfflineBanner`) 자체는 보존
// 하므로 특정 페이지에서 다시 켜고 싶으면 그쪽에서 직접 import 하면 된다.

/**
 * v2 (2026-05-12): Geist · Geist_Mono 제거. Pretendard·Paperlogy·Noto Serif KR
 * 는 globals.css 에서 CDN 으로 직접 로드한다 (typography.md §3). next/font 를
 * 거치지 않아도 font-display: swap 으로 FOUT 통제 가능 — Pretendard variable
 * 은 jsdelivr 가 빠르고, Paperlogy 는 GitHub repo 를 jsdelivr 가 캐시.
 */

export const metadata: Metadata = {
  title: "ClassAuto",
  description: "AI 기반 플립러닝 플랫폼 — 학자가 학자를 위해 만든 도구",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ClassAuto",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  // v2 라이트 베이지 베이스. iOS 상태바를 사이트 background 와 일치시킴.
  themeColor: "#FAFAF7",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-bg text-text">
        {/* 폰트 CDN 조기 연결 + Pretendard 스타일시트 프리로드. globals.css 의
            @import 는 CSS 파싱이 끝나야 발견되어 첫 렌더를 늦췄다. 같은 URL 을
            head 에서 미리 preload 하면 병렬·조기 fetch 되어 @import 가 캐시에서
            즉시 해소된다(폰트 로딩 경로 자체는 @import 가 그대로 보장). */}
        <link
          rel="preconnect"
          href="https://cdn.jsdelivr.net"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css"
        />
        <I18nProvider>
          <ToastProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
          </ToastProvider>
        </I18nProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
