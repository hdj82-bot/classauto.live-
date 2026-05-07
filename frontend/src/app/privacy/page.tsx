import type { Metadata } from "next";
import PrivacyContent from "@/components/legal/PrivacyContent";

// SEO 메타데이터는 Next 16 의 정적 라우트 빌드 시점에 굳어지므로 i18n
// hydration 이전에도 검색·SNS 카드가 정상 노출됩니다. 동일 문구가
// `messages/_patches/legalHub.{ko,en}.json` 의 `privacy.meta.*` 에도 있어
// 클라이언트 UI 와 동기화됩니다.
export const metadata: Metadata = {
  title: "개인정보처리방침 — ClassAuto",
  description:
    "ClassAuto 개인정보처리방침. 한국 개인정보보호법 + GDPR 핵심 요구사항을 반영하여 수집·보유·위탁·삭제·권리 행사 절차를 15개 항목으로 정리했습니다.",
  openGraph: {
    title: "개인정보처리방침 — ClassAuto",
    description:
      "수집·보유·위탁·삭제·권리 행사 — 한국 개인정보보호법 + GDPR 핵심 + 학생 데이터 특별 보호 + 데모 데이터 정책 15개 항목.",
    url: "/privacy",
    type: "website",
  },
};

export default function PrivacyPage() {
  return <PrivacyContent />;
}
