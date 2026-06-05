"use client";

import { tabularStyle } from "@/components/professor/shell";
import { useInsightsI18n } from "./useInsightsI18n";
import type { ReportEvidence } from "./types";

/**
 * 보고서 상단 KPI 스트립 — 브리핑 권고의 근거가 되는 현황 지표(완주율·정답률·
 * 질문 수·딴짓 경고). 비용 지표는 노출하지 않는다(planning/05 §1.1).
 */
export default function EvidenceStrip({ evidence }: { evidence: ReportEvidence }) {
  const { t } = useInsightsI18n();
  const items = [
    { label: t("evidence.completionRate"), value: `${evidence.completion.completion_rate}%` },
    { label: t("evidence.accuracy"), value: `${evidence.quiz.overall_accuracy}%` },
    { label: t("evidence.qa"), value: String(evidence.qa.total) },
    { label: t("evidence.warnings"), value: String(evidence.attention.total_warnings) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.label}
          style={{
            background: "var(--bg-subtle)",
            border: "1px solid var(--line)",
            borderRadius: 14,
            padding: "14px 16px",
          }}
        >
          <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-subtle)" }}>{it.label}</p>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 22,
              fontWeight: 700,
              color: "var(--text)",
              ...tabularStyle,
            }}
          >
            {it.value}
          </p>
        </div>
      ))}
      <p className="col-span-2 sm:col-span-4" style={{ margin: 0, fontSize: 11, color: "var(--text-subtle)" }}>
        {t("evidence.students", { count: evidence.completion.total_students })}
      </p>
    </div>
  );
}
