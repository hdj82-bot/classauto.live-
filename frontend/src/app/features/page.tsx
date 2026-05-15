import type { Metadata } from "next";
import LightMarketingShell from "@/components/marketing/LightMarketingShell";

/**
 * `/features` — 강의 제작 프로토타입 전면 교체 (2026-05-15).
 *
 * 사용자 결정: 기존 FeaturesContent (9개 카드 + 동적 섹션) 을 폐기하고
 * `docs/prototypes/05-Lecture Creation.html` 디자인 프로토타입을 그대로 노출.
 * `/analytics-example` 와 동일한 iframe 임베드 패턴 (정적 자원 + 마케팅 chrome).
 *
 * - 정적 자원: `frontend/public/prototypes/05-lecture-creation.html`
 *   (원본은 `docs/prototypes/05-Lecture Creation.html`. 공백 제거 + 소문자화로
 *    URL 인코딩 회피.)
 * - FeaturesContent / featuresStyles 컴포넌트는 import 만 해제. 다른 곳에서
 *   참조되지 않는 orphan 이지만 추후 재사용 가능성을 고려해 삭제하지 않음.
 *
 * 메타데이터는 server component 로 유지하여 SEO·OG 카드를 보존한다.
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
      {/* iframe 은 마케팅 헤더(64px) 아래 뷰포트를 전부 채운다. 프로토타입 자체에
          여백·헤더가 있으므로 wrapping padding 은 불필요. */}
      <iframe
        src="/prototypes/05-lecture-creation.html"
        title="ClassAuto · 강의 제작"
        className="block w-full border-0"
        style={{ height: "calc(100vh - 64px)" }}
      />
    </LightMarketingShell>
  );
}
