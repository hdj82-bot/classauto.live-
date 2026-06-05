"use client";

import { useInsightsI18n } from "./useInsightsI18n";
import { withHan } from "./han";
import type { BriefingPayload } from "./types";

/**
 * 학급 전체 vs 개별 신호(11 §H-4, 09 §3 학급/개별 구분). 좌: 학급 단위 신호,
 * 우: 위험 신호가 포착된 학습자별 제안. 개별 카드는 RQ2 의 "개별 액션" 후보.
 */
export default function ClassVsIndividual({
  data,
}: {
  data: BriefingPayload["class_vs_individual"];
}) {
  const { t } = useInsightsI18n();
  const classSignals = data?.class_signals ?? [];
  const individual = data?.individual_signals ?? [];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <h3 style={{ margin: "0 0 10px", fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>
          {t("classVsIndividual.classTitle")}
        </h3>
        {classSignals.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-subtle)" }}>{t("classVsIndividual.classEmpty")}</p>
        ) : (
          <ul className="space-y-2" style={{ margin: 0, paddingLeft: 18 }}>
            {classSignals.map((s, i) => (
              <li key={i} style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
                {withHan(s)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 style={{ margin: "0 0 10px", fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>
          {t("classVsIndividual.individualTitle")}
        </h3>
        {individual.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-subtle)" }}>{t("classVsIndividual.individualEmpty")}</p>
        ) : (
          <ul className="space-y-2.5" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {individual.map((s, i) => (
              <li
                key={i}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  background: "var(--bg-subtle)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                    {withHan(s.student)}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--warning)" }}>{s.signal}</span>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
                  <strong>{t("classVsIndividual.suggestion")}: </strong>
                  {withHan(s.suggestion)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
