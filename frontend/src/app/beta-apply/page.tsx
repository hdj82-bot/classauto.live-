import type { Metadata } from "next";
import BetaApplyContent from "@/components/marketing/BetaApplyContent";

export const metadata: Metadata = {
  title: "베타 신청 — ClassAuto",
  description:
    "ClassAuto 베타에 신청하세요. 학교 이메일로 신청하시면 1-2 영업일 안에 안내드립니다.",
  openGraph: {
    title: "베타 신청 — ClassAuto",
    description:
      "한국 대학 교수자 우선. 학교 이메일(.ac.kr 등)로 신청해주세요.",
    url: "/beta-apply",
    type: "website",
  },
};

export default function BetaApplyPage() {
  return <BetaApplyContent />;
}
