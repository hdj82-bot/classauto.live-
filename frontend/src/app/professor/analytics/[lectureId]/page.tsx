"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { canSeeAnalyticsPro } from "@/lib/analyticsProAccess";
import {
  AttendanceChart,
  StudentProgressGrid,
  AttentionScore,
  SummaryCards,
  ScoreHeatmap,
  EngagementCurve,
  CsvExportButton,
  PdfExportButton,
  WatchHeatmap,
  QaTrend,
  AchievementTrend,
  QaKeywords,
  KpiDeltaCards,
  GoalTracker,
  ActionLog,
  useAnalyticsI18n,
} from "@/components/professor/analytics";
import { useInsightsI18n } from "@/components/professor/analytics/insights";
import {
  PageContainer,
  PageHeader,
  PrimaryButton,
  Card,
  displayStyle,
} from "@/components/professor/shell";
import type {
  AttendanceData,
  ScoresData,
  EngagementData,
  QAData,
  WatchHeatmapData,
  TrendData,
  QaKeywordsData,
  KpiDeltaData,
} from "@/components/professor/analytics/types";

interface LectureMeta {
  id: string;
  title: string;
  slug?: string;
  is_published?: boolean;
}

type SectionKey =
  | "attendance"
  | "kpi"
  | "trend"
  | "goals"
  | "actions"
  | "studentGrid"
  | "qaKeywords"
  | "scores"
  | "summary"
  | "engagement"
  | "attention"
  | "watch"
  | "qa";

/**
 * 강의별 분석 리포트 — dashboard endpoint (`attendance`, `scores`, `engagement`,
 * `qa`, `trend`, `qa-keywords`, `kpi`, `export/csv`) 를 사용한다. 각 endpoint 응답을
 * 차트 컴포넌트에 그대로 넘긴다 (정규화 코드는 차트 내부에 둔다 — 응답 shape 의
 * 단일 진실은 `types.ts`). 원가(`cost`) 는 정책상(planning/05 §1.1) 교수자 화면에
 * 표시하지 않으므로 여기서 조회하지 않는다 (admin 비용 화면 전용).
 *
 * - 모든 endpoint 는 `Promise.allSettled` 로 병렬 호출 → 일부가 실패해도 나머지
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
  // 보고서 링크 라벨만 insights 패치에서 (analytics 패치는 본 창 소유 아님).
  const { t: tReport } = useInsightsI18n();
  // 종합보고서(실기능)는 계정주 2계정에만 노출 — 베타테스터에겐 버튼을 숨긴다.
  const auth = useOptionalAuth();
  const showComprehensive = canSeeAnalyticsPro(auth?.user?.email);

  const [lecture, setLecture] = useState<LectureMeta | null>(null);
  const [attendance, setAttendance] = useState<AttendanceData | null>(null);
  const [scores, setScores] = useState<ScoresData | null>(null);
  const [engagement, setEngagement] = useState<EngagementData | null>(null);
  const [qa, setQa] = useState<QAData | null>(null);
  const [watch, setWatch] = useState<WatchHeatmapData | null>(null);
  // C(스펙 11 §C): 성취율 추이 — 일배치 스냅샷(독립 best-effort, 페이지 에러 미관여).
  const [trend, setTrend] = useState<TrendData | null>(null);
  // G(스펙 11 §G): 빈번 질문어 — Q&A 질문 키워드(독립 best-effort).
  const [qaKeywords, setQaKeywords] = useState<QaKeywordsData | null>(null);
  // B(스펙 11 §B): 현황 KPI + 전주 대비 델타 — 추이와 동일 스냅샷 원자료.
  const [kpi, setKpi] = useState<KpiDeltaData | null>(null);

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
        trendRes,
        qaKeywordsRes,
        kpiRes,
      ] = await Promise.allSettled([
        lectureMetaPromise,
        api.get<AttendanceData>(`/api/v1/dashboard/${lectureId}/attendance`),
        api.get<ScoresData>(`/api/v1/dashboard/${lectureId}/scores`),
        api.get<EngagementData & { slides?: WatchHeatmapData["slides"] }>(
          `/api/v1/dashboard/${lectureId}/engagement`,
        ),
        api.get<QAData>(`/api/v1/dashboard/${lectureId}/qa?limit=50`),
        api.get<TrendData>(`/api/v1/dashboard/${lectureId}/trend?days=30`),
        api.get<QaKeywordsData>(`/api/v1/dashboard/${lectureId}/qa-keywords?top=24`),
        api.get<KpiDeltaData>(`/api/v1/dashboard/${lectureId}/kpi`),
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
      if (trendRes.status === "fulfilled") setTrend(trendRes.value.data);
      if (qaKeywordsRes.status === "fulfilled")
        setQaKeywords(qaKeywordsRes.value.data);
      if (kpiRes.status === "fulfilled") setKpi(kpiRes.value.data);

      // 모든 dashboard endpoint (attendance/scores/engagement/qa) 가 실패한
      // 경우만 페이지 단위 에러로 띄운다 — 부분 실패는 해당 섹션이 자체
      // EmptyState 로 처리.
      const allDashboardFailed = [
        attendanceRes,
        scoresRes,
        engagementRes,
        qaRes,
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
      <PageContainer width="narrow">
        <Card padding={40} radius={18}>
          <div role="alert" className="text-center">
            <p style={{ fontSize: 14, color: "var(--text)", marginBottom: 18 }}>
              {error}
            </p>
            <PrimaryButton
              variant="primary"
              size="md"
              onClick={() => setRetry((n) => n + 1)}
            >
              {t("lectureRetry")}
            </PrimaryButton>
          </div>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div lang={locale} />
      <PageHeader
        eyebrow={
          <Link
            href="/professor/analytics"
            className="print-hide"
            style={{ color: "var(--gold)", textDecoration: "none", fontSize: 11 }}
          >
            ← {t("lectureBack")}
          </Link>
        }
        title={t("lectureTitle", { title: lecture?.title ?? lectureId })}
        subtitle={t("lectureSubtitle")}
        actions={
          <div className="print-hide flex items-center gap-2">
            {/* 분석 리포트 PDF 출력 — 브라우저 인쇄(스펙 11 §A) */}
            <PdfExportButton />
            {/* 종합보고서 — 학기 전체 분석(B블록 §3): 추이·설문·총평·논문 제안. 계정주 2계정에만 노출. */}
            {showComprehensive && (
              <Link
                href={`/professor/analytics/${lectureId}/comprehensive`}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
                style={{
                  border: "1px solid var(--gold, #FFB627)",
                  color: "var(--gold-on-light, #B88308)",
                  textDecoration: "none",
                }}
              >
                {t("comprehensiveReportLink")}
              </Link>
            )}
            {/* 대면수업 솔루션 보고서(인사이트) — RQ2 핵심 합성 화면으로 이동 */}
            <Link
              href={`/professor/analytics/${lectureId}/report`}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
              style={{
                background: "linear-gradient(135deg, #FFB627, #E89E0E)",
                color: "#0A0A0A",
                textDecoration: "none",
                boxShadow: "0 4px 14px rgba(255, 182, 39, 0.34)",
              }}
            >
              {tReport("linkLabel")}
            </Link>
            <CsvExportButton lectureId={lectureId} />
          </div>
        }
      />
      <div className="space-y-6">

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

      {/* B (스펙 11 §B): 현황 KPI + 전주 대비 델타 — 추이와 동일 스냅샷 원자료.
          자체 EmptyState(수집 중)를 가지므로 무조건 렌더. */}
      <Section id="kpi" title={t("section.kpi")}>
        <KpiDeltaCards data={kpi} />
      </Section>

      {/* C (스펙 11 §C): 성취율 추이 — 일배치 스냅샷 라인 차트. 자체 EmptyState
          (수집 중)를 가지므로 무조건 렌더. */}
      <Section id="trend" title={t("section.trend")}>
        <AchievementTrend data={trend} />
      </Section>

      {/* H-3 (스펙 11 §H-3): 학습 목표·달성률 — 자체 CRUD(lectureId 만 전달). */}
      <Section id="goals" title={t("section.goals")}>
        <GoalTracker lectureId={lectureId} />
      </Section>

      {/* H-4 (스펙 11 §H-4, RQ2): 격려·개입 행동 로그 — attendance 학생목록 전달. */}
      <Section id="actions" title={t("section.actions")}>
        <ActionLog
          lectureId={lectureId}
          students={attendance?.students ?? []}
        />
      </Section>

      {/* E (스펙 11 §E): 학생 개별 진척도 그리드 — attendance 데이터 재활용. */}
      <Section id="studentGrid" title={t("section.studentGrid")}>
        {attendance ? (
          <StudentProgressGrid data={attendance} />
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

      {/* G (스펙 11 §G): 요약 카드 — 빈번 오답·무반응·범위 외 질문(기존 집계 재활용). */}
      <Section id="summary" title={t("section.summary")}>
        <SummaryCards scores={scores} engagement={engagement} qa={qa} />
      </Section>

      {/* G (스펙 11 §G): 빈번 질문어 — Q&A 질문 키워드 칩(자체 EmptyState). */}
      <Section id="qaKeywords" title={t("section.qaKeywords")}>
        <QaKeywords data={qaKeywords} />
      </Section>

      <Section id="engagement" title={t("section.engagement")}>
        {engagement ? (
          <EngagementCurve data={engagement} />
        ) : (
          <FallbackPanel sectionKey="engagement" />
        )}
      </Section>

      {/* D (스펙 11 §D): 집중 분석 도넛 + 점수 — engagement.summary.attention. */}
      <Section id="attention" title={t("section.attention")}>
        <AttentionScore data={engagement?.summary.attention ?? null} />
      </Section>

      <Section id="watch" title={t("section.watch")}>
        <WatchHeatmap data={watch} />
      </Section>

      <Section id="qa" title={t("section.qa")}>
        {qa ? <QaTrend data={qa} /> : <FallbackPanel sectionKey="qa" />}
      </Section>

      {/*
        cost 섹션은 docs/planning/05-instructor-pages.md §1.1 (2026-05-06)
        비용 표시 절대 금지 정책에 따라 교수자 화면에서 제외. 대신 우측 위젯·
        구독 페이지에서 편수·한도 단위로 표시한다. 원가 데이터는 이 페이지에서
        조회하지 않으며(2026-06-19 dead-fetch 제거), 백엔드 admin 화면에서만
        원가 모니터링한다 (별도 화면).
      */}
      </div>
    </PageContainer>
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
    <Card
      padding={24}
      radius={16}
      role="region"
      aria-labelledby={`analytics-section-${id}`}
      data-analytics-section
    >
      <header className="mb-5 flex items-center justify-between">
        <h2
          id={`analytics-section-${id}`}
          style={{ ...displayStyle, margin: 0, fontSize: 16, fontWeight: 700 }}
        >
          {title}
        </h2>
        {description && (
          <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-subtle)" }}>
            {description}
          </p>
        )}
      </header>
      {children}
    </Card>
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
