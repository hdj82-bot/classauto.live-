import type { Metadata } from "next";

/**
 * /demo 라우트 전용 레이아웃.
 *
 * - 메타 태그 (한국어 기준 — i18n 패치 적용 후 영문으로 분기 가능)
 * - 자식 페이지를 그대로 렌더 (RootLayout 의 I18nProvider 안에서 동작)
 *
 * NOTE(W3): src/app/layout.tsx 를 수정하지 않기 위한 격리 레이아웃.
 *           실제 메타 태그 i18n 분기는 W4 단계에서 generateMetadata 로 확장.
 */
export const metadata: Metadata = {
  title: "데모 체험 — ClassAuto",
  description:
    "회원가입 없이 학생 입장으로 ClassAuto AI 튜터를 3분 안에 체험하세요.",
  openGraph: {
    title: "데모 체험 — ClassAuto",
    description:
      "PPT 한 장으로 만든 AI 강의를 학생 입장에서 체험. 베타 신청 전 3분 데모.",
    type: "website",
  },
};

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
