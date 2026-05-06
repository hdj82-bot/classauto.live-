"use client";

import Link from "next/link";
import MarketingShell from "./MarketingShell";
import SectionHeader from "./SectionHeader";
import PrincipleCard from "./PrincipleCard";
import InfoBlock from "./InfoBlock";
import { useMarketingI18n } from "./useMarketingI18n";

const SECTION_KEYS = ["collected", "access", "deletion", "location"] as const;

// Single SVG path strings for the 4 principle icons. Kept inline (no asset
// dir) — these are the only icons this page uses.
const PRINCIPLE_ICONS = {
  ragLimit:
    "M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z", // shield-check-ish
  transparentCost:
    "M9 7h6m0 0v6m0-6L9 13M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z", // arrow-out-of-card
  antiCheat:
    "M12 9v3m0 3h.01M5 13l4-7 6 7-3 5H8l-3-5zm14 6h-2a4 4 0 11-8 0H5", // alert-triangle-ish
  studentData:
    "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z", // user-shield
} as const;

export default function TrustContent() {
  const { t, tValue } = useMarketingI18n();

  return (
    <MarketingShell topCta={{ href: "/contact", label: t("common.ctaContactSales") }}>
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12">
        <SectionHeader
          eyebrow={t("trust.hero.eyebrow")}
          title={t("trust.hero.title")}
          subtitle={t("trust.hero.subtitle")}
        />
      </section>

      {/* 4 promises */}
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 pb-16"
        aria-labelledby="trust-promises"
      >
        <h2
          id="trust-promises"
          className="text-xl font-semibold tracking-tight text-white/80 mb-6"
        >
          {t("trust.principles.title")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <PrincipleCard
            title={t("trust.principles.items.ragLimit.title")}
            description={t("trust.principles.items.ragLimit.description")}
            icon={PRINCIPLE_ICONS.ragLimit}
            accent="violet"
          />
          <PrincipleCard
            title={t("trust.principles.items.transparentCost.title")}
            description={t("trust.principles.items.transparentCost.description")}
            icon={PRINCIPLE_ICONS.transparentCost}
            accent="gold"
          />
          <PrincipleCard
            title={t("trust.principles.items.antiCheat.title")}
            description={t("trust.principles.items.antiCheat.description")}
            icon={PRINCIPLE_ICONS.antiCheat}
            accent="cyan"
          />
          <PrincipleCard
            title={t("trust.principles.items.studentData.title")}
            description={t("trust.principles.items.studentData.description")}
            icon={PRINCIPLE_ICONS.studentData}
            accent="pink"
          />
        </div>
      </section>

      {/* Detail blocks */}
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 pb-16"
        aria-label="trust-details"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {SECTION_KEYS.map((key) => {
            const items = tValue<string[]>(`trust.sections.${key}.items`) ?? [];
            return (
              <InfoBlock
                key={key}
                title={t(`trust.sections.${key}.title`)}
                items={items}
              />
            );
          })}
        </div>
      </section>

      {/* Student rights */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        <InfoBlock
          tone="highlight"
          title={t("trust.rights.title")}
          items={tValue<string[]>("trust.rights.items") ?? []}
        />
        <p className="mt-4 text-sm text-white/60">
          {t("trust.rights.contact")}
        </p>
        <p className="mt-6 text-xs text-white/40">
          {t("trust.footerLink")}{" "}
          <Link href="/privacy" className="text-amber-400 hover:underline">
            /privacy →
          </Link>
        </p>
      </section>
    </MarketingShell>
  );
}
