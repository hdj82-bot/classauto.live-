import type { Metadata } from "next";
import ContactContent from "@/components/marketing/ContactContent";

export const metadata: Metadata = {
  title: "기관 견적 문의 — ClassAuto",
  description:
    "대학·기관용 견적 문의를 보내주시면 1 영업일 안에 영업 담당자가 답신드립니다.",
  openGraph: {
    title: "기관 견적 문의 — ClassAuto",
    description:
      "학과·단과대·전체 도입 모두 가능합니다. 검토 단계에 맞춰 안내드립니다.",
    url: "/contact",
    type: "website",
  },
};

export default function ContactPage() {
  return <ContactContent />;
}
