"use client";

import Link from "next/link";
import LightMarketingShell from "@/components/marketing/LightMarketingShell";
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
 * /features 페이지 v2 — 라이트 베이지(#FAFAF7) + 골드(#FFB627) 톤.
 *
 * 구성 (위 → 아래):
 *   1. Hero — Paperlogy 헤드라인, 2 CTA (베타 신청 + 데모)
 *   2. Pipeline morph — animations.md §3.1 PPT → 영상 모핑
 *   3. Modules quad — §3.2 4개 part 호버 분해
 *   4. Capabilities grid — README 9개 카드 (3×3)
 *   5. Sessions / progress — §3.3 progress shimmer + 100% ✓ drawing
 *   6. Analytics iso — §3.4 isometric grid + scroll parallax
 *   7. CTA — 베타 / 데모 / 기관 문의
 *
 * v1 (다크 + amber) → v2 (라이트 + 골드) 전환:
 *   - text-white/* → text-[#0A0A0A] / text-[rgba(10,10,10,N)]
 *   - text-amber-* → text-[#B88308]
 *   - bg-amber-400 채움 CTA → 인라인 #FFB627 (글로우 그림자 추가)
 *   - border-white/10 → border-[rgba(10,10,10,0.08)]
 *   - Paperlogy 는 헤로 1회, 다른 헤딩은 Pretendard bold + tracking-tight.
 *
 * 정책 근거:
 *   - docs/design-system/colors.md §1, §8 — 메인 마케팅 라이트 컬러
 *   - docs/design-system/typography.md §2, §5.1
 *   - docs/design-system/animations.md §3 — 4가지 features 동적 요소 유지
 *   - docs/planning/03-sitemap.md /features 명세
 */
export default function FeaturesContent() {
  const { t } = useFeaturesHubI18n();

  return (
    <LightMarketingShell
      topCta={{ href: "/beta-apply", label: t("hero.topCta") }}
    >
      <FeaturesStyles />
      <GradientDefs />

      {/* ── 1. HERO ─────────────────────────────────────────────── */}
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-12 text-center"
        data-testid="features-hero"
      >
        <p className="text-[11px] sm:text-xs font-semibold tracking-[0.22em] text-[#B88308] uppercase mb-5">
          {t("hero.eyebrow")}
        </p>
        <h1
          className="text-[#0A0A0A] tracking-tight leading-[1.08]"
          style={{
            fontFamily:
              "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
            fontSize: "clamp(36px, 6vw, 64px)",
            fontWeight: 800,
            letterSpacing: "-0.035em",
          }}
        >
          {t("hero.title")}
        </h1>
        <p className="mt-5 text-base sm:text-lg text-[rgba(10,10,10,0.62)] max-w-2xl mx-auto leading-relaxed">
          {t("hero.subtitle")}
        </p>
        <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/beta-apply"
            data-testid="features-hero-cta-primary"
            className="inline-flex justify-center rounded-xl px-7 py-3.5 text-sm sm:text-base font-semibold transition motion-reduce:transition-none"
            style={{
              backgroundColor: "#FFB627",
              color: "#1A1A1A",
              boxShadow: "0 8px 24px rgba(255,182,39,0.30)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "#FFC74D")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "#FFB627")
            }
          >
            {t("hero.primaryCta")}
          </Link>
          <Link
            href="/demo"
            data-testid="features-hero-cta-secondary"
            className="inline-flex justify-center rounded-xl border border-[rgba(10,10,10,0.16)] px-6 py-3.5 text-sm sm:text-base font-semibold text-[#0A0A0A] hover:border-[rgba(10,10,10,0.32)] hover:bg-black/5 transition motion-reduce:transition-none"
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
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#B88308] font-semibold mb-3">
              {t("morph.eyebrow")}
            </p>
            <h2
              id="features-morph-heading"
              className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight text-[#0A0A0A]"
            >
              {t("morph.title")}
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[rgba(10,10,10,0.62)] leading-relaxed">
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
                  className="flex items-start gap-3 text-[rgba(10,10,10,0.72)]"
                >
                  <span className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-[rgba(255,182,39,0.18)] text-[#B88308] text-[11px] font-bold flex items-center justify-center tabular-nums">
                    {i + 1}
                  </span>
                  <span>{t(k)}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-3xl border border-[rgba(10,10,10,0.08)] bg-white p-8 sm:p-10 flex items-center justify-center shadow-[0_1px_2px_rgba(10,10,10,0.04)]">
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
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#B88308] font-semibold mb-3">
              {t("modules.eyebrow")}
            </p>
            <h2
              id="features-modules-heading"
              className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight text-[#0A0A0A]"
            >
              {t("modules.title")}
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[rgba(10,10,10,0.62)] leading-relaxed">
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
        <div className="text-center max-w-3xl mx-auto">
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-[#B88308] mb-3">
            {t("cards.eyebrow")}
          </p>
          <h2
            id="features-cards-heading"
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#0A0A0A]"
          >
            {t("cards.title")}
          </h2>
          <p className="mt-4 text-base text-[rgba(10,10,10,0.62)] leading-relaxed">
            {t("cards.subtitle")}
          </p>
        </div>
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
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#B88308] font-semibold mb-3">
              {t("progress.eyebrow")}
            </p>
            <h2
              id="features-progress-heading"
              className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight text-[#0A0A0A]"
            >
              {t("progress.title")}
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[rgba(10,10,10,0.62)] leading-relaxed">
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
        <div
          className="rounded-3xl px-6 sm:px-12 py-12 sm:py-16 text-center"
          style={{
            background:
              "linear-gradient(135deg, #FFF5DA 0%, #FFE9A8 50%, #FFD46B 100%)",
            boxShadow: "0 16px 48px rgba(255,182,39,0.18)",
          }}
        >
          <h2
            className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1A1A1A]"
            style={{
              fontFamily:
                "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
              letterSpacing: "-0.02em",
            }}
          >
            {t("cta.title")}
          </h2>
          <p className="mt-3 text-[rgba(26,26,26,0.72)] max-w-xl mx-auto">
            {t("cta.subtitle")}
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/beta-apply"
              className="inline-flex justify-center rounded-xl bg-[#1A1A1A] text-white font-semibold px-6 py-3 text-sm hover:bg-black transition motion-reduce:transition-none shadow-lg shadow-black/15"
            >
              {t("cta.primary")}
            </Link>
            <Link
              href="/demo"
              className="inline-flex justify-center rounded-xl border border-[rgba(26,26,26,0.20)] px-6 py-3 text-sm font-semibold text-[#1A1A1A] hover:bg-white/40 transition motion-reduce:transition-none"
            >
              {t("cta.secondary")}
            </Link>
            <Link
              href="/contact"
              className="inline-flex justify-center rounded-xl border border-[rgba(26,26,26,0.20)] px-6 py-3 text-sm font-semibold text-[#1A1A1A] hover:bg-white/40 transition motion-reduce:transition-none"
            >
              {t("cta.tertiary")}
            </Link>
          </div>
        </div>
      </section>
    </LightMarketingShell>
  );
}
