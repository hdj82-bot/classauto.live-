"use client";

import { useState } from "react";
import Link from "next/link";
import Modal from "@/components/ui/Modal";
import MarketingShell from "./MarketingShell";
import SectionHeader from "./SectionHeader";
import CaseStudyCard from "./CaseStudyCard";
import { useMarketingI18n } from "./useMarketingI18n";

interface CaseEntry {
  keyPrefix: string;
  variant?: "anchor" | "card";
}

const CARD_KEYS: CaseEntry[] = [
  { keyPrefix: "useCases.cards.social" },
  { keyPrefix: "useCases.cards.humanities" },
  { keyPrefix: "useCases.cards.engineering" },
  { keyPrefix: "useCases.cards.lab" },
  { keyPrefix: "useCases.cards.arts" },
];

export default function UseCasesContent() {
  const { t } = useMarketingI18n();
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <MarketingShell topCta={{ href: "/beta-apply", label: t("common.ctaApplyBeta") }}>
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12">
        <SectionHeader
          eyebrow={t("useCases.hero.eyebrow")}
          title={t("useCases.hero.title")}
          subtitle={t("useCases.hero.subtitle")}
          badge={t("useCases.hero.anchorBadge")}
        />
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
        <p className="mt-8 text-center text-sm text-white/40">
          {t("useCases.labels.comingMore")}
        </p>
      </section>

      {/* CTA section */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
        <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-400/10 to-transparent p-8 sm:p-10 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {t("useCases.ctaSection.title")}
          </h2>
          <p className="mt-3 text-white/70 max-w-xl mx-auto">
            {t("useCases.ctaSection.description")}
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/beta-apply"
              className="inline-flex justify-center rounded-xl bg-amber-400 text-black font-semibold px-6 py-3 text-sm hover:bg-amber-300 transition"
            >
              {t("useCases.ctaSection.applyButton")}
            </Link>
            <Link
              href="/demo"
              className="inline-flex justify-center rounded-xl border border-white/15 px-6 py-3 text-sm font-medium text-white/90 hover:bg-white/5 transition"
            >
              {t("useCases.ctaSection.demoButton")}
            </Link>
          </div>
        </div>
      </section>

      {/* Detail modal */}
      <Modal
        open={openKey !== null}
        onClose={() => setOpenKey(null)}
        title={openKey ? t(`${openKey}.field`) : undefined}
      >
        {openKey && (
          <div className="space-y-3 text-sm">
            <p className="font-semibold text-gray-900 dark:text-white">
              {t(`${openKey}.professor`)}
            </p>
            <p className="text-gray-500 dark:text-white/60">
              {t(`${openKey}.school`)}
            </p>

            <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/50 mb-1">
                {t("useCases.labels.before")}
              </p>
              <p className="text-gray-700 dark:text-white/80">
                {t(`${openKey}.before`)}
              </p>
            </div>

            <div className="rounded-xl bg-amber-50 dark:bg-amber-400/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1">
                {t("useCases.labels.after")}
              </p>
              <p className="text-gray-900 dark:text-white">
                {t(`${openKey}.after`)}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </MarketingShell>
  );
}
