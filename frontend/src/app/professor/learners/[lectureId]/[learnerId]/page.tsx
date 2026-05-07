"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import ProgressBar from "@/components/professor/learners/ProgressBar";
import RiskBadge from "@/components/professor/learners/RiskBadge";
import PrivacyNotice from "@/components/professor/learners/PrivacyNotice";
import { useLearnersI18n } from "@/components/professor/learners/useLearnersI18n";
import {
  computeRisk,
  daysSince,
  mergeLearnerRows,
} from "@/components/professor/learners/risk";
import type {
  AttendanceStudent,
  EngagementStudent,
} from "@/components/professor/learners/types";

interface AttendanceResponse {
  students?: AttendanceStudent[];
}
interface EngagementResponse {
  students?: EngagementStudent[];
}

/**
 * /professor/learners/{lectureId}/{learnerId} — 개별 학습자 상세.
 *
 * 현재 가용한 백엔드는 강의-단위 집계(`/dashboard/{id}/...`)만 제공하므로,
 * 강의의 attendance/engagement 응답에서 해당 학생만 슬라이스해 노출한다.
 * 학습자별 Q&A 로그(질문 본문)·평가 점수는 서버에서 user_id 필터를 노출해
 * 주어야 한다 — 그 전까지는 "준비 중" 안내. (BACKEND_ASKS.LEARNERS.md §2)
 */
export default function LearnerDetailPage() {
  const router = useRouter();
  const { lectureId, learnerId } = useParams<{
    lectureId: string;
    learnerId: string;
  }>();
  const { t } = useLearnersI18n();

  const [attendance, setAttendance] = useState<AttendanceResponse | null>(null);
  const [engagement, setEngagement] = useState<EngagementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(false);
        setLoading(true);
        const [a, e] = await Promise.all([
          api.get<AttendanceResponse>(`/api/v1/dashboard/${lectureId}/attendance`),
          api.get<EngagementResponse>(`/api/v1/dashboard/${lectureId}/engagement`),
        ]);
        if (cancelled) return;
        setAttendance(a.data);
        setEngagement(e.data);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lectureId]);

  const learner = useMemo(() => {
    const merged = mergeLearnerRows(attendance?.students, engagement?.students);
    return merged.find((r) => r.userId === learnerId) ?? null;
  }, [attendance, engagement, learnerId]);

  if (loading) return <LoadingSpinner fullScreen label={t("detailLoading")} />;

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"
        data-testid="learner-detail-error"
      >
        {t("loadError")}
      </div>
    );
  }

  if (!learner) {
    return (
      <div className="space-y-4" data-testid="learner-detail-not-found">
        <button
          type="button"
          onClick={() => router.push(`/professor/learners/${lectureId}`)}
          className="text-xs font-medium text-gray-500 hover:text-gray-900"
        >
          ← {t("detailBack")}
        </button>
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          {t("detailNotFound")}
        </div>
      </div>
    );
  }

  const risk = computeRisk({
    progressPct: learner.progressPct,
    watchRatio: learner.watchRatio,
    status: learner.status,
    startedAt: learner.startedAt,
  });
  const idle = daysSince(learner.startedAt);

  return (
    <div className="space-y-6" data-testid="learner-detail-page">
      <button
        type="button"
        onClick={() => router.push(`/professor/learners/${lectureId}`)}
        className="text-xs font-medium text-gray-500 hover:text-gray-900"
      >
        ← {t("detailBack")}
      </button>

      <header className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">
              {learner.name}
            </h1>
            <p className="text-sm text-gray-500 mt-1 tabular-nums">
              {learner.studentNumber ?? "—"}
            </p>
          </div>
          <RiskBadge level={risk} />
        </div>

        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
          <Stat label={t("detailProgressPct")} value={`${learner.progressPct.toFixed(0)}%`}>
            <ProgressBar
              value={learner.progressPct}
              tone={risk === "high" ? "high" : risk === "medium" ? "medium" : "low"}
              ariaLabel={t("detailProgressPct")}
            />
          </Stat>
          <Stat label={t("detailWatchRatio")} value={`${learner.watchRatio.toFixed(0)}%`}>
            <ProgressBar
              value={learner.watchRatio}
              tone={learner.watchRatio < 50 ? "medium" : "neutral"}
              ariaLabel={t("detailWatchRatio")}
            />
          </Stat>
          <Stat
            label={t("detailType")}
            value={
              learner.attendanceType === "live"
                ? t("detailTypeLive")
                : learner.attendanceType === "vod"
                  ? t("detailTypeVod")
                  : "—"
            }
          />
          <Stat
            label={t("detailStartedAt")}
            value={
              idle === null
                ? t("never")
                : idle === 0
                  ? t("today")
                  : t("daysAgo", { count: idle })
            }
          />
        </dl>
      </header>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">
          {t("detailWatchHistory")}
        </h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Stat
            label={t("detailWatchedSec")}
            value={t("secondsUnit", { count: learner.watchedSec })}
          />
          <Stat
            label={t("detailTotalSec")}
            value={t("secondsUnit", { count: learner.totalSec })}
          />
          <Stat label={t("detailQaCount")} value={learner.qaCount} />
          <Stat label={t("detailRespondedCount")} value={learner.respondedCount} />
        </dl>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          {t("detailQaHistory")}
        </h2>
        <p
          data-testid="learner-detail-qa-pending"
          className="text-xs text-gray-500 leading-relaxed"
        >
          {t("detailQaBackendPending")}
        </p>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          {t("detailAssessment")}
        </h2>
        <p
          data-testid="learner-detail-assessment-pending"
          className="text-xs text-gray-500 leading-relaxed"
        >
          {t("detailAssessmentBackendPending")}
        </p>
      </section>

      <PrivacyNotice />
    </div>
  );
}

function Stat({
  label,
  value,
  children,
}: {
  label: string;
  value: string | number;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-gray-500 mb-1">{label}</dt>
      <dd className="text-sm font-semibold text-gray-900 tabular-nums">{value}</dd>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
