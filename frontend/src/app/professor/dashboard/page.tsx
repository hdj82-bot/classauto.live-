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
  const { t: tp } = useProfessorI18n();
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
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {t("professor.lectureManage")}
        </h1>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setProfileModalOpen(true)}
            className="hidden sm:inline-flex items-center text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-2 transition"
          >
            {tp("openProfile")}
          </button>
          <button
            onClick={handleCreateLecture}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5 py-2.5 text-sm font-medium transition w-full sm:w-auto"
          >
            {t("professor.createLecture")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {lectures.map((lec) => (
          <article
            key={lec.id}
            className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition group"
          >
            <h3 className="font-semibold text-gray-900 mb-2 truncate">
              {lec.title}
            </h3>
            <span
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                lec.is_published
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  lec.is_published ? "bg-green-500" : "bg-gray-400"
                }`}
                aria-hidden="true"
              />
              {lec.is_published ? t("common.published") : t("common.unpublished")}
            </span>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => router.push(`/professor/lecture/${lec.id}`)}
                className="flex-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg px-3 py-2 transition font-medium"
              >
                {t("professor.editScript")}
              </button>
              <button
                onClick={() =>
                  router.push(`/professor/lecture/${lec.id}/dashboard`)
                }
                className="flex-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg px-3 py-2 transition font-medium"
              >
                {t("professor.analytics")}
              </button>
            </div>
          </article>
        ))}
      </div>

      <InstructorProfileModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        onSaved={handleProfileSaved}
        initial={profileDraft ?? undefined}
      />
    </div>
  );
}
