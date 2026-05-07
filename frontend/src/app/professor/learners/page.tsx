"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import PrivacyNotice from "@/components/professor/learners/PrivacyNotice";
import { useLearnersI18n } from "@/components/professor/learners/useLearnersI18n";

interface Course {
  id: string;
  title: string;
}

interface Lecture {
  id: string;
  title: string;
  slug: string;
  is_published: boolean;
  course_id?: string;
}

/**
 * /professor/learners — 강의 선택 진입점.
 *
 * 강의별 학습자 데이터는 dashboard 시리즈 endpoint
 * (`/api/v1/dashboard/{lectureId}/{attendance|engagement|...}`) 에서 파생되므로
 * 우선 강의를 골라야 한다. 강좌 → 강의 트리 형태로 묶어 노출한다.
 *
 * **백엔드 미흡** — 단일 endpoint `GET /api/v1/courses/{id}/learners` 또는
 * `GET /api/v1/professors/me/learners` 가 있으면 이 중간 진입점을 생략하고
 * 곧장 통합 학습자 보드를 노출할 수 있다 (BACKEND_ASKS.LEARNERS.md §1).
 */
export default function LearnersIndexPage() {
  const router = useRouter();
  const { t } = useLearnersI18n();
  const [courses, setCourses] = useState<Course[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(false);
        const { data: cs } = await api.get<Course[]>("/api/courses");
        if (cancelled) return;
        setCourses(cs);
        const all: Lecture[] = [];
        for (const c of cs) {
          const { data: lecs } = await api.get<Lecture[]>(
            `/api/courses/${c.id}/lectures`,
          );
          for (const l of lecs) all.push({ ...l, course_id: c.id });
        }
        if (cancelled) return;
        setLectures(all);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const byCourse = new Map<string, { course: Course; lectures: Lecture[] }>();
    for (const c of courses) byCourse.set(c.id, { course: c, lectures: [] });
    for (const l of lectures) {
      const cid = l.course_id;
      if (cid && byCourse.has(cid)) {
        byCourse.get(cid)!.lectures.push(l);
      }
    }
    return Array.from(byCourse.values()).filter(
      (g) => g.lectures.length > 0,
    );
  }, [courses, lectures]);

  if (loading) return <LoadingSpinner fullScreen label={t("loading")} />;

  return (
    <div className="space-y-6" data-testid="learners-index-page">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">{t("indexTitle")}</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
          {t("indexSubtitle")}
        </p>
      </header>

      <PrivacyNotice />

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"
        >
          {t("loadError")}
        </div>
      ) : grouped.length === 0 ? (
        <div
          data-testid="learners-no-lectures"
          className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500"
        >
          {t("noLectures")}
        </div>
      ) : (
        <section className="space-y-5">
          <p className="text-sm font-medium text-gray-700">
            {t("selectLecturePrompt")}
          </p>
          {grouped.map(({ course, lectures: lecs }) => (
            <article
              key={course.id}
              className="rounded-2xl border border-gray-200 bg-white"
              data-testid={`learners-course-${course.id}`}
            >
              <header className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">
                    {t("courseLabel")}
                  </p>
                  <h2 className="text-sm font-semibold text-gray-900">
                    {course.title}
                  </h2>
                </div>
              </header>
              <ul className="divide-y divide-gray-100">
                {lecs.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 truncate">{l.title}</p>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-1 ${
                          l.is_published
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        <span
                          className={`w-1 h-1 rounded-full ${
                            l.is_published ? "bg-emerald-500" : "bg-gray-400"
                          }`}
                          aria-hidden="true"
                        />
                        {l.is_published
                          ? t("publishedBadge")
                          : t("unpublishedBadge")}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => router.push(`/professor/learners/${l.id}`)}
                      className="shrink-0 text-xs font-medium rounded-lg px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition"
                      data-testid={`learners-open-${l.id}`}
                    >
                      {t("openLectureLearners")} →
                    </button>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
