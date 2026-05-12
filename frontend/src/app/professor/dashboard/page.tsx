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
  useDashboardHubI18n,
  aggregateDashboardHub,
  type DashboardHubData,
} from "@/components/professor/dashboardHome";
import {
  PageContainer,
  PageHeader,
  PrimaryButton,
  Card,
  MonthlyQuotaMeter,
  displayStyle,
  hanStyle,
  tabularStyle,
} from "@/components/professor/shell";

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
 * 교수자 대시보드 — v2 디자인 (라이트 베이지 + 골드).
 *
 * 데이터 wiring 은 그대로 보존하고 시각만 v2 prototype 톤으로 교체.
 * docs/prototypes/05-studio-flow.extracted.html 의 topbar 는 layout.tsx 의
 * AppShell 이 제공하고, 본 페이지는 PageContainer + PageHeader + StatGrid
 * + MainChart + AttentionWidget + MonthlyQuotaMeter + Donut + ActivityFeed
 * + 최근 강의 그리드 순으로 구성한다.
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
  const [courses, setCourses] = useState<Course[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 학과·소속 정보 — 모달 제출 시 채워짐.
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
    router.push("/professor/studio");
  }, [router]);

  const handleOpenSampleDemo = useCallback(() => {
    if (typeof window === "undefined") return;
    window.open("/demo", "_blank", "noopener,noreferrer");
  }, []);

  const handleProfileSaved = useCallback((profile: InstructorProfileDraft) => {
    setProfileDraft(profile);
  }, []);

  const [hub, setHub] = useState<DashboardHubData | null>(null);
  const [hubLoading, setHubLoading] = useState(false);

  useEffect(() => {
    if (lectures.length === 0) return;
    let cancelled = false;
    setHubLoading(true);

    (async () => {
      const ids = lectures.map((l) => l.id);

      const [attendanceR, scoresR, engagementR, qaR, costR] = await Promise.all(
        [
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
          onOpenProfileModal={() => setProfileModalOpen(true)}
          onOpenSampleDemo={handleOpenSampleDemo}
        />
        <InstructorProfileModal
          open={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          onSaved={handleProfileSaved}
          initial={profileDraft ?? undefined}
        />
      </PageContainer>
    );
  }

  return (
    <DashboardHomeView
      lectures={lectures}
      hub={hub}
      hubLoading={hubLoading}
      onCreateLecture={handleCreateLecture}
      onOpenProfile={() => setProfileModalOpen(true)}
      onJumpToInbox={() => router.push("/professor/inbox")}
      onOpenLectureAnalytics={(id) => router.push(`/professor/analytics/${id}`)}
      onEditLecture={(id) => router.push(`/professor/lecture/${id}`)}
      profileModalOpen={profileModalOpen}
      onCloseProfileModal={() => setProfileModalOpen(false)}
      onProfileSaved={handleProfileSaved}
      profileDraft={profileDraft}
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

  const eyebrow = profileDraft?.school
    ? `${profileDraft.school}${profileDraft.department ? " · " + profileDraft.department : ""}`
    : "ClassAuto";

  const titleNode = profileDraft?.school
    ? th("greetingNamed", { name: profileDraft.school })
    : th("greetingDefault");

  return (
    <PageContainer>
      <PageHeader
        eyebrow={eyebrow}
        title={titleNode}
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
            <button
              type="button"
              onClick={onOpenProfile}
              className="hidden sm:inline-flex items-center rounded-lg motion-safe:transition"
              style={{
                padding: "8px 14px",
                fontSize: 12.5,
                fontWeight: 500,
                color: "var(--text-muted)",
                background: "transparent",
                border: "1px solid var(--line)",
                cursor: "pointer",
              }}
            >
              {tp("openProfile")}
            </button>
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

      {/* §4.3 메인 차트 (2/3) + §4.4 우측 위젯 (1/3) */}
      <div
        className="grid grid-cols-1 gap-4 lg:grid-cols-3"
        style={{ marginBottom: 28 }}
      >
        <div className="lg:col-span-2">
          {hub ? (
            <MainChart series={hub.mainChart} />
          ) : (
            <Card padding={32}>
              <p
                className="text-center"
                style={{ color: "var(--text-muted)" }}
              >
                {hubLoading ? "..." : th("loadError")}
              </p>
            </Card>
          )}
        </div>
        <div className="space-y-4">
          {hub && <AttentionWidget data={hub.attention} />}
          {hub && (
            <MonthlyQuotaMeter
              used={hub.stats.monthlyVideoCount}
              limit={hub.stats.monthlyVideoLimit ?? null}
              planName={hub.stats.monthlyVideoLimit === 20 ? "Pro" : undefined}
            />
          )}
        </div>
      </div>

      {/* 도넛 + 활동 피드 */}
      <div
        className="grid grid-cols-1 gap-4 lg:grid-cols-3"
        style={{ marginBottom: 28 }}
      >
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

      {/* §4.5 최근 강의 영상 그리드 */}
      <section aria-labelledby="recent-lectures-title">
        <header
          className="flex items-center justify-between"
          style={{ marginBottom: 14 }}
        >
          <h2
            id="recent-lectures-title"
            style={{
              ...displayStyle,
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            {th("lectureGrid.title")}
          </h2>
          {lectures.length > 4 && (
            <span
              style={{
                ...tabularStyle,
                fontSize: 11.5,
                color: "var(--text-subtle)",
              }}
            >
              {th("lectureGrid.more", { count: lectures.length - 4 })}
            </span>
          )}
        </header>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {lectures.slice(0, 4).map((lec) => (
            <Card
              key={lec.id}
              padding={20}
              radius={14}
              interactive
              role="article"
            >
              <LectureTitle title={lec.title} />
              <span
                className="inline-flex items-center gap-1.5 rounded-full"
                style={{
                  marginTop: 8,
                  padding: "3px 9px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: lec.is_published ? "var(--success)" : "var(--text-subtle)",
                  background: lec.is_published
                    ? "rgba(16, 185, 129, 0.10)"
                    : "var(--bg-subtle)",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: lec.is_published
                      ? "var(--success)"
                      : "var(--text-faint)",
                  }}
                />
                {lec.is_published
                  ? t("common.published")
                  : t("common.unpublished")}
              </span>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => onEditLecture(lec.id)}
                  className="flex-1 rounded-lg motion-safe:transition"
                  style={{
                    padding: "8px 12px",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text-muted)",
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--line)",
                    cursor: "pointer",
                  }}
                >
                  {th("lectureGrid.edit")}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenLectureAnalytics(lec.id)}
                  className="flex-1 rounded-lg motion-safe:transition"
                  style={{
                    padding: "8px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--gold)",
                    background: "var(--gold-soft)",
                    border: "1px solid var(--gold-medium)",
                    cursor: "pointer",
                  }}
                >
                  {th("lectureGrid.openAnalytics")}
                </button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <InstructorProfileModal
        open={profileModalOpen}
        onClose={onCloseProfileModal}
        onSaved={onProfileSaved}
        initial={profileDraft ?? undefined}
      />
    </PageContainer>
  );
}

/**
 * 강의 제목 표시 — 한자가 있으면 `.han` 스타일(serif + gold) 로 강조.
 *
 * docs/design-system/typography.md §1.1 / colors.md §4.
 * 한자 매칭: U+3400–U+4DBF, U+4E00–U+9FFF (CJK 통합/확장 A).
 */
function LectureTitle({ title }: { title: string }) {
  const han = /[㐀-䶿一-鿿]/;
  const parts: { text: string; han: boolean }[] = [];
  let buf = "";
  let isHan = false;
  for (const ch of title) {
    const ch_is_han = han.test(ch);
    if (ch_is_han !== isHan && buf) {
      parts.push({ text: buf, han: isHan });
      buf = "";
    }
    isHan = ch_is_han;
    buf += ch;
  }
  if (buf) parts.push({ text: buf, han: isHan });

  return (
    <h3
      className="truncate"
      style={{
        margin: 0,
        fontSize: 15,
        fontWeight: 700,
        color: "var(--text)",
        letterSpacing: "-0.01em",
      }}
    >
      {parts.map((p, i) =>
        p.han ? (
          <span key={i} style={hanStyle}>
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </h3>
  );
}
