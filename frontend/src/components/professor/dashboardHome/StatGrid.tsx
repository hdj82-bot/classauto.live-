"use client";

import StatCard from "./StatCard";
import { useDashboardHubI18n } from "./useDashboardHubI18n";
import type { DashboardStats } from "./types";

/**
 * 6 stat 카드 컴포저 — `05-instructor-pages.md §4.2` 와 일대일.
 *
 * 1) 시청 완료율 — positive (높을수록 좋음)
 * 2) 평균 정답률 — positive
 * 3) 미응답 Q&A — attention (5건 이상이면 빨강)
 * 4) 활성 학습자 — positive
 * 5) 이번 달 영상 — progress (한도 / 사용)
 * 6) 누적 사용 비용 — cost (별도 CostMeterBar 가 그라데이션 진행 바 담당
 *    이지만, 카드 칸에서도 progress 바로 노출)
 */
interface StatGridProps {
  stats: DashboardStats;
  /** 미응답 Q&A 카드 클릭 시 인박스로 점프. */
  onJumpToInbox?: () => void;
}

export default function StatGrid({ stats, onJumpToInbox }: StatGridProps) {
  const { t } = useDashboardHubI18n();
  const pendingWarn = stats.pendingQaCount >= 5;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        label={t("stats.watchCompletion")}
        value={stats.watchCompletionPct}
        unit={t("stats.watchCompletionUnit")}
        decimals={1}
        kind="positive"
        trend={stats.watchTrend ?? null}
        delta={stats.watchDeltaPct ?? null}
        deltaUnit="%p"
      />
      <StatCard
        label={t("stats.scoreAccuracy")}
        value={stats.avgAccuracyPct}
        unit={t("stats.scoreAccuracyUnit")}
        decimals={1}
        kind="positive"
        trend={stats.accuracyTrend ?? null}
        delta={stats.accuracyDeltaPct ?? null}
        deltaUnit="%p"
      />
      <StatCard
        label={t("stats.pendingQa")}
        value={stats.pendingQaCount}
        unit={t("stats.pendingQaUnit")}
        kind="attention"
        warn={pendingWarn}
        trend={stats.pendingQaTrend ?? null}
        delta={stats.pendingQaDelta ?? null}
        onClick={onJumpToInbox}
      />
      <StatCard
        label={t("stats.activeLearners")}
        value={stats.activeLearners}
        unit={t("stats.activeLearnersUnit")}
        kind="positive"
        trend={stats.activeTrend ?? null}
        delta={stats.activeDeltaPct ?? null}
        deltaUnit="%"
      />
      <StatCard
        label={t("stats.monthlyVideos")}
        value={stats.monthlyVideoCount}
        unit={t("stats.monthlyVideosUnit")}
        kind="progress"
        progressLimit={stats.monthlyVideoLimit ?? null}
      />
      <StatCard
        label={t("stats.totalCost")}
        value={stats.totalCostUsd}
        unit={`${t("stats.totalCostUnit")}`}
        decimals={2}
        kind="cost"
        progressLimit={stats.monthlyCostLimitUsd ?? null}
        warn={
          !!stats.monthlyCostLimitUsd &&
          stats.totalCostUsd >= stats.monthlyCostLimitUsd * 0.8
        }
        trend={stats.costTrend ?? null}
      />
    </div>
  );
}
