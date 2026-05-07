"use client";

import Link from "next/link";
import { useI18n } from "@/contexts/I18nContext";
import IconDefs from "@/components/landing/IconDefs";
import AuroraBackground from "@/components/landing/AuroraBackground";
import StatCounter from "@/components/landing/StatCounter";
import GradientFeatureIcon, {
  type FeatureGradient,
} from "@/components/landing/GradientFeatureIcon";
import MeshNetworkVisual from "@/components/landing/MeshNetworkVisual";
import MiniLineChart from "@/components/landing/MiniLineChart";
import FadeInSection from "@/components/landing/FadeInSection";
import { useLandingI18n } from "@/components/landing/useLandingI18n";

export default function LandingPage() {
  const { t } = useI18n();
  const { t: tHub, tNumber } = useLandingI18n();

  // 기존 6 feature 의 path / desc 키 — 각 카드에 4가지 그라데이션 cycling.
  const features: Array<{
    titleKey: string;
    descKey: string;
    icon: string;
    gradient: FeatureGradient;
  }> = [
    {
      titleKey: "feature1Title",
      descKey: "feature1Desc",
      icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
      gradient: "electric",
    },
    {
      titleKey: "feature2Title",
      descKey: "feature2Desc",
      icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
      gradient: "violet",
    },
    {
      titleKey: "feature3Title",
      descKey: "feature3Desc",
      icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
      gradient: "cyan",
    },
    {
      titleKey: "feature4Title",
      descKey: "feature4Desc",
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
      gradient: "pink",
    },
    {
      titleKey: "feature5Title",
      descKey: "feature5Desc",
      icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
      gradient: "violet",
    },
    {
      titleKey: "feature6Title",
      descKey: "feature6Desc",
      icon: "M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129",
      gradient: "cyan",
    },
  ];

  const steps = [
    { step: "1", titleKey: "step1Title", descKey: "step1Desc" },
    { step: "2", titleKey: "step2Title", descKey: "step2Desc" },
    { step: "3", titleKey: "step3Title", descKey: "step3Desc" },
  ];

  // adoption chart placeholder 데이터 — 8주차 추이.
  // 실제 백엔드 통계 연결은 후속 PR (BACKEND_ASKS.LANDING.md §1).
  const completionSeries = [42, 48, 55, 61, 68, 74, 79, 82];
  const participationSeries = [18, 22, 31, 38, 44, 51, 58, 63];

  return (
    <div className="min-h-screen bg-white">
      {/* SVG 그라데이션 defs — 페이지당 1회 마운트 */}
      <IconDefs />

      {/* Navigation */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold"
              aria-hidden="true"
            >
              IFL
            </span>
            <span className="text-sm font-semibold text-gray-900">
              IFL Platform
            </span>
          </div>
          <Link
            href="/auth/login"
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl px-4 py-2 transition"
          >
            {t("landing.getStarted")}
          </Link>
        </div>
      </header>

      {/* Hero — Aurora 배경 + 텍스트 그라데이션 */}
      <section className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-16 text-center">
        <AuroraBackground />
        <FadeInSection immediate as="div">
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight tracking-tight"
            style={{
              fontFamily: "'Paperlogy', 'Pretendard Variable', sans-serif",
            }}
          >
            {t("landing.title1")}
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, #6366F1 0%, #A78BFA 50%, #F59E0B 100%)",
                WebkitBackgroundClip: "text",
              }}
            >
              {t("landing.title2")}
            </span>
          </h1>
          <p className="mt-6 text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed">
            {t("landing.subtitle")}
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/auth/login"
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-8 py-3.5 text-sm font-semibold transition shadow-lg shadow-indigo-200"
            >
              {t("landing.cta")}
            </Link>
            <a
              href="#features"
              className="border border-gray-300 hover:border-gray-400 text-gray-700 rounded-xl px-8 py-3.5 text-sm font-semibold transition"
            >
              {t("landing.exploreFeatures")}
            </a>
          </div>
        </FadeInSection>
      </section>

      {/* Stats Strip — 카운트업 3개 (animations.md §2.2) */}
      <FadeInSection
        as="section"
        className="border-y border-gray-100 bg-gray-50/60"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 sm:grid-cols-3 gap-8">
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

      {/* Features — 그라데이션 stroke 아이콘 */}
      <FadeInSection
        as="section"
        className="bg-white py-20"
      >
        <div id="features" className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2
            className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-4"
            style={{
              fontFamily: "'Paperlogy', 'Pretendard Variable', sans-serif",
            }}
          >
            {t("landing.whyIFL")}
          </h2>
          <p className="text-gray-500 text-center mb-12 max-w-xl mx-auto">
            {t("landing.whyIFLDesc")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <article
                key={f.titleKey}
                className="group bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-md hover:border-gray-300 transition-[box-shadow,border-color] duration-300"
              >
                <div
                  className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center mb-4"
                  aria-hidden="true"
                >
                  <GradientFeatureIcon
                    path={f.icon}
                    gradient={f.gradient}
                    size={28}
                  />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  {t(`landing.${f.titleKey}`)}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {t(`landing.${f.descKey}`)}
                </p>
              </article>
            ))}
          </div>
        </div>
      </FadeInSection>

      {/* Platform Visual — Mesh-network (animations.md §2.5) */}
      <section
        className="bg-gray-50 py-20"
        aria-labelledby="platform-heading"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <FadeInSection>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 text-center mb-3">
              {tHub("platform.eyebrow")}
            </p>
            <h2
              id="platform-heading"
              className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-4"
              style={{
                fontFamily: "'Paperlogy', 'Pretendard Variable', sans-serif",
              }}
            >
              {tHub("platform.title")}
            </h2>
            <p className="text-gray-500 text-center mb-12 max-w-2xl mx-auto">
              {tHub("platform.subtitle")}
            </p>
          </FadeInSection>
          <FadeInSection delayMs={150}>
            <MeshNetworkVisual />
          </FadeInSection>
        </div>
      </section>

      {/* Steps */}
      <FadeInSection
        as="section"
        className="py-20"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <h2
            className="text-2xl sm:text-3xl font-bold text-gray-900 mb-12"
            style={{
              fontFamily: "'Paperlogy', 'Pretendard Variable', sans-serif",
            }}
          >
            {t("landing.stepsTitle")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((s) => (
              <div key={s.step} className="flex flex-col items-center">
                <span
                  className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center text-lg font-bold mb-4 tabular-nums"
                  aria-hidden="true"
                >
                  {s.step}
                </span>
                <h3 className="font-semibold text-gray-900 mb-2">
                  {t(`landing.${s.titleKey}`)}
                </h3>
                <p className="text-sm text-gray-500">
                  {t(`landing.${s.descKey}`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </FadeInSection>

      {/* Adoption Chart — 시청 완료율 + Q&A 참여 추이 (animations.md §2.4) */}
      <section
        className="bg-gray-50 py-20"
        aria-labelledby="adoption-heading"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <FadeInSection>
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-600 text-center mb-3">
              {tHub("adoption.eyebrow")}
            </p>
            <h2
              id="adoption-heading"
              className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-4"
              style={{
                fontFamily: "'Paperlogy', 'Pretendard Variable', sans-serif",
              }}
            >
              {tHub("adoption.title")}
            </h2>
            <p className="text-gray-500 text-center mb-10 max-w-2xl mx-auto">
              {tHub("adoption.subtitle")}
            </p>
          </FadeInSection>
          <FadeInSection delayMs={150}>
            <MiniLineChart
              completion={completionSeries}
              participation={participationSeries}
            />
          </FadeInSection>
        </div>
      </section>

      {/* CTA */}
      <FadeInSection
        as="section"
        className="bg-indigo-600 py-16"
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            {t("landing.ctaTitle")}
          </h2>
          <p className="text-indigo-200 mb-8">{t("landing.ctaDesc")}</p>
          <Link
            href="/auth/login"
            className="inline-block bg-white text-indigo-700 font-semibold rounded-xl px-8 py-3.5 text-sm hover:bg-indigo-50 transition shadow-lg"
          >
            {t("landing.cta")}
          </Link>
        </div>
      </FadeInSection>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs text-gray-400">{t("landing.copyright")}</p>
        </div>
      </footer>
    </div>
  );
}
