"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";
import { useAnalyticsI18n } from "@/components/professor/analytics/useAnalyticsI18n";
import EmptyState from "@/components/professor/analytics/EmptyState";

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
 * 교수자 분석 인덱스 — 강의 카드 그리드.
 *
 * 데이터 흐름은 `/professor/dashboard` 와 동일 (courses → lectures fan-out).
 * 강의 카드 클릭 시 `/professor/analytics/{lectureId}` 로 이동한다.
 *
 * - 강의 0개: EmptyState + "첫 강의 만들기" CTA.
 * - 로드 실패: Toast 에 의존하지 않고 본 페이지에서 직접 에러 박스 + 재시도.
 *
 * `prefers-reduced-motion` 사용자에게 카운트업·페이드인을 적용하지 않기 위해
 * 모든 모션은 Tailwind `motion-safe:` modifier 로 감싼다.
 */
export default function ProfessorAnalyticsIndexPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const { t } = useAnalyticsI18n();

  const [courses, setCourses] = useState<Course[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { data: cs } = await api.get<Course[]>("/api/courses");
        if (cancelled) return;
        setCourses(cs);

        const all: Lecture[] = [];
        for (const c of cs) {
          const { data: lecs } = await api.get<Lecture[]>(
            `/api/courses/${c.id}/lectures`,
          );
          all.push(...lecs.map((l) => ({ ...l, course_id: c.id })));
        }
        if (cancelled) return;
        setLectures(all);
      } catch {
        if (!cancelled) setError(t("indexLoadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [retry, t]);

  const lecturesByCourse = useMemo(() => {
    const map = new Map<string, Lecture[]>();
    for (const l of lectures) {
      const k = l.course_id ?? "uncategorized";
      const arr = map.get(k);
      if (arr) arr.push(l);
      else map.set(k, [l]);
    }
    return map;
  }, [lectures]);

  const handleCreate = useCallback(() => {
    router.push("/professor/lecture/new");
  }, [router]);

  if (loading) {
    return <LoadingSpinner fullScreen label={t("indexLoading")} />;
  }

  return (
    <div lang={locale}>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("indexTitle")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("indexSubtitle")}</p>
        {lectures.length > 0 && (
          <p className="mt-2 text-xs text-gray-400 tabular-nums">
            {t("indexLectureCount", { count: lectures.length })}
          </p>
        )}
      </header>

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRetry((n) => n + 1)}
            className="mt-2 inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
          >
            {t("lectureRetry")}
          </button>
        </div>
      )}

      {!error && lectures.length === 0 ? (
        <EmptyState
          title={t("indexEmptyTitle")}
          description={t("indexEmptyDesc")}
          action={
            <button
              type="button"
              onClick={handleCreate}
              className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 motion-safe:transition"
            >
              {t("indexEmptyCta")}
            </button>
          }
        />
      ) : (
        <div className="space-y-8">
          {Array.from(lecturesByCourse.entries()).map(([courseId, lecs]) => {
            const course = courses.find((c) => c.id === courseId);
            return (
              <section key={courseId}>
                {course && (
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    {course.title}
                  </h2>
                )}
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {lecs.map((lec) => (
                    <li key={lec.id}>
                      <Link
                        href={`/professor/analytics/${lec.id}`}
                        className="group flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 motion-safe:transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <h3 className="line-clamp-2 font-semibold text-gray-900">
                            {lec.title}
                          </h3>
                          <span
                            className={`inline-flex flex-none items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                              lec.is_published
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`h-1.5 w-1.5 rounded-full ${
                                lec.is_published
                                  ? "bg-green-500"
                                  : "bg-gray-400"
                              }`}
                            />
                            {lec.is_published
                              ? t("indexCardPublished")
                              : t("indexCardDraft")}
                          </span>
                        </div>
                        <span className="mt-auto inline-flex items-center text-sm font-medium text-indigo-600 group-hover:text-indigo-700">
                          {t("indexCardOpen")}
                          <svg
                            className="ml-1 h-4 w-4 motion-safe:transition-transform group-hover:translate-x-0.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
