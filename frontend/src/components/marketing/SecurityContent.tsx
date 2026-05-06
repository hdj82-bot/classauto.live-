"use client";

import MarketingShell from "./MarketingShell";
import SectionHeader from "./SectionHeader";
import InfoBlock from "./InfoBlock";
import { useMarketingI18n } from "./useMarketingI18n";

const SECTION_KEYS = [
  "encryption",
  "access",
  "incident",
  "audit",
  "korea",
  "api",
] as const;

interface InfraRow {
  name: string;
  vendor: string;
  region: string;
}

export default function SecurityContent() {
  const { t, tValue } = useMarketingI18n();
  const infraRows = tValue<InfraRow[]>("security.infrastructure.rows") ?? [];
  const infraItems = infraRows.map((r) => ({
    label: r.name,
    value: `${r.vendor} · ${r.region}`,
  }));

  return (
    <MarketingShell topCta={{ href: "/contact", label: t("common.ctaContactSales") }}>
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12">
        <SectionHeader
          eyebrow={t("security.hero.eyebrow")}
          title={t("security.hero.title")}
          subtitle={t("security.hero.subtitle")}
        />
      </section>

      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 pb-12"
        aria-label="security-sections"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {SECTION_KEYS.map((key) => (
            <InfoBlock
              key={key}
              title={t(`security.sections.${key}.title`)}
              items={tValue<string[]>(`security.sections.${key}.items`) ?? []}
            />
          ))}
        </div>
      </section>

      {/* Infrastructure table */}
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 pb-12"
        aria-label="security-infrastructure"
      >
        <InfoBlock
          tone="highlight"
          title={t("security.infrastructure.title")}
          items={infraItems}
        />
      </section>

      {/* Downloads */}
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 pb-12"
        aria-label="security-downloads"
      >
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-white">
            {t("security.downloads.title")}
          </h2>
          <ul className="mt-4 space-y-2.5">
            {(tValue<string[]>("security.downloads.items") ?? []).map((label) => (
              <li
                key={label}
                className="flex items-start gap-2.5 text-sm text-white/70"
              >
                <span aria-hidden="true" className="mt-1 text-amber-400">
                  ⤓
                </span>
                <span>{label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-white/40 leading-relaxed">
            {t("security.downloads.note")}
          </p>
        </div>
      </section>

      {/* Contact */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-white">
            {t("security.contact.title")}
          </h2>
          <p className="mt-3 text-sm text-white/70">
            {t("security.contact.general")}
          </p>
          <p className="mt-2 text-sm text-white/70">
            {t("security.contact.vuln")}
          </p>
          <p className="mt-1 text-sm">
            <a
              href={`mailto:${t("security.contact.vulnEmail")}`}
              className="text-amber-400 hover:underline"
            >
              {t("security.contact.vulnEmail")}
            </a>
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
