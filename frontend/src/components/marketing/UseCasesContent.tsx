"use client";

import { useState } from "react";
import Link from "next/link";
import Modal from "@/components/ui/Modal";
import LightMarketingShell from "./LightMarketingShell";
import CaseStudyCard from "./CaseStudyCard";
import { useMarketingI18n } from "./useMarketingI18n";

interface CaseEntry {
  keyPrefix: string;
}

const CARD_KEYS: CaseEntry[] = [
  { keyPrefix: "useCases.cards.social" },
  { keyPrefix: "useCases.cards.humanities" },
  { keyPrefix: "useCases.cards.engineering" },
  { keyPrefix: "useCases.cards.lab" },
  { keyPrefix: "useCases.cards.arts" },
];

/**
 * /use-cases v2 — 라이트 베이지 + 골드.
 *
 * 학과별 케이스 카드 6개 (앵커 1 + 5분야). 어흥 교수님 앵커 케이스가 상단
 * 큰 카드, 나머지 5개 학과 카드가 3-column grid.
 *
 * 정책 근거:
 *   - docs/planning/07-additional-pages.md §1
 *   - docs/design-system/colors.md §1, §8 — 메인 마케팅 라이트 컬러
 */
export default function UseCasesContent() {
  const { t } = useMarketingI18n();
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <LightMarketingShell>
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-12 text-center">
        <p className="text-[11px] sm:text-xs font-semibold tracking-[0.22em] text-[#B88308] uppercase mb-5">
          {t("useCases.hero.eyebrow")}
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
          {t("useCases.hero.title")}
        </h1>
        <p className="mt-5 text-base sm:text-lg text-[rgba(10,10,10,0.62)] max-w-2xl mx-auto leading-relaxed">
          {t("useCases.hero.subtitle")}
        </p>
        <span className="mt-7 inline-flex items-center rounded-full border border-[rgba(184,131,8,0.30)] bg-[rgba(255,182,39,0.06)] px-3 py-1 text-xs font-medium text-[#B88308]">
          {t("useCases.hero.anchorBadge")}
        </span>
      </section>

      {/* Anchor case (full-width) */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CaseStudyCard
            keyPrefix="useCases.anchor"
            variant="anchor"
            metric={{
              label: t("useCases.anchor.metricLabel"),
              from: t("useCases.anchor.metricFrom"),
              to: t("useCases.anchor.metricTo"),
            }}
            onViewDetail={() => setOpenKey("useCases.anchor")}
          />
        </div>
      </section>

      {/* Per-discipline cards */}
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 pb-16"
        aria-label="discipline-cases"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {CARD_KEYS.map(({ keyPrefix }) => (
            <CaseStudyCard
              key={keyPrefix}
              keyPrefix={keyPrefix}
              onViewDetail={() => setOpenKey(keyPrefix)}
            />
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-[rgba(10,10,10,0.45)]">
          {t("useCases.labels.comingMore")}
        </p>
      </section>

      {/* CTA section */}
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
              letterSpacing: "-0.025em",
            }}
          >
            {t("useCases.ctaSection.title")}
          </h2>
          <p className="mt-3 text-[rgba(26,26,26,0.72)] max-w-xl mx-auto">
            {t("useCases.ctaSection.description")}
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/beta-apply"
              className="inline-flex justify-center rounded-xl bg-[#1A1A1A] text-white font-semibold px-6 py-3 text-sm hover:bg-black transition motion-reduce:transition-none shadow-lg shadow-black/15"
            >
              {t("useCases.ctaSection.applyButton")}
            </Link>
            <Link
              href="/demo"
              className="inline-flex justify-center rounded-xl border border-[rgba(26,26,26,0.20)] px-6 py-3 text-sm font-semibold text-[#1A1A1A] hover:bg-white/40 transition motion-reduce:transition-none"
            >
              {t("useCases.ctaSection.demoButton")}
            </Link>
          </div>
        </div>
      </section>

      {/* Detail modal — Modal 컴포넌트는 ui/* 라 손대지 않음.
          모달 내부 텍스트는 라이트 모드 기준으로 색 명시. */}
      <Modal
        open={openKey !== null}
        onClose={() => setOpenKey(null)}
        title={openKey ? t(`${openKey}.field`) : undefined}
      >
        {openKey && (
          <div className="space-y-3 text-sm">
            <p className="font-semibold text-[#0A0A0A]">
              {t(`${openKey}.professor`)}
            </p>
            <p className="text-[rgba(10,10,10,0.60)]">
              {t(`${openKey}.school`)}
            </p>

            <div className="rounded-xl bg-[#FAFAF7] p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[rgba(10,10,10,0.50)] mb-1">
                {t("useCases.labels.before")}
              </p>
              <p className="text-[rgba(10,10,10,0.78)]">
                {t(`${openKey}.before`)}
              </p>
            </div>

            <div className="rounded-xl bg-[rgba(255,182,39,0.10)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#B88308] mb-1">
                {t("useCases.labels.after")}
              </p>
              <p className="text-[#0A0A0A]">
                {t(`${openKey}.after`)}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </LightMarketingShell>
  );
}
