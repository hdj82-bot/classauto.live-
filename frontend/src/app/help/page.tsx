import type { Metadata } from "next";
import HelpContent from "@/components/help/HelpContent";

// SEO 메타는 Next 16 기본 정적 렌더 흐름을 따른다 — 클라이언트 i18n 하이드레이션
// 이전부터 크롤러가 인식할 수 있도록 한국어 리터럴 게재. 동일 카피를
// `messages/_patches/helpHub.{ko,en}.json` 의 `meta.*` 에도 두어 클라이언트
// UI 와 동기화 (use-cases / trust 페이지와 같은 패턴).
export const metadata: Metadata = {
  title: "도움말 센터 — ClassAuto",
  description:
    "ClassAuto 사용 중 자주 묻는 질문과 가이드를 카테고리별로 모았습니다. 키워드로 검색해보세요.",
  openGraph: {
    title: "도움말 센터 — ClassAuto",
    description:
      "시작하기·영상 제작·학생 관리·결제·보안·문제 해결까지, 6개 카테고리에서 답을 찾아보세요.",
    url: "/help",
    type: "website",
  },
};

export default function HelpPage() {
  return <HelpContent />;
}
