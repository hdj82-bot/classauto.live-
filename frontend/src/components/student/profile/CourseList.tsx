"use client";

import type { CourseProgress } from "./types";
import { useProfileHubI18n } from "./useProfileHubI18n";

interface Props {
  inProgress: CourseProgress[];
  completed: CourseProgress[];
}

/**
 * 수강 중 + 완료한 강의 두 그룹 노출.
 *
 * 진행률 바는 골드 (학습자 영역의 시그니처). 외부 공유 액션 없음 — 정책상
 * 인증서 PDF 만 별도 컴포넌트(CertificateList) 에서 다룬다.
 */
export default function CourseList({ inProgress, completed }: Props) {
  const { t } = useProfileHubI18n();

  return (
    <section
      data-testid="profile-courses"
      className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6 space-y-6"
    >
      <Group
        title={t("profileHub.courses.inProgressTitle")}
        empty={t("profileHub.courses.noneInProgress")}
        items={inProgress}
        testId="profile-courses-in-progress"
        progressTone="amber"
      />
      <Group
        title={t("profileHub.courses.completedTitle")}
        empty={t("profileHub.courses.noneCompleted")}
        items={completed}
        testId="profile-courses-completed"
        progressTone="emerald"
      />
    </section>
  );
}

interface GroupProps {
  title: string;
  empty: string;
  items: CourseProgress[];
  testId: string;
  progressTone: "amber" | "emerald";
}

function Group({ title, empty, items, testId, progressTone }: GroupProps) {
  const { t } = useProfileHubI18n();
  const tone =
    progressTone === "emerald" ? "bg-emerald-400" : "bg-amber-400";
  return (
    <div data-testid={testId}>
      <h3 className="text-sm font-semibold text-white/85 mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-white/40">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li
              key={c.courseId}
              className="rounded-xl bg-white/[0.03] border border-white/5 p-3 sm:p-4"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <p className="text-sm font-medium text-white truncate min-w-0">
                  {c.title}
                </p>
                <p className="text-[11px] text-white/50 tabular-nums shrink-0">
                  {t("profileHub.courses.courseProgress", { percent: c.percent })}
                </p>
              </div>
              <div
                className="mt-2 h-1 w-full bg-white/10 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={c.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={c.title}
              >
                <div
                  className={`h-full ${tone} transition-[width] duration-500 ease-out motion-reduce:transition-none`}
                  style={{ width: `${Math.max(0, Math.min(100, c.percent))}%` }}
                />
              </div>
              {c.lastWatchedAt && (
                <p className="text-[10px] text-white/40 mt-1.5">
                  {t("profileHub.courses.lastWatched", { date: c.lastWatchedAt })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
