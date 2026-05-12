"use client";

import LightMarketingShell from "./LightMarketingShell";
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

/**
 * /security v2 — 학과장·전산팀 검토용 보안 정책. 라이트 베이지 + 골드.
 *
 * 6개 영역 카드 + 인프라 테이블 + 다운로드 자료 + 보안 문의 contact.
 *
 * 정책 근거:
 *   - docs/planning/07-additional-pages.md §3
 *   - docs/design-system/colors.md §1, §8
 */
export default function SecurityContent() {
  const { t, tValue } = useMarketingI18n();
  const infraRows = tValue<InfraRow[]>("security.infrastructure.rows") ?? [];
  const infraItems = infraRows.map((r) => ({
    label: r.name,
    value: `${r.vendor} · ${r.region}`,
  }));

  return (
    <LightMarketingShell
      topCta={{ href: "/contact", label: t("common.ctaContactSales") }}
    >
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-12 text-center">
        <p className="text-[11px] sm:text-xs font-semibold tracking-[0.22em] text-[#B88308] uppercase mb-5">
          {t("security.hero.eyebrow")}
        </p>
        <h1
          className="text-[#0A0A0A] tracking-tight leading-[1.08]"
          style={{
            fontFamily:
              "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
            fontSize: "clamp(34px, 5.5vw, 60px)",
            fontWeight: 800,
            letterSpacing: "-0.035em",
          }}
        >
          {t("security.hero.title")}
        </h1>
        <p className="mt-5 text-base sm:text-lg text-[rgba(10,10,10,0.62)] max-w-2xl mx-auto leading-relaxed">
          {t("security.hero.subtitle")}
        </p>
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
        <div className="rounded-2xl border border-[rgba(10,10,10,0.08)] bg-white p-6 sm:p-8 shadow-[0_1px_2px_rgba(10,10,10,0.04)]">
          <h2 className="text-lg font-semibold text-[#0A0A0A] tracking-tight">
            {t("security.downloads.title")}
          </h2>
          <ul className="mt-4 space-y-2.5">
            {(tValue<string[]>("security.downloads.items") ?? []).map((label) => (
              <li
                key={label}
                className="flex items-start gap-2.5 text-sm text-[rgba(10,10,10,0.72)]"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 text-[#B88308] font-bold"
                >
                  ⤓
                </span>
                <span>{label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-[rgba(10,10,10,0.45)] leading-relaxed">
            {t("security.downloads.note")}
          </p>
        </div>
      </section>

      {/* Contact */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        <div className="rounded-2xl border border-[rgba(10,10,10,0.08)] bg-white p-6 sm:p-8 shadow-[0_1px_2px_rgba(10,10,10,0.04)]">
          <h2 className="text-lg font-semibold text-[#0A0A0A] tracking-tight">
            {t("security.contact.title")}
          </h2>
          <p className="mt-3 text-sm text-[rgba(10,10,10,0.72)]">
            {t("security.contact.general")}
          </p>
          <p className="mt-2 text-sm text-[rgba(10,10,10,0.72)]">
            {t("security.contact.vuln")}
          </p>
          <p className="mt-1 text-sm">
            <a
              href={`mailto:${t("security.contact.vulnEmail")}`}
              className="text-[#B88308] hover:text-[#E89E0B] hover:underline font-medium transition motion-reduce:transition-none"
            >
              {t("security.contact.vulnEmail")}
            </a>
          </p>
        </div>
      </section>
    </LightMarketingShell>
  );
}
