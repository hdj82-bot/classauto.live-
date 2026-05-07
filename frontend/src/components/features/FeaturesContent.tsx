"use client";

import Link from "next/link";
import MarketingShell from "@/components/marketing/MarketingShell";
import SectionHeader from "@/components/marketing/SectionHeader";
import FeaturesStyles from "./featuresStyles";
import GradientDefs from "./GradientDefs";
import MorphIcon from "./MorphIcon";
import ModuleQuad from "./ModuleQuad";
import ProgressShimmer from "./ProgressShimmer";
import IsoGrid from "./IsoGrid";
import FeatureCard from "./FeatureCard";
import { FEATURE_CARDS } from "./featureCards";
import { useFeaturesHubI18n } from "./useFeaturesHubI18n";

/**
 * /features 페이지 본체.
 *
 * 구성 (위 → 아래):
 *   1. Hero — 제목 / 부제 / CTA 두 개 (베타 신청 + 데모)
 *   2. Pipeline morph — §3.1 PPT → 영상 모핑 + 4단계 텍스트 라벨
 *   3. Modules quad — §3.2 4개 part 호버 분해
 *   4. Capabilities grid — README 9개 카드 (3×3)
 *   5. Sessions / progress — §3.3 progress shimmer + 100% ✓ drawing
 *   6. Analytics iso — §3.4 isometric grid + scroll parallax
 *   7. CTA — 베타 / 데모 / 기관 문의
 *
 * 디자인:
 *   - MarketingShell 의 다크 베이스 + 골드 톤 그대로 사용 (colors.md §1, §3).
 *   - 의미적 컬러는 §5/§6 도달 시각화에만 (emerald = 완료 체크).
 *   - 폰트는 Pretendard (전역) + 큰 헤딩에 `font-extrabold tracking-tight`.
 *   - 모든 동적 요소는 `prefers-reduced-motion` 에서 정적 fallback
 *     (featuresStyles.tsx 참조).
 */
export default function FeaturesContent() {
  const { t } = useFeaturesHubI18n();

  return (
    <MarketingShell
      topCta={{ href: "/beta-apply", label: t("hero.topCta") }}
    >
      {/* page-scoped <style> + SVG <defs> — top-level 1회 */}
      <FeaturesStyles />
      <GradientDefs />

      {/* ── 1. HERO ────────────────────────────────────────────── */}
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12"
        data-testid="features-hero"
      >
        <SectionHeader
          eyebrow={t("hero.eyebrow")}
          title={t("hero.title")}
          subtitle={t("hero.subtitle")}
        />
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/beta-apply"
            data-testid="features-hero-cta-primary"
            className="inline-flex justify-center rounded-xl bg-amber-400 text-black font-semibold px-6 py-3 text-sm hover:bg-amber-300 transition motion-reduce:transition-none"
          >
            {t("hero.primaryCta")}
          </Link>
          <Link
            href="/demo"
            data-testid="features-hero-cta-secondary"
            className="inline-flex justify-center rounded-xl border border-white/15 px-6 py-3 text-sm font-medium text-white/90 hover:bg-white/5 transition motion-reduce:transition-none"
          >
            {t("hero.secondaryCta")}
          </Link>
        </div>
      </section>

      {/* ── 2. PIPELINE MORPH ─────────────────────────────────── */}
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 pb-16"
        aria-labelledby="features-morph-heading"
        data-testid="features-section-morph"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-400/80 font-semibold mb-3">
              {t("morph.eyebrow")}
            </p>
            <h2
              id="features-morph-heading"
              className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight"
            >
              {t("morph.title")}
            </h2>
            <p className="mt-3 text-sm sm:text-base text-white/60 leading-relaxed">
              {t("morph.subtitle")}
            </p>
            <ol className="mt-6 space-y-2 text-sm">
              {[
                "morph.stepExtract",
                "morph.stepDraft",
                "morph.stepTts",
                "morph.stepRender",
              ].map((k, i) => (
                <li
                  key={k}
                  className="flex items-start gap-3 text-white/75"
                >
                  <span className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-amber-400/15 text-amber-300 text-[11px] font-bold flex items-center justify-center tabular-nums">
                    {i + 1}
                  </span>
                  <span>{t(k)}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-8 sm:p-10 flex items-center justify-center">
            <MorphIcon />
          </div>
        </div>
      </section>

      {/* ── 3. MODULES QUAD ───────────────────────────────────── */}
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 pb-16"
        aria-labelledby="features-modules-heading"
        data-testid="features-section-modules"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div className="lg:order-2">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-400/80 font-semibold mb-3">
              {t("modules.eyebrow")}
            </p>
            <h2
              id="features-modules-heading"
              className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight"
            >
              {t("modules.title")}
            </h2>
            <p className="mt-3 text-sm sm:text-base text-white/60 leading-relaxed">
              {t("modules.subtitle")}
            </p>
          </div>
          <div className="lg:order-1">
            <ModuleQuad />
          </div>
        </div>
      </section>

      {/* ── 4. 9 CAPABILITY CARDS ─────────────────────────────── */}
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 pb-16"
        aria-labelledby="features-cards-heading"
        data-testid="features-section-cards"
      >
        <SectionHeader
          eyebrow={t("cards.eyebrow")}
          title={t("cards.title")}
          subtitle={t("cards.subtitle")}
          align="center"
        />
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURE_CARDS.map((card) => (
            <FeatureCard
              key={card.key}
              testId={`features-card-${card.key}`}
              accent={card.accent}
              icon={card.iconPath}
              title={t(`cards.items.${card.key}.title`)}
              description={t(`cards.items.${card.key}.desc`)}
            />
          ))}
        </div>
      </section>

      {/* ── 5. PROGRESS SHIMMER ──────────────────────────────── */}
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 pb-20"
        aria-labelledby="features-progress-heading"
        data-testid="features-section-progress"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-400/80 font-semibold mb-3">
              {t("progress.eyebrow")}
            </p>
            <h2
              id="features-progress-heading"
              className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight"
            >
              {t("progress.title")}
            </h2>
            <p className="mt-3 text-sm sm:text-base text-white/60 leading-relaxed">
              {t("progress.subtitle")}
            </p>
          </div>
          <div>
            <ProgressShimmer />
          </div>
        </div>
      </section>

      {/* ── 6. ISO GRID ──────────────────────────────────────── */}
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 pb-20"
        data-testid="features-section-iso"
      >
        <IsoGrid />
      </section>

      {/* ── 7. CTA ───────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
        <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-400/10 to-transparent p-8 sm:p-10 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {t("cta.title")}
          </h2>
          <p className="mt-3 text-white/70 max-w-xl mx-auto">
            {t("cta.subtitle")}
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/beta-apply"
              className="inline-flex justify-center rounded-xl bg-amber-400 text-black font-semibold px-6 py-3 text-sm hover:bg-amber-300 transition motion-reduce:transition-none"
            >
              {t("cta.primary")}
            </Link>
            <Link
              href="/demo"
              className="inline-flex justify-center rounded-xl border border-white/15 px-6 py-3 text-sm font-medium text-white/90 hover:bg-white/5 transition motion-reduce:transition-none"
            >
              {t("cta.secondary")}
            </Link>
            <Link
              href="/contact"
              className="inline-flex justify-center rounded-xl border border-white/15 px-6 py-3 text-sm font-medium text-white/70 hover:bg-white/5 transition motion-reduce:transition-none"
            >
              {t("cta.tertiary")}
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
