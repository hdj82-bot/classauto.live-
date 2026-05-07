import type { Metadata } from "next";
import FeaturesContent from "@/components/features/FeaturesContent";

// SEO 메타데이터는 Next 16 의 정적 라우트로 빌드 시점에 굳어지므로 i18n
// hydration 이전에도 검색·SNS 카드가 정상 노출됩니다. 동일 문구가
// `messages/_patches/featuresHub.{ko,en}.json` 의 `meta.*` 에도 있어
// 클라이언트 UI 와 동기화됩니다.
export const metadata: Metadata = {
  title: "기능 — ClassAuto",
  description:
    "ClassAuto의 9가지 핵심 기능을 한 페이지에서 살펴보세요. PPT 한 장에서 시작해 학생 분석까지 이어지는 전 과정.",
  openGraph: {
    title: "기능 — ClassAuto",
    description:
      "PPT → 영상 파이프라인, RAG 범위 제한 Q&A, 집중도 모니터링, 다국어 번역 등 9가지 핵심 기능.",
    url: "/features",
    type: "website",
  },
};

export default function FeaturesPage() {
  return <FeaturesContent />;
}
