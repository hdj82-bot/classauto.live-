"use client";

import Link from "next/link";
import LightMarketingShell from "@/components/marketing/LightMarketingShell";
import LegalSection from "./LegalSection";
import TocSidebar from "./TocSidebar";
import ChangeLog from "./ChangeLog";
import { CHANGELOG_ANCHOR, sectionAnchorId } from "./legalSections";
import type {
  ChangeLogEntry,
  DocumentSpec,
  SectionData,
  TocItem,
} from "./types";
import { useLegalI18n } from "./useLegalI18n";

/**
 * /terms · /privacy 의 공통 chrome — v2 라이트 베이지 + 골드.
 *
 * 두 페이지가 거의 동일한 레이아웃 (Hero + 본문 8/12, TOC 4/12 + 마지막 변경
 * 이력) 을 공유하므로 한 컴포넌트로 통합. `spec` 만 받아서 i18n key 와
 * sections.<slug> 순서를 결정.
 *
 * 디자인 (v2):
 *   - LightMarketingShell 위 라이트 베이스 + 골드 포인트
 *   - 본문 폭은 가독성을 위해 약 700px (Tailwind `max-w-[68ch]`)
 *   - 변경 이력은 본문 마지막에 같은 폭으로 통합
 *   - prefers-reduced-motion 안전
 */
export default function LegalShell({ spec }: { spec: DocumentSpec }) {
  const { t, tValue } = useLegalI18n();
  const i18nKey = spec.i18nKey;

  const sections = spec.sectionSlugs
    .map((slug) => {
      const data = tValue<SectionData>(`${i18nKey}.sections.${slug}`);
      if (!data) return null;
      return {
        slug,
        anchorId: sectionAnchorId(spec.kind, slug),
        data,
      };
    })
    .filter((s): s is { slug: string; anchorId: string; data: SectionData } => s !== null);

  const tocItems: TocItem[] = sections.map((s) => ({
    id: s.anchorId,
    label: `${s.data.number} ${s.data.title}`,
  }));

  const changeEntries =
    tValue<ChangeLogEntry[]>(`${i18nKey}.changeLog`) ?? [];
  const changeLogId = CHANGELOG_ANCHOR[spec.kind];
  const trailingTocItem: TocItem = {
    id: changeLogId,
    label: t("common.changeHistoryTitle"),
  };

  const heroEyebrow = t(`${i18nKey}.hero.eyebrow`);
  const heroTitle = t(`${i18nKey}.hero.title`);
  const heroSubtitle = t(`${i18nKey}.hero.subtitle`);
  const lastUpdated = t(`${i18nKey}.hero.lastUpdated`);
  const effectiveDate = t(`${i18nKey}.hero.effectiveDate`);

  const otherKind = spec.kind === "terms" ? "privacy" : "terms";
  const otherHref = otherKind === "terms" ? "/terms" : "/privacy";
  const otherLabel =
    otherKind === "terms" ? t("common.viewTerms") : t("common.viewPrivacy");

  return (
    <LightMarketingShell>
      {/* Hero */}
      <section
        data-testid={`legal-${spec.kind}-hero`}
        className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-10"
      >
        <p className="text-[11px] font-semibold tracking-[0.18em] text-[#B88308] uppercase mb-3">
          {heroEyebrow}
        </p>
        <h1
          className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight text-[#0A0A0A]"
          style={{
            fontFamily:
              "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
            letterSpacing: "-0.035em",
          }}
        >
          {heroTitle}
        </h1>
        <p className="mt-4 text-base sm:text-lg text-[rgba(10,10,10,0.62)] leading-relaxed max-w-3xl">
          {heroSubtitle}
        </p>

        <dl
          className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs"
          data-testid={`legal-${spec.kind}-meta`}
        >
          <div>
            <dt className="text-[rgba(10,10,10,0.40)] uppercase tracking-[0.14em] mr-2 inline">
              {t("common.lastUpdatedLabel")}
            </dt>
            <dd
              className="inline tabular-nums text-[#0A0A0A] font-semibold"
              data-testid={`legal-${spec.kind}-last-updated`}
            >
              {lastUpdated}
            </dd>
          </div>
          <div>
            <dt className="text-[rgba(10,10,10,0.40)] uppercase tracking-[0.14em] mr-2 inline">
              {t("common.effectiveDateLabel")}
            </dt>
            <dd
              className="inline tabular-nums text-[#0A0A0A] font-semibold"
              data-testid={`legal-${spec.kind}-effective-date`}
            >
              {effectiveDate}
            </dd>
          </div>
        </dl>

        {/* 베타 / 시행 전 안내 */}
        <div
          className="mt-6 rounded-xl border border-[rgba(184,131,8,0.30)] bg-[rgba(255,182,39,0.06)] px-4 py-3 text-xs text-[#7A5500] max-w-3xl leading-relaxed"
          data-testid={`legal-${spec.kind}-notice`}
        >
          {t("common.noticeBanner")} · {t("common.placeholderNotice")}
        </div>
      </section>

      {/* Body grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-24 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        {/* 본문 */}
        <article
          className="lg:col-span-8 space-y-12"
          data-testid={`legal-${spec.kind}-body`}
        >
          {sections.map((s) => (
            <LegalSection key={s.slug} id={s.anchorId} data={s.data} />
          ))}
          <ChangeLog id={changeLogId} entries={changeEntries} />

          {/* 페이지 cross-link + back to home */}
          <div className="pt-6 border-t border-[rgba(10,10,10,0.08)] flex flex-wrap gap-3 items-center">
            <Link
              href={otherHref}
              data-testid={`legal-${spec.kind}-cross-link`}
              className="text-sm text-[#B88308] hover:text-[#E89E0B] font-semibold transition motion-reduce:transition-none"
            >
              {otherLabel}
            </Link>
            <span className="text-[rgba(10,10,10,0.25)]" aria-hidden="true">
              ·
            </span>
            <Link
              href="/trust"
              className="text-sm text-[rgba(10,10,10,0.55)] hover:text-[#0A0A0A] transition motion-reduce:transition-none"
            >
              /trust
            </Link>
            <span className="text-[rgba(10,10,10,0.25)]" aria-hidden="true">
              ·
            </span>
            <Link
              href="/security"
              className="text-sm text-[rgba(10,10,10,0.55)] hover:text-[#0A0A0A] transition motion-reduce:transition-none"
            >
              /security
            </Link>
            <span className="text-[rgba(10,10,10,0.25)] ml-auto" aria-hidden="true">
              ·
            </span>
            <Link
              href="/"
              className="text-sm text-[rgba(10,10,10,0.55)] hover:text-[#0A0A0A] transition motion-reduce:transition-none"
            >
              {t("common.backToHome")}
            </Link>
          </div>

          {/* 회사 정보 footer (placeholder) */}
          <div
            data-testid={`legal-${spec.kind}-company`}
            className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-[rgba(10,10,10,0.45)] leading-relaxed"
          >
            <p>{t("common.company.name")}</p>
            <p>{t("common.company.ceo")}</p>
            <p>{t("common.company.address")}</p>
            <p>{t("common.company.registration")}</p>
            <p>{t("common.company.supportEmail")}</p>
            <p>{t("common.company.privacyEmail")}</p>
            <p>{t("common.company.securityEmail")}</p>
            <p>{t("common.company.betaEmail")}</p>
          </div>
        </article>

        {/* TOC */}
        <aside
          className="lg:col-span-4 order-first lg:order-last"
          data-testid={`legal-${spec.kind}-toc`}
        >
          <TocSidebar items={tocItems} trailingItem={trailingTocItem} />
        </aside>
      </div>
    </LightMarketingShell>
  );
}
