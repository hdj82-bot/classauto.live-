import type { Metadata } from "next";
import UseCasesContent from "@/components/marketing/UseCasesContent";

// SEO metadata is statically rendered by Next 16 since this page has no
// runtime params; pulling literal strings keeps it crawler-friendly even
// before client-side i18n hydration. The same titles also live in
// messages/_patches/marketing.{ko,en}.json so client UI stays in sync.
export const metadata: Metadata = {
  title: "활용 사례 — ClassAuto",
  description:
    "어학·인문·이공계·사회과학 등 분야별로 ClassAuto가 어떻게 쓰이는지 확인하세요.",
  openGraph: {
    title: "활용 사례 — ClassAuto",
    description:
      "어흥 교수님 사례를 앵커로, 사회과학·인문·공학·실험·예체능에서 ClassAuto를 어떻게 쓰는지 보여드립니다.",
    url: "/use-cases",
    type: "website",
  },
};

export default function UseCasesPage() {
  return <UseCasesContent />;
}
