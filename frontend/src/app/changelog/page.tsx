import type { Metadata } from "next";
import ChangelogContent from "@/components/changelog/ChangelogContent";

// 정적 메타. 본문은 클라이언트 컴포넌트에서 시드 배열을 시간 역순 렌더.
// RSS (`/changelog/rss.xml`) 는 후속 PR — 본 PR 은 ghost 버튼으로 자리만 잡음.
export const metadata: Metadata = {
  title: "업데이트 로그 — ClassAuto",
  description:
    "ClassAuto 의 신규 기능, 개선, 수정 이력을 시간 역순으로 확인하세요.",
  openGraph: {
    title: "업데이트 로그 — ClassAuto",
    description:
      "Keep a Changelog 표준에 따라 시간 역순으로 노출. Feature / Improvement / Fix / Breaking 카테고리 필터 지원.",
    url: "/changelog",
    type: "website",
  },
};

export default function ChangelogPage() {
  return <ChangelogContent />;
}
