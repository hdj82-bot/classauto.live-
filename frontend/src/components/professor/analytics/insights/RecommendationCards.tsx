"use client";

import { ANALYTICS_PALETTE } from "../svg";
import { useInsightsI18n } from "./useInsightsI18n";
import { withHan } from "./han";
import type { Recommendation } from "./types";

const TYPE_KEYS: Record<string, string> = {
  review: "recommendations.type.review",
  reorder: "recommendations.type.reorder",
  supplement: "recommendations.type.supplement",
  activity: "recommendations.type.activity",
  contact: "recommendations.type.contact",
};

/**
 * 차주 대면수업 권장 카드(11 §H-2). 데이터 근거(rationale)·구체 활동·대상
 * 슬라이드/학습자 수를 함께 노출 → 교수자가 채택 여부를 판단(RQ2 개입 지점).
 */
export default function RecommendationCards({ items }: { items: Recommendation[] }) {
  const { t } = useInsightsI18n();
  if (items.length === 0) {
    return <p style={{ fontSize: 13, color: "var(--text-subtle)" }}>{t("recommendations.empty")}</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((r, i) => {
        const typeKey = TYPE_KEYS[r.type];
        const typeLabel = typeKey ? t(typeKey) : r.type;
        const slides = (r.target_slides ?? []).filter((s) => s !== null && s !== undefined);
        return (
          <article
            key={i}
            style={{
              border: "1px solid var(--line)",
              borderRadius: 14,
              padding: 16,
              background: "var(--bg-card)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <span
              style={{
                display: "inline-block",
                fontSize: 11,
                fontWeight: 700,
                color: ANALYTICS_PALETTE.gold,
                background: "var(--gold-soft)",
                padding: "2px 8px",
                borderRadius: 999,
              }}
            >
              {typeLabel}
            </span>
            <h3 style={{ margin: "10px 0 0", fontSize: 14.5, fontWeight: 700, color: "var(--text)" }}>
              {withHan(r.focus)}
            </h3>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
              {withHan(r.activity)}
            </p>
            {r.rationale && (
              <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--text-subtle)" }}>
                <strong style={{ color: "var(--text-muted)" }}>{t("recommendations.rationale")}: </strong>
                {withHan(r.rationale)}
              </p>
            )}
            {(slides.length > 0 || (r.target_students ?? []).length > 0) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {slides.length > 0 && (
                  <span
                    style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 999,
                      background: "var(--bg-subtle)", color: "var(--text-muted)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {t("recommendations.targetSlides")}: {slides.map((s) => s + 1).join(", ")}
                  </span>
                )}
                {(r.target_students ?? []).length > 0 && (
                  <span
                    style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 999,
                      background: "var(--bg-subtle)", color: "var(--text-muted)",
                    }}
                  >
                    {t("recommendations.targetStudents", { count: r.target_students.length })}
                  </span>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
