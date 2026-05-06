import type { Metadata } from "next";
import TrustContent from "@/components/marketing/TrustContent";

export const metadata: Metadata = {
  title: "학생 데이터 보호 — ClassAuto",
  description:
    "ClassAuto가 학생 데이터를 어떻게 다루는지 한 페이지로 정리했습니다. 광고 미사용, 졸업 후 자동 삭제.",
  openGraph: {
    title: "학생 데이터 보호 — ClassAuto",
    description:
      "RAG 범위 제한 Q&A · 비용 투명성 · 부정행위 방지 · 학생 데이터 보호 — 4가지 약속.",
    url: "/trust",
    type: "website",
  },
};

export default function TrustPage() {
  return <TrustContent />;
}
