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
 * A single Before/After case-study card. Driven by the i18n patch dict so
 * adding a discipline only means adding an entry to marketing.{ko,en}.json.
 *
 * The patch keys read are:
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
      className={`group rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8 transition hover:border-amber-400/40 hover:bg-white/[0.05] ${
        isAnchor ? "lg:col-span-2" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wider text-amber-400 uppercase">
            {t(`${keyPrefix}.field`)}
          </p>
          <h3
            className={`mt-2 font-bold ${
              isAnchor ? "text-xl sm:text-2xl" : "text-lg"
            }`}
          >
            {t(`${keyPrefix}.professor`)}
          </h3>
          <p className="text-sm text-white/50 mt-0.5">
            {t(`${keyPrefix}.school`)}
          </p>
        </div>

        {metric && (
          <div className="shrink-0 text-right">
            <p className="text-[10px] uppercase tracking-wider text-white/40">
              {metric.label}
            </p>
            <p className="text-xl font-bold tabular-nums">
              <span className="text-white/40">{metric.from}</span>
              <span className="mx-1.5 text-white/20">→</span>
              <span className="text-amber-400">{metric.to}</span>
            </p>
          </div>
        )}
      </div>

      <dl className="space-y-3 mt-5">
        <div>
          <dt className="text-xs font-semibold tracking-wider text-white/40 uppercase">
            {t("useCases.labels.before")}
          </dt>
          <dd className="mt-1 text-sm text-white/70 leading-relaxed">
            {t(`${keyPrefix}.before`)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wider text-amber-400 uppercase">
            {t("useCases.labels.after")}
          </dt>
          <dd className="mt-1 text-sm text-white leading-relaxed">
            {t(`${keyPrefix}.after`)}
          </dd>
        </div>
      </dl>

      {features.length > 0 && (
        <div className="mt-6 pt-5 border-t border-white/5">
          <p className="text-xs font-semibold tracking-wider text-white/40 uppercase mb-2">
            {t("useCases.labels.keyFeatures")}
          </p>
          <ul className="flex flex-wrap gap-2">
            {features.map((f) => (
              <li
                key={f}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80"
              >
                <span aria-hidden="true" className="text-amber-400">
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
          className="mt-5 text-xs font-medium text-amber-400 hover:text-amber-300"
        >
          {t("useCases.labels.viewDetail")} →
        </button>
      )}
    </article>
  );
}
