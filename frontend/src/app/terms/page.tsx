import type { Metadata } from "next";
import TermsContent from "@/components/legal/TermsContent";

// SEO 메타데이터는 Next 16 의 정적 라우트 빌드 시점에 굳어지므로 i18n
// hydration 이전에도 검색·SNS 카드가 정상 노출됩니다. 동일 문구가
// `messages/_patches/legalHub.{ko,en}.json` 의 `terms.meta.*` 에도 있어
// 클라이언트 UI 와 동기화됩니다.
export const metadata: Metadata = {
  title: "이용약관 — ClassAuto",
  description:
    "ClassAuto 이용약관. 서비스 제공 범위, 회원의 권리·의무, 결제·환불·해지, 학생 데이터 보호 등 14개 조항으로 구성되어 있습니다.",
  openGraph: {
    title: "이용약관 — ClassAuto",
    description:
      "결제·환불·해지·콘텐츠 권리·학생 데이터 보호 — 표준 SaaS 약관에 ClassAuto 의 가드레일 정책을 반영한 14개 조항.",
    url: "/terms",
    type: "website",
  },
};

export default function TermsPage() {
  return <TermsContent />;
}
