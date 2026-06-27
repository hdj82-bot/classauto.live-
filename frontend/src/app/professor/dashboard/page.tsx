"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  fetchProfessorData,
  getCachedProfessorData,
  getCachedHub,
  setCachedHub,
} from "@/lib/professorData";
import { useI18n } from "@/contexts/I18nContext";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import EmptyDashboard from "@/components/professor/EmptyDashboard";
import {
  computeOnboardingProgress,
  type OnboardingSignals,
} from "@/components/professor/onboardingSteps";
import {
  StatGrid,
  Donut,
  ActivityFeed,
  useDashboardHubI18n,
  aggregateDashboardHub,
  type DashboardHubData,
  type FanOutInput,
} from "@/components/professor/dashboardHome";
import {
  PageContainer,
  PageHeader,
  PrimaryButton,
  Card,
  MonthlyQuotaMeter,
  displayStyle,
} from "@/components/professor/shell";
import LectureLibrarySection from "@/components/professor/LectureLibrarySection";

interface Course {
  id: string;
  title: string;
}

interface Lecture {
  id: string;
  title: string;
  slug: string;
  is_published: boolean;
  video_url?: string | null;
  pipeline_task_id?: string | null;
  created_at?: string | null;
}

/** 허브 집계 캐시 키 — 현재 강의 id 집합. 강의 구성이 같으면 재집계 생략. */
function hubCacheKey(lectures: { id: string }[]): string {
  return lectures
    .map((l) => l.id)
    .sort()
    .join(",");
}

/** Map<string, V> 의 값 타입 V 추출 — 배치 응답을 집계기 Map 과 동일하게 타입. */
type MapVal<M> = M extends Map<string, infer V> ? V : never;

/** GET /api/v1/dashboard/summary 의 강의 1건 (각 메트릭은 per-lecture 응답과 동일). */
interface DashboardSummaryRow {
  lecture_id: string;
  attendance: MapVal<FanOutInput["attendance"]>;
  scores: MapVal<FanOutInput["scores"]>;
  engagement: MapVal<FanOutInput["engagement"]>;
  qa: MapVal<FanOutInput["qa"]>;
  cost: MapVal<FanOutInput["cost"]>;
}

/**
 * 교수자 대시보드 — v2 디자인 (라이트 베이지 + 골드).
 *
 * 데이터 wiring 은 그대로 보존하고 시각만 v2 prototype 톤으로 교체.
 * docs/prototypes/05-studio-flow.extracted.html 의 topbar 는 layout.tsx 의
 * AppShell 이 제공하고, 본 페이지는 PageContainer + PageHeader + StatGrid
 * + 내 강의(LectureLibrarySection) + Donut/MonthlyQuotaMeter + ActivityFeed
 * 순으로 구성한다. 메인 차트·"주의 필요"(AttentionWidget) 는 데이터가 쌓이기
 * 전까지 빈 상태라 교수자 요청으로 제거(2026-06-11).
 *
 * 비용 표시 정책 (planning/05 §1.1):
 * - StatGrid 의 cost 카드는 `hideCostCard` 옵션으로 숨김.
 * - 우측 위젯: CostMeterBar 대신 MonthlyQuotaMeter (편수 기반).
 *
 * 빈 대시보드(`lectures.length === 0`) 분기는 EmptyDashboard 가 처리.
 */
export default function ProfessorDashboardPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [courses, setCourses] = useState<Course[]>(
    () => getCachedProfessorData<Lecture>()?.courses ?? [],
  );
  const [lectures, setLectures] = useState<Lecture[]>(
    () => getCachedProfessorData<Lecture>()?.lectures ?? [],
  );
  const [loading, setLoading] = useState(
    () => getCachedProfessorData<Lecture>() === null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // 캐시가 없을 때만 스피너 — 재방문 시 캐시로 즉시 렌더.
    if (getCachedProfessorData() === null) setLoading(true);
    (async () => {
      setError(null);
      try {
        // 강좌·강의는 공유 캐시에서 (다른 교수자 페이지와 공유, 재방문 시 즉시).
        const { courses: cs, lectures: lecs } =
          await fetchProfessorData<Lecture>();
        if (cancelled) return;
        setCourses(cs);
        setLectures(lecs);
      } catch {
        if (!cancelled) setError(t("professor.loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const signals: OnboardingSignals = useMemo(
    () => ({
      // 교수자는 Google OAuth 가입 시 /auth/complete-profile 에서 학교·학과를
      // 필수로 입력해 user.school/department 가 이미 채워진 채로 대시보드에
      // 도착한다. 따라서 이 단계는 항상 완료. (대시보드에서 같은 정보를 다시
      // 묻던 모달은 제거 — 영속성이 없어 매 새로고침마다 반복되던 버그.)
      profileSaved: true,
      courseCount: courses.length,
      lectureCount: lectures.length,
      lectureWithRenderCount: lectures.filter(
        (l) => Boolean(l.video_url) || Boolean(l.pipeline_task_id),
      ).length,
      publishedLectureCount: lectures.filter((l) => l.is_published).length,
    }),
    [courses.length, lectures],
  );

  const progress = useMemo(
    () => computeOnboardingProgress(signals),
    [signals],
  );

  const handleCreateLecture = useCallback(() => {
    router.push("/professor/studio");
  }, [router]);

  const [hub, setHub] = useState<DashboardHubData | null>(
    () => getCachedHub<DashboardHubData>(hubCacheKey(lectures)),
  );
  const [, setHubLoading] = useState(false);

  useEffect(() => {
    if (lectures.length === 0) return;
    // 강의 구성이 같고 캐시가 살아있으면 5N 재요청 없이 집계 결과 재사용.
    const key = hubCacheKey(lectures);
    const cachedHub = getCachedHub<DashboardHubData>(key);
    if (cachedHub) {
      setHub(cachedHub);
      setHubLoading(false);
      return;
    }
    let cancelled = false;
    setHubLoading(true);

    (async () => {
      const ids = lectures.map((l) => l.id);

      const toMap = <T,>(rs: PromiseSettledResult<{ data: T }>[]) => {
        const m = new Map<string, T | null>();
        ids.forEach((id, i) => {
          const r = rs[i];
          m.set(id, r.status === "fulfilled" ? r.value.data : null);
        });
        return m;
      };
      const allFailed = (rs: PromiseSettledResult<unknown>[]) =>
        rs.length > 0 && rs.every((r) => r.status === "rejected");

      // 5개 Map 채우기: 단일 배치 엔드포인트(/summary) 우선, 실패 시 기존
      // 강의당 5요청 fan-out 으로 폴백(미배포 404·부분 장애에도 안전).
      let attendance: FanOutInput["attendance"] = new Map();
      let scores: FanOutInput["scores"] = new Map();
      let engagement: FanOutInput["engagement"] = new Map();
      let qa: FanOutInput["qa"] = new Map();
      let cost: FanOutInput["cost"] = new Map();
      let failures: FanOutInput["failures"] = {
        attendance: false,
        scores: false,
        engagement: false,
        qa: false,
        cost: false,
      };

      try {
        // 강의당 5개(=1+6N) 요청을 한 번에. 응답의 각 강의 항목에서 5개 Map 구성.
        const { data } = await api.get<{ lectures: DashboardSummaryRow[] }>(
          "/api/v1/dashboard/summary",
        );
        if (cancelled) return;
        const byId = new Map(
          data.lectures.map((r) => [r.lecture_id, r] as const),
        );
        for (const id of ids) {
          const row = byId.get(id);
          attendance.set(id, row ? row.attendance : null);
          scores.set(id, row ? row.scores : null);
          engagement.set(id, row ? row.engagement : null);
          qa.set(id, row ? row.qa : null);
          cost.set(id, row ? row.cost : null);
        }
      } catch {
        const [attendanceR, scoresR, engagementR, qaR, costR] =
          await Promise.all([
            Promise.allSettled(
              ids.map((id) => api.get(`/api/v1/dashboard/${id}/attendance`)),
            ),
            Promise.allSettled(
              ids.map((id) => api.get(`/api/v1/dashboard/${id}/scores`)),
            ),
            Promise.allSettled(
              ids.map((id) => api.get(`/api/v1/dashboard/${id}/engagement`)),
            ),
            Promise.allSettled(
              ids.map((id) => api.get(`/api/v1/dashboard/${id}/qa?limit=50`)),
            ),
            Promise.allSettled(
              ids.map((id) => api.get(`/api/v1/dashboard/${id}/cost`)),
            ),
          ]);
        if (cancelled) return;
        attendance = toMap(attendanceR);
        scores = toMap(scoresR);
        engagement = toMap(engagementR);
        qa = toMap(qaR);
        cost = toMap(costR);
        failures = {
          attendance: allFailed(attendanceR),
          scores: allFailed(scoresR),
          engagement: allFailed(engagementR),
          qa: allFailed(qaR),
          cost: allFailed(costR),
        };
      }

      const aggregated = aggregateDashboardHub({
        lectures: lectures.map((l) => ({
          id: l.id,
          title: l.title,
          is_published: l.is_published,
          created_at: l.created_at ?? null,
          video_url: l.video_url ?? null,
        })),
        attendance,
        scores,
        engagement,
        qa,
        cost,
        failures,
        monthlyVideoLimit: null,
        monthlyCostLimitUsd: null,
      });
      setHub(aggregated);
      setCachedHub(key, aggregated);
      setHubLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [lectures]);

  if (loading) {
    return <LoadingSpinner fullScreen label={t("lecture.lectureLoadingList")} />;
  }

  if (error) {
    return (
      <PageContainer width="narrow">
        <Card padding={32} radius={18}>
          <div className="text-center" role="alert">
            <h2 style={{ ...displayStyle, fontSize: 22, marginBottom: 12 }}>
              불러올 수 없습니다
            </h2>
            <p style={{ color: "var(--text-muted)", marginBottom: 18 }}>
              {error}
            </p>
            <PrimaryButton
              variant="primary"
              size="md"
              onClick={() => window.location.reload()}
            >
              {t("common.retry")}
            </PrimaryButton>
          </div>
        </Card>
      </PageContainer>
    );
  }

  // 빈 대시보드: 첫 사용 온보딩
  if (lectures.length === 0) {
    return (
      <PageContainer>
        <EmptyDashboard
          progress={progress}
          onCreateLecture={handleCreateLecture}
        />
      </PageContainer>
    );
  }

  return (
    <DashboardHomeView
      hub={hub}
      onCreateLecture={handleCreateLecture}
      onJumpToInbox={() => router.push("/professor/inbox")}
    />
  );
}

/**
 * 대시보드 홈 뷰 (강의 1개 이상).
 *
 * v2 디자인 — PageContainer + PageHeader + Card 패턴으로 재구성.
 * 비용 카드는 hideCostCard 로 숨기고 우측에 MonthlyQuotaMeter 노출.
 */
function DashboardHomeView({
  hub,
  onCreateLecture,
  onJumpToInbox,
}: {
  hub: DashboardHubData | null;
  onCreateLecture: () => void;
  onJumpToInbox: () => void;
}) {
  const { t } = useI18n();
  const { t: th } = useDashboardHubI18n();

  return (
    <PageContainer>
      <PageHeader
        eyebrow="ClassAuto"
        title={th("greetingDefault")}
        subtitle={
          hub
            ? th("summaryWeek", {
                qa: hub.activity.filter((a) => a.kind === "qa-asked").length,
                lagging: hub.attention.laggingLearners.length,
              })
            : undefined
        }
        actions={
          <>
            <PrimaryButton
              variant="primary"
              size="md"
              onClick={onCreateLecture}
              trailingIcon={
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
              }
            >
              {t("professor.createLecture")}
            </PrimaryButton>
          </>
        }
      />

      {/* §4.2 — 통계 카드 5종 (비용 카드 숨김) */}
      {hub && (
        <section
          aria-labelledby="dashboard-stats-title"
          style={{ marginBottom: 28 }}
        >
          <h2 id="dashboard-stats-title" className="sr-only">
            {th("stats.title")}
          </h2>
          <StatGrid
            stats={hub.stats}
            onJumpToInbox={onJumpToInbox}
            hideCostCard
          />
        </section>
      )}

      {/* §4.5 내 강의 — 통계(분석) 카드 바로 아래에 둬 교수자가 강의에 먼저
          접근하게 한다(교수자 요청). 메인 차트·"주의 필요" 위젯은 데이터가 쌓이기
          전까지 빈 상태라 일단 제거(교수자 요청). */}
      <div style={{ marginBottom: 28 }}>
        <LectureLibrarySection
          title={t("library.sectionTitle")}
          subtitle={t("library.sectionSubtitle")}
        />
      </div>

      {/* 도넛(학습자 진도 분포)+월 영상 사용량 / 최근 활동 */}
      <div
        className="grid grid-cols-1 gap-4 lg:grid-cols-3"
        style={{ marginBottom: 28 }}
      >
        <div className="space-y-4">
          <Card padding={22}>
            <h2
              style={{
                ...displayStyle,
                margin: 0,
                marginBottom: 14,
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              {th("donut.title")}
            </h2>
            {hub && <Donut data={hub.donut} />}
          </Card>
          {hub && (
            <MonthlyQuotaMeter
              used={hub.stats.monthlyVideoCount}
              limit={hub.stats.monthlyVideoLimit ?? null}
              planName={hub.stats.monthlyVideoLimit === 20 ? "Pro" : undefined}
            />
          )}
        </div>
        <section className="lg:col-span-2">
          <h2
            style={{
              ...displayStyle,
              margin: 0,
              marginBottom: 12,
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            {th("activity.title")}
          </h2>
          {hub && <ActivityFeed activity={hub.activity} />}
        </section>
      </div>
    </PageContainer>
  );
}

