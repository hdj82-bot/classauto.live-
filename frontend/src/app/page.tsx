"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import IconDefs from "@/components/landing/IconDefs";
import LightMarketingShell from "@/components/marketing/LightMarketingShell";
import { useLandingI18n } from "@/components/landing/useLandingI18n";
import { useMarketingI18n } from "@/components/marketing/useMarketingI18n";
import FieldSelectCard from "@/components/demo/FieldSelectCard";
import GradientDefs from "@/components/demo/GradientDefs";
import HeroFlowStage from "@/components/demo/HeroFlowStage";
import { buildDemoHeroFlowLabels } from "@/components/demo/labels";
import type { DemoField } from "@/components/demo/demoTypes";
import "./demo/demo-v3.css";

/**
 * `/` 랜딩 v3 — 첫 대문 축소판 (2026-05-13 후속, 사용자 결정 2026-05-13 PM).
 *
 * 변경 이력:
 *   - v3 초기 (#116): standalone /demo 프로토타입의 hero + 분야 카드 + Trust strip
 *     + Stats + 4가지 차별점 + Mesh + 3단계 + Adoption + Anchor + Final CTA 의
 *     "긴 마케팅 페이지" 형태였음.
 *   - v3.1 (본 커밋): 사용자 결정 — **두 분야 선택 카드 이후 전체 섹션 제거**.
 *     즉 TrustStrip / Stats / Differentiators / Mesh / Steps / Adoption /
 *     Anchor case / Final CTA 를 모두 삭제하고, 첫 대문(hero + fields)만 남긴
 *     "짧은 게이트웨이" 형태로 전환. 헤더·푸터는 LightMarketingShell 유지.
 *
 *     이유: 학생 화면 미리보기로 즉시 안내하는 게 메인 사이트의 1차 목적.
 *     긴 마케팅 콘텐츠는 /features · /use-cases · /pricing 등 별도 페이지로 분산.
 *
 * 디자인 언어:
 *   - 라이트 베이지(#FAFAF7) + 골드(--gold-on-light #B88308) — colors.md §1
 *   - Paperlogy 디스플레이 헤드라인 (typography.md §2)
 *   - HeroFlowStage / FieldSelectCard / GradientDefs 는 /demo 와 공유
 *
 * 정책 근거:
 *   - docs/prototypes/04-demo-page.html.html — standalone 디자인 (2026-05-13)
 *   - docs/planning/04-demo-page.md — /demo 스펙 (히어로 카피 정합)
 *   - docs/design-system/colors.md §1 — light beige + gold dual-surface
 */
export default function LandingPage() {
  const { t: tHub } = useLandingI18n();
  const { t: tCommon } = useMarketingI18n();
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

  return (
    <LightMarketingShell>
      <IconDefs />

      {/* Hero — standalone /demo 디자인과 동일한 라이트 베이지 2-col hero.
          docs/prototypes/04-demo-page.html.html (2026-05-13) 기준.

          GradientDefs 는 페이지 내 자식 SVG (FieldSelectCard 의 글로브/원자) 가
          url(#ca-grad-*) 로 참조하기 위해 한 번 렌더한다. `.ca-demo-root` 는 데모
          전용 CSS 변수 + reduced-motion 가드의 스코프 — demo-v3.css 의 `.ca-*`
          클래스 자체도 네임스페이스라 다른 페이지와 충돌 없음. */}
      <div className="ca-demo-root">
        <GradientDefs />

        <section className="ca-hero" aria-labelledby="landing-hero-title">
          <div className="ca-aurora" aria-hidden="true" />
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

              {/* 메인 사이트 전용 카피 — homeHero.*. /demo 와 컴포넌트는 공유하되
                  카피는 분리 (heroV3.* 는 demo 페이지가 그대로 사용).
                  사용자 결정 2026-05-13 PM: 골드 그라데이션을 첫 줄 ('학생과
                  상호작용하는') 에 적용. 둘째 줄 ('AI 교육영상') 은 다크 평문. */}
              <h1 id="landing-hero-title">
                <span className="ca-accent">{tHub("homeHero.headlineLead")}</span>
                <br />
                {tHub("homeHero.headlineAccent")}
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

        {/* 분야 선택 — 디자인의 fields 그대로. 클릭 시 /demo?field=X 로 라우팅.
            본 섹션이 메인 사이트의 마지막 콘텐츠 (사용자 결정 2026-05-13). */}
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
      </div>

      {/* (Footer 는 LightMarketingShell 이 처리) */}
      <span hidden>{tCommon("common.footerCopyright")}</span>
    </LightMarketingShell>
  );
}
