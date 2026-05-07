"use client";

import type { LifetimeStats } from "./types";
import { useProfileHubI18n } from "./useProfileHubI18n";

interface Props {
  stats: LifetimeStats;
}

/**
 * 누적 통계 5칸 — 학습 시간 / 시청 완료 / 정답률 / 질문 / 격려.
 *
 * 모든 숫자는 Pretendard tabular-nums (typography.md §1).
 */
export default function StatsGrid({ stats }: Props) {
  const { t } = useProfileHubI18n();
  const hours = Math.floor(stats.watchedMinutes / 60);
  const remMinutes = stats.watchedMinutes % 60;
  const watchTime =
    hours > 0
      ? t("profileHub.stats.watchTimeUnitHour", { count: hours })
      : t("profileHub.stats.watchTimeUnitMinute", { count: remMinutes });

  const cells: Array<{ label: string; value: string; testId: string }> = [
    {
      label: t("profileHub.stats.watchTimeLabel"),
      value: watchTime,
      testId: "stat-watch-time",
    },
    {
      label: t("profileHub.stats.videosWatchedLabel"),
      value: t("profileHub.stats.videosWatchedUnit", {
        count: stats.videosCompleted,
      }),
      testId: "stat-videos-completed",
    },
    {
      label: t("profileHub.stats.accuracyLabel"),
      value:
        stats.averageAccuracy === null
          ? t("profileHub.stats.noData")
          : t("profileHub.stats.accuracyUnit", { value: Math.round(stats.averageAccuracy) }),
      testId: "stat-accuracy",
    },
    {
      label: t("profileHub.stats.questionsLabel"),
      value: t("profileHub.stats.questionsUnit", { count: stats.questionsSent }),
      testId: "stat-questions",
    },
    {
      label: t("profileHub.stats.encouragementsLabel"),
      value: t("profileHub.stats.encouragementsUnit", {
        count: stats.encouragementsReceived,
      }),
      testId: "stat-encouragements",
    },
  ];

  return (
    <section
      data-testid="profile-stats"
      aria-labelledby="profile-stats-heading"
      className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6"
    >
      <h2
        id="profile-stats-heading"
        className="text-base font-semibold text-white mb-4"
      >
        {t("profileHub.stats.title")}
      </h2>
      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cells.map((c) => (
          <div
            key={c.testId}
            data-testid={c.testId}
            className="rounded-xl bg-white/[0.03] border border-white/5 p-4"
          >
            <dt className="text-[11px] text-white/45">{c.label}</dt>
            <dd
              className="mt-1 text-xl font-semibold text-white tabular-nums"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {c.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
