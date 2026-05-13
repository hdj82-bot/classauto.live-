"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import IconDefs from "@/components/landing/IconDefs";
import StatCounter from "@/components/landing/StatCounter";
import GradientFeatureIcon, {
  type FeatureGradient,
} from "@/components/landing/GradientFeatureIcon";
import MeshNetworkVisual from "@/components/landing/MeshNetworkVisual";
import MiniLineChart from "@/components/landing/MiniLineChart";
import FadeInSection from "@/components/landing/FadeInSection";
import LightMarketingShell from "@/components/marketing/LightMarketingShell";
import { useLandingI18n } from "@/components/landing/useLandingI18n";
import { useMarketingI18n } from "@/components/marketing/useMarketingI18n";
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
 * `/` 랜딩 v3 (2026-05-13).
 *
 * **첫 대문 (above-the-fold) 전면 교체**:
 *   - 기존 v2 한자 강조 hero ("강의 영상이 答 학생에게 한다") 폐기
 *   - standalone /demo 프로토타입(docs/prototypes/04-demo-page.html.html) 의
 *     hero + 분야 카드 + Trust strip 을 그대로 / 의 첫 대문으로 사용
 *   - 분야 카드 클릭 시 /demo?field=X 로 deep-link → /demo 가 자동으로
 *     ExperienceSection (영상 + Q&A) 진입
 *
 * 첫 대문 아래 섹션은 기존 그대로 유지 (Stats / Differentiators / Platform mesh /
 * Steps / Adoption chart / Anchor trust strip / Final CTA). 디자인 범위 밖.
 *
 * 디자인 언어 (그대로):
 *   - 라이트 베이지(#FAFAF7) + 골드(--gold-on-light #B88308) — colors.md §1
 *   - 헤더·푸터는 LightMarketingShell 로 통일
 *   - Paperlogy 디스플레이 헤드라인 (typography.md §2)
 *   - HanCharBadge / AuroraBackground 컴포넌트는 본 페이지에서 사용 안 함
 *     (다른 마케팅 페이지가 import 하므로 컴포넌트 파일은 보존)
 *
 * 컴포넌트 재사용:
 *   - HeroFlowStage / TrustStrip / FieldSelectCard / GradientDefs 는 /demo
 *     와 공유. props-driven 으로 i18n 비의존 (labels.ts 빌더 헬퍼 경유).
 *
 * i18n: 기존 `landingHub.heroV2.*` 키 보존(롤백 안전), 신규 `heroV3.*`,
 * `demoFlow.*`, `demoFieldShowcase.*`, `demoTrustStrip.*` 추가.
 *
 * 정책 근거:
 *   - docs/prototypes/04-demo-page.html.html — standalone 디자인 (2026-05-13)
 *   - docs/planning/04-demo-page.md — /demo 스펙 (히어로 카피 정합)
 *   - docs/design-system/colors.md §1 — light beige + gold dual-surface
 */
export default function LandingPage() {
  const { t: tHub, tNumber } = useLandingI18n();
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
  const trustStripLabels = buildDemoTrustStripLabels((key) =>
    tHub(`demoTrustStrip.${key.replace(/^trustStrip\./, "")}`),
  );

  // 6 differentiators · features 통합 카드 — 핵심 차별점 4개 + 핵심 기능 2개.
  // 그라데이션 4종을 cycling 해 시각 다양성 확보.
  const cards: Array<{
    titleKey: string;
    descKey: string;
    icon: string;
    gradient: FeatureGradient;
  }> = [
    {
      // RAG 범위 제한 — magnifying glass + check
      titleKey: "landingHub.differentiators.items.rag.title",
      descKey: "landingHub.differentiators.items.rag.description",
      icon: "M21 21l-4.35-4.35M10.5 17a6.5 6.5 0 110-13 6.5 6.5 0 010 13zM7.5 10.5l2 2 4-4",
      gradient: "violet",
    },
    {
      // 한도 투명성 — gauge / progress
      titleKey: "landingHub.differentiators.items.limit.title",
      descKey: "landingHub.differentiators.items.limit.description",
      icon: "M3 12a9 9 0 1118 0M12 3v9M5.6 18.4l4.2-4.2M12 21l5-9",
      gradient: "electric",
    },
    {
      // 부정행위 방지 — shield + check
      titleKey: "landingHub.differentiators.items.antiCheat.title",
      descKey: "landingHub.differentiators.items.antiCheat.description",
      icon: "M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z M9 12l2 2 4-4",
      gradient: "cyan",
    },
    {
      // 학생 데이터 보호 — lock + heart
      titleKey: "landingHub.differentiators.items.studentData.title",
      descKey: "landingHub.differentiators.items.studentData.description",
      icon: "M5 11V8a7 7 0 1114 0v3M5 11h14v10H5V11z M12 15v2",
      gradient: "pink",
    },
  ];

  // adoption chart placeholder — 8주차 추이 (실서비스 통계 연결은 후속 PR).
  const completionSeries = [42, 48, 55, 61, 68, 74, 79, 82];
  const participationSeries = [18, 22, 31, 38, 44, 51, 58, 63];

  return (
    <LightMarketingShell>
      <IconDefs />

      {/* Hero — standalone /demo 디자인과 동일한 라이트 베이지 2-col hero.
          docs/prototypes/04-demo-page.html.html (2026-05-13) 기준.
          한자 강조 hero("강의 영상이 答 학생에게 한다") 는 폐기.
          분야 카드 + Trust strip 도 standalone 그대로 첫 대문에 노출 — 분야
          카드 클릭 시 /demo?field=X 로 deep-link 해 ExperienceSection 자동 진입.

          GradientDefs 는 페이지 내 자식 SVG (FieldSelectCard 의 글로브/원자,
          TrustStrip 의 4종 아이콘) 가 url(#ca-grad-*) 로 참조하기 위해 한 번
          렌더한다. `.ca-demo-root` 는 데모 전용 CSS 변수 + reduced-motion 가드의
          스코프 — 다른 섹션엔 영향 없음. demo-v3.css 의 `.ca-*` 클래스 자체도
          네임스페이스라 충돌 없음. */}
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

      {/* Stats — 카운트업 3개 (animations.md §2.2). 흰 카드 위 tabular-nums. */}
      <FadeInSection
        as="section"
        className="border-y border-[rgba(10,10,10,0.06)] bg-white/60 backdrop-blur-sm"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 sm:grid-cols-3 gap-8">
          <StatCounter
            target={tNumber("stats.educatorsValue")}
            suffix={tHub("stats.educatorsSuffix")}
            label={tHub("stats.educatorsLabel")}
          />
          <StatCounter
            target={tNumber("stats.lecturesValue")}
            suffix={tHub("stats.lecturesSuffix")}
            label={tHub("stats.lecturesLabel")}
          />
          <StatCounter
            target={tNumber("stats.hoursValue")}
            suffix={tHub("stats.hoursSuffix")}
            label={tHub("stats.hoursLabel")}
          />
        </div>
      </FadeInSection>

      {/* 4가지 차별점 카드 — 그라데이션 stroke 아이콘 (animations.md §2.3) */}
      <FadeInSection as="section" className="py-20 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
            <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-[#B88308] mb-3">
              {tHub("differentiators.eyebrow")}
            </p>
            <h2
              className="text-3xl sm:text-4xl font-bold text-[#0A0A0A] tracking-tight"
              style={{
                fontFamily:
                  "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
                letterSpacing: "-0.03em",
              }}
            >
              {tHub("differentiators.title")}
            </h2>
            <p className="mt-4 text-[rgba(10,10,10,0.62)] leading-relaxed">
              {tHub("differentiators.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
            {cards.map((card, idx) => (
              <FadeInSection key={card.titleKey} delayMs={idx * 80}>
                <article className="group h-full rounded-2xl border border-[rgba(10,10,10,0.08)] bg-white p-7 hover:border-[rgba(184,131,8,0.30)] hover:shadow-[0_8px_32px_rgba(255,182,39,0.10)] transition-[box-shadow,border-color,transform] duration-300 motion-reduce:transition-none hover:-translate-y-0.5">
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center mb-5 transition-transform duration-300 motion-reduce:transition-none group-hover:scale-110 group-hover:rotate-[-6deg]"
                    style={{
                      backgroundColor: "#FAFAF7",
                      boxShadow:
                        "inset 0 0 0 1px rgba(10,10,10,0.04)",
                    }}
                    aria-hidden="true"
                  >
                    <GradientFeatureIcon
                      path={card.icon}
                      gradient={card.gradient}
                      size={30}
                    />
                  </div>
                  <h3 className="text-lg font-bold text-[#0A0A0A] mb-2 tracking-tight">
                    {tHub(card.titleKey.replace(/^landingHub\./, ""))}
                  </h3>
                  <p className="text-sm text-[rgba(10,10,10,0.62)] leading-relaxed">
                    {tHub(card.descKey.replace(/^landingHub\./, ""))}
                  </p>
                </article>
              </FadeInSection>
            ))}
          </div>
        </div>
      </FadeInSection>

      {/* Platform mesh — 라이트 베이스. 텍스트 컬러만 다크 톤으로 조정. */}
      <section
        className="py-20 sm:py-24 bg-[#F6F4EE] border-y border-[rgba(10,10,10,0.04)]"
        aria-labelledby="platform-heading"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <FadeInSection>
            <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-[#B88308] text-center mb-3">
              {tHub("platform.eyebrow")}
            </p>
            <h2
              id="platform-heading"
              className="text-3xl sm:text-4xl font-bold text-[#0A0A0A] text-center tracking-tight"
              style={{
                fontFamily:
                  "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
                letterSpacing: "-0.03em",
              }}
            >
              {tHub("platform.title")}
            </h2>
            <p className="mt-4 text-[rgba(10,10,10,0.62)] text-center max-w-2xl mx-auto leading-relaxed">
              {tHub("platform.subtitle")}
            </p>
          </FadeInSection>
          <FadeInSection delayMs={150}>
            <div className="mt-12">
              <MeshNetworkVisual />
            </div>
          </FadeInSection>
        </div>
      </section>

      {/* 3단계 — PPT → AI 스크립트 → 공유. 골드 번호 배지. */}
      <FadeInSection as="section" className="py-20 sm:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
            <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-[#B88308] mb-3">
              {tHub("stepsV2.eyebrow")}
            </p>
            <h2
              className="text-3xl sm:text-4xl font-bold text-[#0A0A0A] tracking-tight"
              style={{
                fontFamily:
                  "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
                letterSpacing: "-0.03em",
              }}
            >
              {tHub("stepsV2.title")}
            </h2>
            <p className="mt-4 text-[rgba(10,10,10,0.62)] leading-relaxed">
              {tHub("stepsV2.subtitle")}
            </p>
          </div>

          <ol className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 relative">
            {/* 데스크톱 점선 연결 라인 */}
            <div
              aria-hidden="true"
              className="hidden md:block absolute top-7 left-[16.66%] right-[16.66%] h-px"
              style={{
                background:
                  "repeating-linear-gradient(to right, rgba(184,131,8,0.32) 0, rgba(184,131,8,0.32) 4px, transparent 4px, transparent 10px)",
              }}
            />
            {(["step1", "step2", "step3"] as const).map((stepKey, idx) => (
              <FadeInSection key={stepKey} delayMs={idx * 120}>
                <li className="relative flex flex-col items-center text-center">
                  <span
                    className="relative w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold mb-5 tabular-nums z-10"
                    style={{
                      background:
                        "linear-gradient(135deg, #FFC74D 0%, #FFB627 100%)",
                      color: "#1A1A1A",
                      boxShadow:
                        "0 6px 20px rgba(255,182,39,0.30), inset 0 1px 0 rgba(255,255,255,0.5)",
                    }}
                    aria-hidden="true"
                  >
                    {tHub(`stepsV2.${stepKey}.label`)}
                  </span>
                  <h3 className="text-lg font-bold text-[#0A0A0A] mb-2 tracking-tight">
                    {tHub(`stepsV2.${stepKey}.title`)}
                  </h3>
                  <p className="text-sm text-[rgba(10,10,10,0.62)] leading-relaxed max-w-xs">
                    {tHub(`stepsV2.${stepKey}.description`)}
                  </p>
                </li>
              </FadeInSection>
            ))}
          </ol>
        </div>
      </FadeInSection>

      {/* Adoption chart — 라이트 베이스. animations.md §2.4 그대로. */}
      <section
        className="py-20 sm:py-24 bg-[#F6F4EE] border-y border-[rgba(10,10,10,0.04)]"
        aria-labelledby="adoption-heading"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <FadeInSection>
            <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-[#B88308] text-center mb-3">
              {tHub("adoption.eyebrow")}
            </p>
            <h2
              id="adoption-heading"
              className="text-3xl sm:text-4xl font-bold text-[#0A0A0A] text-center tracking-tight"
              style={{
                fontFamily:
                  "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
                letterSpacing: "-0.03em",
              }}
            >
              {tHub("adoption.title")}
            </h2>
            <p className="mt-4 text-[rgba(10,10,10,0.62)] text-center max-w-2xl mx-auto leading-relaxed">
              {tHub("adoption.subtitle")}
            </p>
          </FadeInSection>
          <FadeInSection delayMs={150}>
            <div className="mt-10">
              <MiniLineChart
                completion={completionSeries}
                participation={participationSeries}
              />
            </div>
          </FadeInSection>
        </div>
      </section>

      {/* Anchor 사례 trust strip — 어흥 교수님 케이스 */}
      <FadeInSection as="section" className="py-12 sm:py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-[rgba(10,10,10,0.40)] mb-3">
            {tHub("trustStrip.eyebrow")}
          </p>
          <p className="text-base sm:text-lg text-[#0A0A0A] font-medium tracking-tight">
            {tHub("trustStrip.anchor")}
          </p>
          <p className="mt-2">
            <Link
              href="/use-cases"
              className="text-sm text-[#B88308] hover:text-[#E89E0B] font-semibold transition motion-reduce:transition-none"
            >
              {tHub("trustStrip.more")}
            </Link>
          </p>
          <span
            className="inline-flex mt-6 items-center text-[11px] tracking-[0.16em] uppercase rounded-full border border-[rgba(184,131,8,0.30)] bg-[rgba(255,182,39,0.06)] px-3 py-1 text-[#B88308] font-semibold"
          >
            {tHub("trustStrip.betaBadge")}
          </span>
        </div>
      </FadeInSection>

      {/* Final CTA — 라이트 골드 큰 카드. 풀 다크 indigo 배경 제거. */}
      <FadeInSection as="section" className="pb-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div
            className="relative overflow-hidden rounded-3xl px-6 sm:px-12 py-14 sm:py-20 text-center"
            style={{
              background:
                "linear-gradient(135deg, #FFF5DA 0%, #FFE9A8 50%, #FFD46B 100%)",
              boxShadow:
                "0 24px 60px rgba(255,182,39,0.25), inset 0 1px 0 rgba(255,255,255,0.6)",
            }}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                background:
                  "radial-gradient(ellipse at 80% 20%, rgba(255,255,255,0.6), transparent 50%)",
              }}
            />
            <h2
              className="relative text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1A1A1A] tracking-tight"
              style={{
                fontFamily:
                  "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
                letterSpacing: "-0.03em",
              }}
            >
              {tHub("ctaV2.title")}
            </h2>
            <p className="relative mt-4 text-base sm:text-lg text-[rgba(26,26,26,0.72)] max-w-2xl mx-auto leading-relaxed">
              {tHub("ctaV2.subtitle")}
            </p>
            <div className="relative mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/beta-apply"
                className="inline-flex items-center justify-center rounded-xl px-7 py-3.5 text-sm sm:text-base font-semibold bg-[#1A1A1A] text-white hover:bg-black transition motion-reduce:transition-none shadow-lg shadow-black/15"
              >
                {tHub("ctaV2.primaryButton")}
                <span aria-hidden="true" className="ml-2">
                  →
                </span>
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-xl border border-[rgba(26,26,26,0.20)] px-6 py-3.5 text-sm sm:text-base font-semibold text-[#1A1A1A] hover:bg-white/40 transition motion-reduce:transition-none"
              >
                {tHub("ctaV2.secondaryButton")}
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center rounded-xl border border-[rgba(26,26,26,0.20)] px-6 py-3.5 text-sm sm:text-base font-semibold text-[#1A1A1A] hover:bg-white/40 transition motion-reduce:transition-none"
              >
                {tHub("ctaV2.tertiaryButton")}
              </Link>
            </div>
            <p className="relative mt-6 text-xs text-[rgba(26,26,26,0.55)]">
              {tHub("ctaV2.note")}
            </p>
          </div>
        </div>
      </FadeInSection>

      {/* (Footer 는 LightMarketingShell 이 처리) */}
      <span hidden>{tCommon("common.footerCopyright")}</span>
    </LightMarketingShell>
  );
}
