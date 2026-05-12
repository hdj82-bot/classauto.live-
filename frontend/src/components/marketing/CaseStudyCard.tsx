"use client";

import { useMarketingI18n } from "./useMarketingI18n";

export interface CaseStudyData {
  /** key prefix into the marketing patch dict (e.g. "useCases.cards.social"). */
  keyPrefix: string;
  /** Optional metric pair for anchor cards. */
  metric?: {
    label: string;
    from: string;
    to: string;
  };
  /** Visual treatment — anchor case is rendered larger. */
  variant?: "anchor" | "card";
  /** When provided, "View detail" opens a modal that scrolls to this id. */
  detailId?: string;
  onViewDetail?: () => void;
}

/**
 * Before/After 케이스 스터디 카드 v2 — 라이트 베이지 + 골드.
 *
 * 콘텐츠는 marketing.{ko,en}.json 의 patch 딕셔너리에서 keyPrefix 로 lookup.
 *   - {prefix}.field, .professor, .school, .before, .after
 *   - {prefix}.features (array)
 */
export default function CaseStudyCard({
  keyPrefix,
  metric,
  variant = "card",
  detailId,
  onViewDetail,
}: CaseStudyData) {
  const { t, tValue } = useMarketingI18n();
  const features = tValue<string[]>(`${keyPrefix}.features`) ?? [];

  const isAnchor = variant === "anchor";

  return (
    <article
      id={detailId}
      className={[
        "group rounded-2xl border bg-white p-6 sm:p-8 transition motion-reduce:transition-none",
        isAnchor
          ? "border-[rgba(184,131,8,0.35)] shadow-[0_8px_32px_rgba(255,182,39,0.15)] lg:col-span-2"
          : "border-[rgba(10,10,10,0.08)] shadow-[0_1px_2px_rgba(10,10,10,0.04)] hover:border-[rgba(184,131,8,0.30)] hover:shadow-[0_8px_28px_rgba(255,182,39,0.10)] hover:-translate-y-0.5",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wider text-[#B88308] uppercase">
            {t(`${keyPrefix}.field`)}
          </p>
          <h3
            className={[
              "mt-2 font-bold text-[#0A0A0A]",
              isAnchor ? "text-xl sm:text-2xl" : "text-lg",
            ].join(" ")}
            style={
              isAnchor
                ? {
                    fontFamily:
                      "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
                    letterSpacing: "-0.02em",
                  }
                : undefined
            }
          >
            {t(`${keyPrefix}.professor`)}
          </h3>
          <p className="text-sm text-[rgba(10,10,10,0.55)] mt-0.5">
            {t(`${keyPrefix}.school`)}
          </p>
        </div>

        {metric && (
          <div className="shrink-0 text-right">
            <p className="text-[10px] uppercase tracking-wider text-[rgba(10,10,10,0.40)]">
              {metric.label}
            </p>
            <p className="text-xl font-bold tabular-nums">
              <span className="text-[rgba(10,10,10,0.40)]">{metric.from}</span>
              <span className="mx-1.5 text-[rgba(10,10,10,0.25)]">→</span>
              <span className="text-[#B88308]">{metric.to}</span>
            </p>
          </div>
        )}
      </div>

      <dl className="space-y-3 mt-5">
        <div>
          <dt className="text-xs font-semibold tracking-wider text-[rgba(10,10,10,0.40)] uppercase">
            {t("useCases.labels.before")}
          </dt>
          <dd className="mt-1 text-sm text-[rgba(10,10,10,0.72)] leading-relaxed">
            {t(`${keyPrefix}.before`)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wider text-[#B88308] uppercase">
            {t("useCases.labels.after")}
          </dt>
          <dd className="mt-1 text-sm text-[#0A0A0A] leading-relaxed">
            {t(`${keyPrefix}.after`)}
          </dd>
        </div>
      </dl>

      {features.length > 0 && (
        <div className="mt-6 pt-5 border-t border-[rgba(10,10,10,0.06)]">
          <p className="text-xs font-semibold tracking-wider text-[rgba(10,10,10,0.40)] uppercase mb-2">
            {t("useCases.labels.keyFeatures")}
          </p>
          <ul className="flex flex-wrap gap-2">
            {features.map((f) => (
              <li
                key={f}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(10,10,10,0.08)] bg-[#FAFAF7] px-2.5 py-1 text-xs text-[rgba(10,10,10,0.78)]"
              >
                <span aria-hidden="true" className="text-[#B88308] font-bold">
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {onViewDetail && (
        <button
          type="button"
          onClick={onViewDetail}
          className="mt-5 text-xs font-medium text-[#B88308] hover:text-[#E89E0B] transition motion-reduce:transition-none"
        >
          {t("useCases.labels.viewDetail")} →
        </button>
      )}
    </article>
  );
}
