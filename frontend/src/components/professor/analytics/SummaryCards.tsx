"use client";

import type { ScoresData, EngagementData, QAData } from "./types";
import { useAnalyticsI18n } from "./useAnalyticsI18n";

/**
 * G (docs/planning/11 §G) — 요약 카드. 이미 집계된 데이터를 한눈 카드로 모은다
 * (신규 백엔드 없음): 빈번 오답 문항 수·무반응 이벤트·범위 외 질문 수. "빈번 질문어"
 * (키워드 추출)는 형태소 분석이 필요해 후속(9월) 항목으로 남김.
 */
export default function SummaryCards({
  scores,
  engagement,
  qa,
}: {
  scores: ScoresData | null;
  engagement: EngagementData | null;
  qa: QAData | null;
}) {
  const { t } = useAnalyticsI18n();

  // 빈번 오답: wrongAnswerTop 중 최다 오답 문항의 오답 횟수(없으면 0).
  const topWrong = scores?.wrongAnswerTop?.[0]?.wrongCount ?? 0;
  const wrongItems = scores?.wrongAnswerTop?.length ?? 0;
  const noResponse = engagement?.summary.totalNoResponseEvents ?? 0;
  const outOfScope = qa?.logs?.filter((l) => !l.in_scope).length ?? 0;

  const cards = [
    {
      key: "wrong",
      value: t("summary.wrongValue", { count: topWrong }),
      label: t("summary.wrongLabel"),
      sub: t("summary.wrongSub", { count: wrongItems }),
      tone: "#dc2626",
    },
    {
      key: "noResponse",
      value: String(noResponse),
      label: t("summary.noResponseLabel"),
      sub: t("summary.noResponseSub"),
      tone: "#f59e0b",
    },
    {
      key: "outOfScope",
      value: String(outOfScope),
      label: t("summary.outOfScopeLabel"),
      sub: t("summary.outOfScopeSub"),
      tone: "#6366f1",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {cards.map((c) => (
        <div key={c.key} className="rounded-xl border border-black/10 bg-white p-4">
          <div className="text-2xl font-bold tabular-nums" style={{ color: c.tone }}>
            {c.value}
          </div>
          <div className="text-sm font-medium text-gray-700 mt-1">{c.label}</div>
          <div className="text-xs text-gray-400 mt-0.5">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
