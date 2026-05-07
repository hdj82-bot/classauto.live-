"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/contexts/I18nContext";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import EmptyDashboard from "@/components/professor/EmptyDashboard";
import InstructorProfileModal, {
  type InstructorProfileDraft,
} from "@/components/professor/InstructorProfileModal";
import {
  computeOnboardingProgress,
  type OnboardingSignals,
} from "@/components/professor/onboardingSteps";
import { useProfessorI18n } from "@/components/professor/useProfessorI18n";
import {
  StatGrid,
  MainChart,
  Donut,
  AttentionWidget,
  ActivityFeed,
  CostMeterBar,
  useDashboardHubI18n,
  aggregateDashboardHub,
  type DashboardHubData,
} from "@/components/professor/dashboardHome";

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

/**
 * 교수자 대시보드.
 *
 * 강의가 0개일 때는 R2W3 의 첫 사용 온보딩(`EmptyDashboard`) 으로 분기,
 * 1개 이상일 때는 기존의 강의 그리드를 그대로 보여줍니다.
 *
 * 첫 진입 + (학과 정보 미입력 추정) 시점에 `InstructorProfileModal` 을 자동 노출.
 * 학과 정보 보존: AuthContext / `/api/users/me` 가 부재한 현재 (R2W2 미머지),
 * 모달 제출 결과를 React state 로만 보존합니다. 다음 세션에서 강의가 0개라면
 * 다시 자연스럽게 모달이 노출되며, 강의가 1개 이상이면 자동 노출되지 않습니다.
 */
export default function ProfessorDashboardPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [courses, setCourses] = useState<Course[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 학과·소속 정보 — 모달 제출 시 채워짐. R2W2 의 /api/users/me 도착 후
  // mount 시 fetch 로 초기화하면 영속성 자동 활성화.
  const [profileDraft, setProfileDraft] =
    useState<InstructorProfileDraft | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [autoOpenChecked, setAutoOpenChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const { data: cs } = await api.get<Course[]>("/api/courses");
        if (cancelled) return;
        setCourses(cs);

        const allLectures: Lecture[] = [];
        for (const c of cs) {
          const { data: lecs } = await api.get<Lecture[]>(
            `/api/courses/${c.id}/lectures`,
          );
          allLectures.push(...lecs);
        }
        if (cancelled) return;
        setLectures(allLectures);
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

  // 빈 대시보드일 때 + 아직 프로필 채움이 없으면 첫 진입에서 모달 자동 오픈.
  useEffect(() => {
    if (loading) return;
    if (autoOpenChecked) return;
    setAutoOpenChecked(true);
    if (lectures.length === 0 && !profileDraft) {
      setProfileModalOpen(true);
    }
  }, [loading, lectures.length, profileDraft, autoOpenChecked]);

  const signals: OnboardingSignals = useMemo(
    () => ({
      profileSaved: profileDraft !== null,
      courseCount: courses.length,
      lectureCount: lectures.length,
      lectureWithRenderCount: lectures.filter(
        (l) => Boolean(l.video_url) || Boolean(l.pipeline_task_id),
      ).length,
      publishedLectureCount: lectures.filter((l) => l.is_published).length,
    }),
    [profileDraft, courses.length, lectures],
  );

  const progress = useMemo(
    () => computeOnboardingProgress(signals),
    [signals],
  );

  const handleCreateLecture = useCallback(() => {
    router.push("/professor/lecture/new");
  }, [router]);

  const handleOpenSampleDemo = useCallback(() => {
    if (typeof window === "undefined") return;
    window.open("/demo", "_blank", "noopener,noreferrer");
  }, []);

  const handleProfileSaved = useCallback((profile: InstructorProfileDraft) => {
    setProfileDraft(profile);
  }, []);

  // ── 대시보드 홈 통계 fan-out (강의 1개 이상일 때만 활성) ──────────────────
  // dashboard.py 6 endpoint 가 lecture_id 단위라 클라이언트에서 합산.
  // 합산 로직은 `aggregate.ts` 에 있고, 본 페이지는 fetch 와 wiring 만 담당.
  const [hub, setHub] = useState<DashboardHubData | null>(null);
  const [hubLoading, setHubLoading] = useState(false);

  useEffect(() => {
    if (lectures.length === 0) return; // 빈 대시보드 분기는 EmptyDashboard 가 처리
    let cancelled = false;
    setHubLoading(true);

    (async () => {
      const ids = lectures.map((l) => l.id);

      // 5 endpoint × N lectures 를 Promise.allSettled 로 병렬 호출
      const [attendanceR, scoresR, engagementR, qaR, costR] = await Promise.all(
        [
          Promise.allSettled(
            ids.map((id) =>
              api.get(`/api/v1/dashboard/${id}/attendance`),
            ),
          ),
          Promise.allSettled(
            ids.map((id) => api.get(`/api/v1/dashboard/${id}/scores`)),
          ),
          Promise.allSettled(
            ids.map((id) => api.get(`/api/v1/dashboard/${id}/engagement`)),
          ),
          Promise.allSettled(
            ids.map((id) =>
              api.get(`/api/v1/dashboard/${id}/qa?limit=50`),
            ),
          ),
          Promise.allSettled(
            ids.map((id) => api.get(`/api/v1/dashboard/${id}/cost`)),
          ),
        ],
      );

      if (cancelled) return;

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

      const aggregated = aggregateDashboardHub({
        lectures: lectures.map((l) => ({
          id: l.id,
          title: l.title,
          is_published: l.is_published,
          created_at: l.created_at ?? null,
          video_url: l.video_url ?? null,
        })),
        attendance: toMap(attendanceR),
        scores: toMap(scoresR),
        engagement: toMap(engagementR),
        qa: toMap(qaR),
        cost: toMap(costR),
        failures: {
          attendance: allFailed(attendanceR),
          scores: allFailed(scoresR),
          engagement: allFailed(engagementR),
          qa: allFailed(qaR),
          cost: allFailed(costR),
        },
        // 월 한도는 백엔드 미도착 — null 로 두면 UI 가 placeholder 표시.
        // BACKEND_ASKS.DASHBOARDHUB.md §7 도착 후 사용자 플랜에서 가져옴.
        monthlyVideoLimit: null,
        monthlyCostLimitUsd: null,
      });
      setHub(aggregated);
      setHubLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [lectures]);

  if (loading) {
    return (
      <LoadingSpinner fullScreen label={t("lecture.lectureLoadingList")} />
    );
  }

  if (error) {
    return (
      <div>
        <div className="text-center py-20" role="alert">
          <div
            className="w-12 h-12 mx-auto mb-4 rounded-xl bg-red-100 flex items-center justify-center"
            aria-hidden="true"
          >
            <svg
              className="w-6 h-6 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <p className="text-gray-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl px-5 py-2.5 transition"
          >
            {t("common.retry")}
          </button>
        </div>
      </div>
    );
  }

  // ── 빈 대시보드: 첫 사용 온보딩 ─────────────────────────────────────────────
  if (lectures.length === 0) {
    return (
      <>
        <EmptyDashboard
          progress={progress}
          onCreateLecture={handleCreateLecture}
          onOpenProfileModal={() => setProfileModalOpen(true)}
          onOpenSampleDemo={handleOpenSampleDemo}
        />
        <InstructorProfileModal
          open={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          onSaved={handleProfileSaved}
          initial={profileDraft ?? undefined}
        />
      </>
    );
  }

  // ── 정상 대시보드 ──────────────────────────────────────────────────────────
  return (
    <DashboardHomeView
      lectures={lectures}
      hub={hub}
      hubLoading={hubLoading}
      onCreateLecture={handleCreateLecture}
      onOpenProfile={() => setProfileModalOpen(true)}
      onJumpToInbox={() => router.push("/professor/inbox")}
      onOpenLectureAnalytics={(id) =>
        router.push(`/professor/lecture/${id}/dashboard`)
      }
      onEditLecture={(id) => router.push(`/professor/lecture/${id}`)}
      profileModalOpen={profileModalOpen}
      onCloseProfileModal={() => setProfileModalOpen(false)}
      onProfileSaved={handleProfileSaved}
      profileDraft={profileDraft}
    />
  );
}

/**
 * 대시보드 홈 뷰 (강의 1개 이상). EmptyDashboard 분기와 분리해서 R2W3 의 빈
 * 상태 회귀를 막는다. props 만 받는 순수 함수처럼 구성 — useEffect 등 외부
 * 사이드 이펙트는 모두 부모(`ProfessorDashboardPage`)가 책임진다.
 */
function DashboardHomeView({
  lectures,
  hub,
  hubLoading,
  onCreateLecture,
  onOpenProfile,
  onJumpToInbox,
  onOpenLectureAnalytics,
  onEditLecture,
  profileModalOpen,
  onCloseProfileModal,
  onProfileSaved,
  profileDraft,
}: {
  lectures: Lecture[];
  hub: DashboardHubData | null;
  hubLoading: boolean;
  onCreateLecture: () => void;
  onOpenProfile: () => void;
  onJumpToInbox: () => void;
  onOpenLectureAnalytics: (id: string) => void;
  onEditLecture: (id: string) => void;
  profileModalOpen: boolean;
  onCloseProfileModal: () => void;
  onProfileSaved: (profile: InstructorProfileDraft) => void;
  profileDraft: InstructorProfileDraft | null;
}) {
  const { t } = useI18n();
  const { t: tp } = useProfessorI18n();
  const { t: th } = useDashboardHubI18n();

  return (
    <div>
      {/* 컨텍스트 바 + 인사 카드 (§4.1) */}
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {profileDraft?.school
              ? th("greetingNamed", {
                  name: profileDraft.school,
                })
              : th("greetingDefault")}
          </h1>
          {hub && (
            <p className="mt-1 text-sm text-gray-500">
              {th("summaryWeek", {
                qa: hub.activity.filter((a) => a.kind === "qa-asked").length,
                lagging: hub.attention.laggingLearners.length,
              })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={onOpenProfile}
            className="hidden sm:inline-flex items-center text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-2 motion-safe:transition"
          >
            {tp("openProfile")}
          </button>
          <button
            onClick={onCreateLecture}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5 py-2.5 text-sm font-medium motion-safe:transition w-full sm:w-auto"
          >
            {t("professor.createLecture")}
          </button>
        </div>
      </header>

      {/* §4.2 — 통계 카드 6 종 */}
      {hub && (
        <section aria-labelledby="dashboard-stats-title" className="mb-8">
          <h2
            id="dashboard-stats-title"
            className="sr-only"
          >
            {th("stats.title")}
          </h2>
          <StatGrid stats={hub.stats} onJumpToInbox={onJumpToInbox} />
        </section>
      )}

      {/* §4.3 메인 차트 (좌 2/3) + §4.4 우측 위젯 (1/3) */}
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {hub ? (
            <MainChart series={hub.mainChart} />
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500">
              {hubLoading ? "..." : th("loadError")}
            </div>
          )}
        </div>
        <div className="space-y-4">
          {hub && <AttentionWidget data={hub.attention} />}
          {hub && (
            <CostMeterBar
              usedUsd={hub.stats.totalCostUsd}
              limitUsd={hub.stats.monthlyCostLimitUsd}
            />
          )}
        </div>
      </div>

      {/* 도넛 + 활동 피드 */}
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section
          aria-label={th("donut.title")}
          className="rounded-2xl border border-gray-200 bg-white p-6"
        >
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            {th("donut.title")}
          </h2>
          {hub && <Donut data={hub.donut} />}
        </section>
        <section
          aria-label={th("activity.title")}
          className="lg:col-span-2"
        >
          <h2 className="mb-3 text-base font-semibold text-gray-900">
            {th("activity.title")}
          </h2>
          {hub && <ActivityFeed activity={hub.activity} />}
        </section>
      </div>

      {/* §4.5 최근 강의 영상 그리드 — 상단 4개 미리보기. */}
      <section aria-labelledby="recent-lectures-title">
        <header className="mb-3 flex items-center justify-between">
          <h2
            id="recent-lectures-title"
            className="text-base font-semibold text-gray-900"
          >
            {th("lectureGrid.title")}
          </h2>
          {lectures.length > 4 && (
            <span className="text-xs text-gray-400">
              {th("lectureGrid.more", { count: lectures.length - 4 })}
            </span>
          )}
        </header>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {lectures.slice(0, 4).map((lec) => (
            <article
              key={lec.id}
              className="rounded-2xl border border-gray-200 bg-white p-5 motion-safe:transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
            >
              <h3 className="mb-2 truncate font-semibold text-gray-900">
                {lec.title}
              </h3>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                  lec.is_published
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    lec.is_published ? "bg-green-500" : "bg-gray-400"
                  }`}
                  aria-hidden="true"
                />
                {lec.is_published
                  ? t("common.published")
                  : t("common.unpublished")}
              </span>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => onEditLecture(lec.id)}
                  className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200 motion-safe:transition"
                >
                  {th("lectureGrid.edit")}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenLectureAnalytics(lec.id)}
                  className="flex-1 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100 motion-safe:transition"
                >
                  {th("lectureGrid.openAnalytics")}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <InstructorProfileModal
        open={profileModalOpen}
        onClose={onCloseProfileModal}
        onSaved={onProfileSaved}
        initial={profileDraft ?? undefined}
      />
    </div>
  );
}
