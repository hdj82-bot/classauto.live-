import type { Metadata } from "next";
import SecurityContent from "@/components/marketing/SecurityContent";

export const metadata: Metadata = {
  title: "보안 정책 — ClassAuto",
  description:
    "ClassAuto의 인프라·접근 통제·인시던트 대응 방침. 학과장·전산팀 검토용 자료입니다.",
  openGraph: {
    title: "보안 정책 — ClassAuto",
    description:
      "Vercel · Railway · Supabase 위에서 동작하며 한국 개인정보보호법을 준수합니다. TLS 1.3, AES-256, RBAC.",
    url: "/security",
    type: "website",
  },
};

export default function SecurityPage() {
  return <SecurityContent />;
}
