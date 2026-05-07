"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";
import {
  AttendanceChart,
  ScoreHeatmap,
  EngagementCurve,
  CostMeter,
  CsvExportButton,
  WatchHeatmap,
  QaTrend,
  useAnalyticsI18n,
} from "@/components/professor/analytics";
import type {
  AttendanceData,
  ScoresData,
  EngagementData,
  CostData,
  QAData,
  WatchHeatmapData,
} from "@/components/professor/analytics/types";

interface LectureMeta {
  id: string;
  title: string;
  slug?: string;
  is_published?: boolean;
}

type SectionKey =
  | "attendance"
  | "scores"
  | "engagement"
  | "watch"
  | "qa"
  | "cost";

/**
 * 강의별 분석 리포트 — 6 endpoint (`attendance`, `scores`, `engagement`, `qa`,
 * `cost`, `export/csv`) 를 모두 사용한다. 각 endpoint 응답을 차트 컴포넌트에
 * 그대로 넘긴다 (정규화 코드는 차트 내부에 둔다 — 응답 shape 의 단일 진실은
 * `types.ts`).
 *
 * - 6 endpoint 는 `Promise.allSettled` 로 병렬 호출 → 일부가 실패해도 나머지
 *   섹션은 표시된다 (대시보드의 데이터 의존성이 서로 독립이라 best-effort).
 * - watch heatmap raw data 는 백엔드 미도착 — `/engagement` 응답에 `slides`
 *   키가 함께 와도 지원하도록 스키마를 미리 분리해두었다 (BACKEND_ASKS 참조).
 *
 * `prefers-reduced-motion` 사용자에게는 섹션 진입 모션이 비활성화되도록
 * Tailwind `motion-safe:` modifier 만 사용.
 */
export default function LectureAnalyticsPage() {
  const params = useParams<{ lectureId: string }>();
  const lectureId = params.lectureId;
  const { locale } = useI18n();
  const { t } = useAnalyticsI18n();

  const [lecture, setLecture] = useState<LectureMeta | null>(null);
  const [attendance, setAttendance] = useState<AttendanceData | null>(null);
  const [scores, setScores] = useState<ScoresData | null>(null);
  const [engagement, setEngagement] = useState<EngagementData | null>(null);
  const [qa, setQa] = useState<QAData | null>(null);
  const [cost, setCost] = useState<CostData | null>(null);
  const [watch, setWatch] = useState<WatchHeatmapData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 강의 메타: 백엔드에 단일 GET /api/lectures/{id} 가 없어 (PATCH/DELETE만)
      // courses → lectures fan-out 으로 제목을 찾는다. 실패해도 페이지는 렌더링.
      const lectureMetaPromise = (async () => {
        const { data: courses } = await api.get<{ id: string }[]>(
          "/api/courses",
        );
        for (const c of courses) {
          const { data: lecs } = await api.get<LectureMeta[]>(
            `/api/courses/${c.id}/lectures`,
          );
          const found = lecs.find((l) => l.id === lectureId);
          if (found) return found;
        }
        return null;
      })();

      const [
        lectureRes,
        attendanceRes,
        scoresRes,
        engagementRes,
        qaRes,
        costRes,
      ] = await Promise.allSettled([
        lectureMetaPromise,
        api.get<AttendanceData>(`/api/v1/dashboard/${lectureId}/attendance`),
        api.get<ScoresData>(`/api/v1/dashboard/${lectureId}/scores`),
        api.get<EngagementData & { slides?: WatchHeatmapData["slides"] }>(
          `/api/v1/dashboard/${lectureId}/engagement`,
        ),
        api.get<QAData>(`/api/v1/dashboard/${lectureId}/qa?limit=50`),
        api.get<CostData>(`/api/v1/dashboard/${lectureId}/cost`),
      ]);

      if (lectureRes.status === "fulfilled" && lectureRes.value) {
        setLecture(lectureRes.value);
      }
      if (attendanceRes.status === "fulfilled")
        setAttendance(attendanceRes.value.data);
      if (scoresRes.status === "fulfilled") setScores(scoresRes.value.data);
      if (engagementRes.status === "fulfilled") {
        const body = engagementRes.value.data;
        setEngagement(body);
        if (Array.isArray(body.slides) && body.slides.length > 0) {
          // 백엔드가 slides 를 함께 내려주는 경우 (협의안) 자동으로 활성화.
          setWatch({ lecture_id: lectureId, slides: body.slides });
        }
      }
      if (qaRes.status === "fulfilled") setQa(qaRes.value.data);
      if (costRes.status === "fulfilled") setCost(costRes.value.data);

      // 모든 dashboard endpoint (attendance/scores/engagement/qa/cost) 가
      // 실패한 경우만 페이지 단위 에러로 띄운다 — 부분 실패는 해당 섹션이
      // 자체 EmptyState 로 처리.
      const allDashboardFailed = [
        attendanceRes,
        scoresRes,
        engagementRes,
        qaRes,
        costRes,
      ].every((r) => r.status === "rejected");
      if (allDashboardFailed) {
        setError(t("lectureLoadError"));
      }
    } catch {
      setError(t("lectureLoadError"));
    } finally {
      setLoading(false);
    }
  }, [lectureId, t]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll, retry]);

  if (loading) {
    return <LoadingSpinner fullScreen label={t("lectureLoading")} />;
  }

  if (error) {
    return (
      <div role="alert" className="mx-auto max-w-xl py-12 text-center">
        <p className="text-sm text-gray-700">{error}</p>
        <button
          type="button"
          onClick={() => setRetry((n) => n + 1)}
          className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          {t("lectureRetry")}
        </button>
      </div>
    );
  }

  return (
    <div lang={locale} className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/professor/analytics"
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {t("lectureBack")}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            {t("lectureTitle", {
              title: lecture?.title ?? lectureId,
            })}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{t("lectureSubtitle")}</p>
        </div>
        <CsvExportButton lectureId={lectureId} />
      </header>

      <Section
        id="attendance"
        title={t("section.attendance")}
        description={attendance ? undefined : t("lectureLoadError")}
      >
        {attendance ? (
          <AttendanceChart data={attendance} />
        ) : (
          <FallbackPanel sectionKey="attendance" />
        )}
      </Section>

      <Section id="scores" title={t("section.scores")}>
        {scores ? (
          <ScoreHeatmap data={scores} />
        ) : (
          <FallbackPanel sectionKey="scores" />
        )}
      </Section>

      <Section id="engagement" title={t("section.engagement")}>
        {engagement ? (
          <EngagementCurve data={engagement} />
        ) : (
          <FallbackPanel sectionKey="engagement" />
        )}
      </Section>

      <Section id="watch" title={t("section.watch")}>
        <WatchHeatmap data={watch} />
      </Section>

      <Section id="qa" title={t("section.qa")}>
        {qa ? <QaTrend data={qa} /> : <FallbackPanel sectionKey="qa" />}
      </Section>

      <Section id="cost" title={t("section.cost")}>
        {cost ? (
          <CostMeter data={cost} />
        ) : (
          <FallbackPanel sectionKey="cost" />
        )}
      </Section>
    </div>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: SectionKey;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`analytics-section-${id}`}
      className="rounded-2xl border border-gray-200 bg-white p-6 motion-safe:animate-fade-in"
    >
      <header className="mb-5 flex items-center justify-between">
        <h2
          id={`analytics-section-${id}`}
          className="text-lg font-semibold text-gray-900"
        >
          {title}
        </h2>
        {description && (
          <p className="text-xs text-gray-500">{description}</p>
        )}
      </header>
      {children}
    </section>
  );
}

/**
 * 섹션 단위 fallback (해당 endpoint 만 실패한 경우). 차트 컴포넌트의
 * EmptyState 와 시각적으로 일치한다.
 */
function FallbackPanel({ sectionKey }: { sectionKey: SectionKey }) {
  const { t } = useAnalyticsI18n();
  return (
    <div
      role="status"
      className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-6 py-8 text-center"
    >
      <p className="text-sm text-gray-700">{t("empty.noData")}</p>
      <p className="mt-1 text-xs text-gray-500">
        {t(`section.${sectionKey}`)}
      </p>
    </div>
  );
}
