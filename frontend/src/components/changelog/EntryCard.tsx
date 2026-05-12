"use client";

import Link from "next/link";
import { useChangelogHubI18n } from "./useChangelogHubI18n";
import type { ChangelogCategory, ChangelogEntry } from "./types";

const CATEGORY_GLYPH: Record<ChangelogCategory, string> = {
  feature: "▲",
  improvement: "✓",
  fix: "✗",
  breaking: "!",
};

const CATEGORY_COLOR: Record<ChangelogCategory, string> = {
  feature: "rgba(255, 182, 39, 0.95)",
  improvement: "rgba(34, 211, 238, 0.95)",
  fix: "rgba(16, 185, 129, 0.95)",
  breaking: "rgba(239, 68, 68, 0.95)",
};

/**
 * 단일 변경 항목 카드 — 타임라인 항목 하나.
 *
 * - 좌측: 날짜·버전 메타 (타블러 숫자, 타임라인 점)
 * - 우측: 카테고리 배지 + 표제 + bullets + PR 링크
 * - 외부 링크는 `target="_blank" rel="noopener noreferrer"` 안전 default.
 *
 * 색약자 친화: 배지 색 + 글리프 + 라벨 텍스트 3중 부호화.
 */
interface EntryCardProps {
  entry: ChangelogEntry;
}

export default function EntryCard({ entry }: EntryCardProps) {
  const { t } = useChangelogHubI18n();

  return (
    <article className="relative flex gap-5">
      {/* 타임라인 점 + 날짜 */}
      <div className="flex w-24 shrink-0 flex-col items-end pt-1">
        <span
          aria-hidden="true"
          className="absolute left-[5.5rem] top-3 h-2.5 w-2.5 rounded-full border border-[rgba(10,10,10,0.20)]"
          style={{ background: CATEGORY_COLOR[entry.category] }}
        />
        <p className="text-xs font-semibold tabular-nums text-[#0A0A0A]">
          {entry.date}
        </p>
        <p className="mt-0.5 text-[11px] tabular-nums text-[rgba(10,10,10,0.45)]">
          {t("labels.version")} {entry.version}
        </p>
      </div>

      {/* 본문 카드 */}
      <div className="flex-1 rounded-2xl border border-[rgba(10,10,10,0.08)] bg-white p-5 shadow-[0_1px_2px_rgba(10,10,10,0.04)]">
        <header className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
            style={{
              borderColor: CATEGORY_COLOR[entry.category],
              color: CATEGORY_COLOR[entry.category],
            }}
          >
            <span aria-hidden="true">{CATEGORY_GLYPH[entry.category]}</span>
            {t(`filters.${entry.category}`)}
          </span>
        </header>
        <h3 className="text-base font-semibold leading-snug text-[#0A0A0A]">
          {entry.title}
        </h3>
        {entry.bullets.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-[rgba(10,10,10,0.65)]">
            {entry.bullets.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true" className="mt-1 text-[rgba(10,10,10,0.30)]">
                  •
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
        {entry.prs && entry.prs.length > 0 && (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-[rgba(10,10,10,0.45)]">
            <span className="uppercase tracking-wider">
              {t("labels.relatedPr")}
            </span>
            {entry.prs.map((pr) => (
              <PrLink key={pr.href} href={pr.href} label={pr.label} />
            ))}
          </p>
        )}
      </div>
    </article>
  );
}

function PrLink({ href, label }: { href: string; label: string }) {
  const isExternal = /^https?:\/\//.test(href);
  const cls = "rounded-md border border-[rgba(10,10,10,0.10)] px-2 py-0.5 font-medium text-[rgba(10,10,10,0.72)] hover:border-[#B88308] hover:text-[#B88308] transition motion-reduce:transition-none";
  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
      >
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {label}
    </Link>
  );
}
