import type { Metadata } from "next";
import LightMarketingShell from "@/components/marketing/LightMarketingShell";
import LectureCreationPrototypeLazy from "@/components/features/LectureCreationPrototypeLazy";

/**
 * `/features` — 강의 제작 프로토타입 React 재구현 (2026-05-15).
 *
 * 기존 iframe (`/prototypes/05-lecture-creation.html`, 3.7MB 번들) 임베드를
 * `docs/prototypes/05-lecture-creation.extracted.html` 디자인을 충실히 옮긴
 * 모바일 반응형 React 컴포넌트로 교체. iframe·정적 자원 파일은 그대로 보존
 * (이 페이지에서 더 이상 사용하지 않음).
 *
 * - 클라이언트 컴포넌트: `LectureCreationPrototype`
 *   (CSS 전부 `.lc-root` 네임스페이스 — demo-v3.css 의 .ca-* 패턴과 동일).
 * - 이 페이지는 server component 로 남겨 metadata(SEO·OG)를 보존한다.
 * - localStorage 미사용 (CLAUDE.md 준수).
 */
export const metadata: Metadata = {
  title: "기능 — ClassAuto",
  description:
    "ClassAuto의 강의 제작 흐름을 디자인 프로토타입으로 미리 보세요.",
  openGraph: {
    title: "기능 — ClassAuto",
    description:
      "PPT 한 장에서 시작해 학생 평가까지 이어지는 강의 제작 전 과정.",
    url: "/features",
    type: "website",
  },
};

export default function FeaturesPage() {
  return (
    <LightMarketingShell>
      <LectureCreationPrototypeLazy />
    </LightMarketingShell>
  );
}
