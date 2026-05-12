"use client";

import Link from "next/link";
import IconDefs from "@/components/landing/IconDefs";
import AuroraBackground from "@/components/landing/AuroraBackground";
import StatCounter from "@/components/landing/StatCounter";
import GradientFeatureIcon, {
  type FeatureGradient,
} from "@/components/landing/GradientFeatureIcon";
import MeshNetworkVisual from "@/components/landing/MeshNetworkVisual";
import MiniLineChart from "@/components/landing/MiniLineChart";
import FadeInSection from "@/components/landing/FadeInSection";
import HanCharBadge from "@/components/landing/HanCharBadge";
import LightMarketingShell from "@/components/marketing/LightMarketingShell";
import { useLandingI18n } from "@/components/landing/useLandingI18n";
import { useMarketingI18n } from "@/components/marketing/useMarketingI18n";

/**
 * `/` 랜딩 v2.
 *
 * 디자인 언어 전면 교체:
 *   - IFL 로고·indigo CTA·다크 셸 제거 → ClassAuto + 라이트 베이지(#FAFAF7)
 *     + 골드(#FFB627) (colors.md §1 메인 마케팅 정책)
 *   - 헤더·푸터는 LightMarketingShell 로 통일 (Commit 1)
 *   - Paperlogy 는 히어로 헤드라인 한 번만 (typography.md §2)
 *   - 한자 강조 (HanCharBadge) 는 히어로에 한 번만 — 카지노 느낌 방지
 *
 * 동적 요소 (animations.md §2):
 *   - §2.1 히어로 오로라 (잔잔, 사용자 결정으로 히어로 한정)
 *   - §2.2 통계 카운트업 (StatCounter, IntersectionObserver)
 *   - §2.3 Feature 카드 그라데이션 stroke
 *   - §2.5 Mesh-network 시각화
 *   - §2.6 FadeInSection 스크롤 트리거
 *   - prefers-reduced-motion 안전 (각 컴포넌트가 자체 가드)
 *
 * i18n: 기존 `landing.*` 키는 그대로 두되 사용 안 함. 신규 `landingHub.heroV2.*`,
 * `landingHub.differentiators.*`, `landingHub.stepsV2.*`, `landingHub.trustStrip.*`,
 * `landingHub.ctaV2.*` 만 사용 (marketing.ko/en 의 patch 파일에 append).
 *
 * 정책 근거:
 *   - docs/planning/01-pricing-policy.md §1.3 — "비용" 노출 금지 → 한도 투명성
 *   - docs/planning/04-demo-page.md §1 — 메시지: "강의 영상이 학생에게 답한다"
 *   - docs/design-system/colors.md §8 — 랜딩 컬러 매트릭스
 *   - docs/design-system/typography.md §2, §4
 */
export default function LandingPage() {
  const { t: tHub, tNumber } = useLandingI18n();
  const { t: tCommon } = useMarketingI18n();

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

      {/* Hero — 라이트 베이지 + 잔잔한 오로라 + Paperlogy 헤드라인 + 한자 강조 1회 */}
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 opacity-50">
          {/* Aurora 는 히어로에만 (사용자 결정: "히어로만 유지 잔잔"). 라이트
              베이스 위에서 자연스러운 펄 톤. */}
          <AuroraBackground />
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-24 sm:pt-28 sm:pb-32 text-center">
          <FadeInSection immediate>
            <p
              className="text-[11px] sm:text-xs font-semibold tracking-[0.22em] text-[#B88308] uppercase mb-5"
              aria-label="ClassAuto"
            >
              {tHub("heroV2.eyebrow")}
            </p>
            <h1
              className="font-extrabold text-[#0A0A0A] leading-[1.05] tracking-tight"
              style={{
                fontFamily:
                  "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
                fontSize: "clamp(40px, 7vw, 84px)",
                fontWeight: 800,
                letterSpacing: "-0.04em",
              }}
            >
              <span className="block">{tHub("heroV2.titleLead")}</span>
              <span className="inline-flex items-baseline justify-center flex-wrap gap-y-2 mt-3 sm:mt-4">
                <HanCharBadge
                  character={tHub("heroV2.titleHan")}
                  reading={tHub("heroV2.titleHanReading")}
                />
                <span className="ml-3">{tHub("heroV2.titleTail")}</span>
              </span>
              <span
                className="block mt-6 text-[rgba(10,10,10,0.55)]"
                style={{
                  fontSize: "clamp(18px, 2.4vw, 32px)",
                  fontWeight: 500,
                  letterSpacing: "-0.02em",
                }}
              >
                {tHub("heroV2.titleSub")}
              </span>
            </h1>
            <p className="mt-8 sm:mt-10 text-base sm:text-lg text-[rgba(10,10,10,0.62)] max-w-2xl mx-auto leading-relaxed">
              {tHub("heroV2.subtitle")}
            </p>

            {/* 메타 칩 3개 — 핵심 차별점 압축 */}
            <ul
              className="mt-8 flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs sm:text-sm"
              aria-label="ClassAuto"
            >
              {[
                tHub("heroV2.metaChip1"),
                tHub("heroV2.metaChip2"),
                tHub("heroV2.metaChip3"),
              ].map((chip) => (
                <li
                  key={chip}
                  className="inline-flex items-center rounded-full border border-[rgba(10,10,10,0.12)] bg-white px-3 py-1.5 text-[rgba(10,10,10,0.72)] tracking-tight"
                >
                  {chip}
                </li>
              ))}
            </ul>

            <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center items-center">
              <div className="flex flex-col items-center">
                <Link
                  href="/beta-apply"
                  className="inline-flex items-center justify-center rounded-xl px-8 py-4 text-sm sm:text-base font-semibold transition motion-reduce:transition-none"
                  style={{
                    backgroundColor: "#FFB627",
                    color: "#1A1A1A",
                    boxShadow:
                      "0 8px 24px rgba(255,182,39,0.30), 0 1px 0 rgba(255,255,255,0.4) inset",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#FFC74D";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#FFB627";
                  }}
                >
                  {tHub("heroV2.primaryCta")}
                  <span aria-hidden="true" className="ml-2">
                    →
                  </span>
                </Link>
                <span className="mt-2 text-[11px] text-[rgba(10,10,10,0.45)]">
                  {tHub("heroV2.primaryCtaSub")}
                </span>
              </div>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center rounded-xl border border-[rgba(10,10,10,0.16)] px-7 py-3.5 text-sm sm:text-base font-semibold text-[#0A0A0A] hover:border-[rgba(10,10,10,0.32)] hover:bg-black/5 transition motion-reduce:transition-none"
              >
                {tHub("heroV2.secondaryCta")}
              </Link>
            </div>

            <p className="mt-10 text-[11px] tracking-[0.18em] uppercase text-[rgba(10,10,10,0.40)]">
              {tHub("heroV2.identityNote")}
            </p>
          </FadeInSection>
        </div>
      </section>

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
