"use client";

import { ANALYTICS_PALETTE } from "../svg";
import { useInsightsI18n } from "./useInsightsI18n";
import { withHan } from "./han";
import type { WeakConcept } from "./types";

/** severity(0~1) → 색. 높을수록 빨강, 중간은 골드. */
function severityColor(sev: number): string {
  if (sev >= 0.6) return ANALYTICS_PALETTE.warning;
  if (sev >= 0.3) return ANALYTICS_PALETTE.gold;
  return ANALYTICS_PALETTE.info;
}

function evidenceChips(c: WeakConcept & { kind?: string }, t: ReturnType<typeof useInsightsI18n>["t"]): string[] {
  const ev = (c.evidence ?? {}) as Record<string, number>;
  const chips: string[] = [];
  if (typeof ev.accuracy === "number") chips.push(t("weakConcepts.accuracy", { value: ev.accuracy }));
  if (typeof ev.responses === "number") chips.push(t("weakConcepts.responses", { count: ev.responses }));
  if (typeof ev.drops === "number") chips.push(t("weakConcepts.drops", { count: ev.drops }));
  if (typeof ev.replays === "number") chips.push(t("weakConcepts.replays", { count: ev.replays }));
  if (typeof ev.completionPct === "number") chips.push(t("weakConcepts.completion", { value: ev.completionPct }));
  if (typeof ev.rejection_rate === "number") chips.push(t("weakConcepts.rejectionRate", { value: ev.rejection_rate }));
  return chips;
}

/**
 * 상위 취약 개념 + 근거 데이터 링크(11 §H-2). 각 항목은 심각도 막대 + 근거 칩.
 * 백엔드 evidence.weak_concepts(원수치) 와 briefing.weak_concepts(why 문장)를
 * concept 키로 병합해 "AI 한 줄 + 원근거"를 함께 보여준다.
 */
export default function WeakConceptList({
  briefingConcepts,
  evidenceConcepts,
}: {
  briefingConcepts: WeakConcept[];
  evidenceConcepts: (WeakConcept & { kind?: string })[];
}) {
  const { t } = useInsightsI18n();
  // evidence 가 원수치의 단일 진실 — 이를 기준으로 돌고 briefing why 를 덧붙인다.
  const whyByConcept = new Map(briefingConcepts.map((c) => [c.concept, c.why]));
  const list = evidenceConcepts.length > 0 ? evidenceConcepts : briefingConcepts;

  if (list.length === 0) {
    return <p style={{ fontSize: 13, color: "var(--text-subtle)" }}>{t("weakConcepts.empty")}</p>;
  }

  return (
    <ul className="space-y-3" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {list.map((c, i) => {
        const sev = c.severity ?? 0;
        const why = whyByConcept.get(c.concept) ?? c.why;
        const chips = evidenceChips(c, t);
        return (
          <li
            key={`${c.concept}-${i}`}
            style={{
              border: "1px solid var(--line)",
              borderRadius: 14,
              padding: 16,
              background: "var(--bg-card)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                {withHan(c.concept)}
              </h3>
              <span
                aria-label={t("weakConcepts.severity")}
                style={{
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  color: severityColor(sev),
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {t("weakConcepts.severity")} {Math.round(sev * 100)}
              </span>
            </div>
            {/* 심각도 막대 */}
            <div
              role="presentation"
              style={{ marginTop: 8, height: 6, borderRadius: 999, background: "var(--bg-subtle)" }}
            >
              <div
                style={{
                  width: `${Math.min(100, Math.round(sev * 100))}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: severityColor(sev),
                  transition: "width 240ms var(--ease-out)",
                }}
              />
            </div>
            {why && (
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
                {withHan(why)}
              </p>
            )}
            {chips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <span
                    key={chip}
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "var(--gold-soft)",
                      color: "var(--gold)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
