"use client";

import { useAnalyticsI18n } from "./useAnalyticsI18n";
import EmptyState from "./EmptyState";
import { ANALYTICS_PALETTE } from "./svg";
import type { QaKeywordsData, QaKeyword } from "./types";

/**
 * 빈번 질문어 (스펙 11 §G) — Q&A 질문에서 추출한 키워드 칩.
 *
 * 빈도가 높을수록 글자 크기·골드 농도를 키워 word-cloud 인상을 준다(차트 라이브러리
 * 무도입, svg.tsx 정책과 동일선상). 각 칩에 언어 배지(한/中/EN)와 횟수를 함께 표기 —
 * 크기 단독 의존을 피한다(접근성). 정렬은 빈도 내림차순.
 */
interface QaKeywordsProps {
  data: QaKeywordsData | null;
}

const LANG_LABEL: Record<QaKeyword["lang"], string> = {
  ko: "한",
  zh: "中",
  en: "EN",
};

export default function QaKeywords({ data }: QaKeywordsProps) {
  const { t } = useAnalyticsI18n();
  const keywords = data?.keywords ?? [];

  if (keywords.length === 0) {
    return (
      <EmptyState title={t("qaKeywords.empty")} description={t("qaKeywords.emptyDesc")} />
    );
  }

  const maxCount = Math.max(...keywords.map((k) => k.count));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {keywords.map((k) => {
          // 빈도 → 12~22px, 골드 농도 0.12~0.9 선형 매핑.
          const ratio = maxCount > 1 ? (k.count - 1) / (maxCount - 1) : 1;
          const fontSize = 12 + ratio * 10;
          const bgAlpha = 0.1 + ratio * 0.28;
          return (
            <span
              key={`${k.lang}:${k.term}`}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium"
              style={{
                fontSize,
                background: `rgba(255, 182, 39, ${bgAlpha})`,
                color: ANALYTICS_PALETTE.text,
                border: `1px solid rgba(184, 131, 8, ${0.2 + ratio * 0.3})`,
              }}
              title={t("qaKeywords.countLabel", { count: k.count })}
            >
              <span
                aria-hidden="true"
                className="rounded px-1 text-[9px] font-semibold"
                style={{ background: "rgba(10,10,10,0.06)", color: ANALYTICS_PALETTE.textMuted }}
              >
                {LANG_LABEL[k.lang]}
              </span>
              {k.term}
              <span className="tabular-nums text-[11px]" style={{ color: ANALYTICS_PALETTE.textMuted }}>
                {k.count}
              </span>
            </span>
          );
        })}
      </div>
      {data?.totalQuestions != null && (
        <p className="text-[11px] text-gray-400">
          {t("qaKeywords.totalLabel", { count: data.totalQuestions })}
        </p>
      )}
    </div>
  );
}
