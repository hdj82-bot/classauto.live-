"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import LightMarketingShell from "@/components/marketing/LightMarketingShell";
import { useLandingI18n } from "@/components/landing/useLandingI18n";
import FieldSelectCard from "@/components/demo/FieldSelectCard";
import GradientDefs from "@/components/demo/GradientDefs";
import HeroFlowStage from "@/components/demo/HeroFlowStage";
import TrustStrip from "@/components/demo/TrustStrip";
import {
  buildDemoHeroFlowLabels,
  buildDemoTrustStripLabels,
} from "@/components/demo/labels";
import type { DemoField } from "@/components/demo/demoTypes";
import "./demo/demo-v3.css";

/**
 * `/` 랜딩 v3.1 (2026-05-13).
 *
 * **풀-페이지 standalone 디자인 채택** — 사용자 결정 (2026-05-13):
 *   `/` 첫 대문 아래에 있던 Stats / Differentiators / Platform mesh / Steps /
 *   Adoption chart / Anchor trust strip / Final CTA 섹션 일괄 삭제. `/` 페이지는
 *   이제 standalone `/demo` 프로토타입의 hero + 분야 카드 + Trust strip 만 노출.
 *   추가 마케팅 콘텐츠는 헤더·푸터 링크(LightMarketingShell) 와 `/use-cases`,
 *   `/features`, `/pricing` 등 전용 페이지에서 처리.
 *
 * 디자인 근거:
 *   - docs/prototypes/04-demo-page.html.html — standalone 디자인 (2026-05-13)
 *   - docs/design-system/colors.md §1 — light beige + gold dual-surface
 *
 * 컴포넌트 재사용:
 *   - HeroFlowStage / TrustStrip / FieldSelectCard / GradientDefs 는 /demo 와
 *     공유. props-driven 으로 i18n 비의존 (labels.ts 빌더 헬퍼 경유).
 *
 * i18n:
 *   - `landingHub.heroV3.*` / `demoFlow.*` / `demoFieldShowcase.*` /
 *     `demoTrustStrip.*` 사용. 기존 `heroV2.*` / `differentiators.*` /
 *     `stepsV2.*` / `trustStrip.*` / `ctaV2.*` / `stats.*` / `platform.*` /
 *     `adoption.*` 키는 patch 에 보존 (롤백·다른 페이지 참조 안전).
 */
export default function LandingPage() {
  const { t: tHub } = useLandingI18n();
  const router = useRouter();

  // 분야 카드 선택 → /demo 로 deep-link. /demo 는 ?field=X 를 받아 자동 진입.
  const handleSelectField = useCallback(
    (f: DemoField) => {
      router.push(`/demo?field=${f}`);
    },
    [router],
  );

  // standalone /demo hero 와 동일 컴포넌트를 / 에서도 재사용 — 텍스트만 landingHub
  // i18n 에서 주입한다 (의미상 marketing 도메인 i18n 분리 유지).
  const heroFlowLabels = buildDemoHeroFlowLabels((key) =>
    tHub(`demoFlow.${key.replace(/^flowStage\./, "")}`),
  );
  const trustStripLabels = buildDemoTrustStripLabels((key) =>
    tHub(`demoTrustStrip.${key.replace(/^trustStrip\./, "")}`),
  );

  return (
    <LightMarketingShell>
      {/* Hero — standalone /demo 디자인과 동일한 라이트 베이지 2-col hero.
          docs/prototypes/04-demo-page.html.html (2026-05-13) 기준.

          GradientDefs 는 페이지 내 자식 SVG (FieldSelectCard 의 글로브/원자,
          TrustStrip 의 4종 아이콘) 가 url(#ca-grad-*) 로 참조하기 위해 한 번
          렌더한다. `.ca-demo-root` 는 데모 전용 CSS 변수 + reduced-motion 가드의
          스코프 — 다른 섹션엔 영향 없음. demo-v3.css 의 `.ca-*` 클래스 자체도
          네임스페이스라 충돌 없음. */}
      <div className="ca-demo-root">
        <GradientDefs />

        <section className="ca-hero" aria-labelledby="landing-hero-title">
          {/* 배경 영상 (z:0) → 오로라 메쉬 (z:0, 위) → 베이지 오버레이 (z:0, 위)
              → .ca-hero-inner (z:1) 순으로 쌓인다. muted+playsInline+autoPlay 는
              모바일(iOS Safari) 자동재생의 필수 3종. preload=metadata 로 LCP 보호.
              prefers-reduced-motion 시엔 demo-v3.css 에서 display:none 처리됨. */}
          <video
            className="ca-hero-video"
            src="/hero-bg.mp4"
            poster="/hero-bg-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
          />
          <div className="ca-aurora" aria-hidden="true" />
          <div className="ca-hero-overlay" aria-hidden="true" />
          <div className="ca-hero-inner">
            <div className="ca-hero-text">
              <span className="ca-hero-eyebrow">
                <span className="ca-dot" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                </span>
                {tHub("heroV3.observerBadge")}
              </span>

              <h1 id="landing-hero-title">
                {tHub("heroV3.headlineLead")}
                <br />
                {tHub("heroV3.headlineTail")}{" "}
                <span className="ca-accent">{tHub("heroV3.headlineAccent")}</span>
              </h1>

              <p className="ca-hero-sub">{tHub("heroV3.subtitle")}</p>
              <p className="ca-hero-sub-tag">{tHub("heroV3.subTag")}</p>

              <div className="ca-hero-meta">
                <span className="ca-meta-chip">{tHub("heroV3.metaTime")}</span>
                <span className="ca-meta-chip">{tHub("heroV3.metaQuestions")}</span>
                <span className="ca-meta-chip">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
                    <path d="M11 18.5h2" />
                  </svg>
                  {tHub("heroV3.metaMobile")}
                </span>
              </div>

              <div className="ca-hero-actions">
                <Link
                  href="/demo"
                  className="ca-btn-primary"
                  data-testid="landing-hero-start"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M7 4.5v15a1 1 0 0 0 1.55.83l11-7.5a1 1 0 0 0 0-1.66l-11-7.5A1 1 0 0 0 7 4.5z" />
                  </svg>
                  {tHub("heroV3.primaryCta")}
                </Link>
                <Link href="/features" className="ca-btn-secondary">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="url(#ca-grad-violet)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    width="16"
                    height="16"
                  >
                    <path d="M4 5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5z" />
                    <path d="M13 3v5h5" />
                  </svg>
                  {tHub("heroV3.secondaryCta")}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    width="14"
                    height="14"
                  >
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>

            <HeroFlowStage labels={heroFlowLabels} />
          </div>
        </section>

        {/* 분야 선택 — 디자인의 fields 그대로. 클릭 시 /demo?field=X 로 라우팅. */}
        <section
          id="landing-field-select"
          className="ca-fields"
          aria-labelledby="landing-field-heading"
        >
          <div className="ca-fields-inner">
            <div className="ca-fields-header">
              <div>
                <h2 className="ca-fields-title" id="landing-field-heading">
                  {tHub("demoFieldShowcase.title")}
                </h2>
                <p className="ca-fields-subtitle">
                  {tHub("demoFieldShowcase.subtitle")}
                </p>
              </div>
            </div>

            <div className="ca-field-grid">
              <FieldSelectCard field="social" onSelect={handleSelectField} />
              <FieldSelectCard field="natural" onSelect={handleSelectField} />
            </div>
          </div>
        </section>

        <TrustStrip labels={trustStripLabels} />
      </div>
    </LightMarketingShell>
  );
}
