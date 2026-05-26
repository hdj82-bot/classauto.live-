"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  fetchProfessorData,
  getCachedProfessorData,
} from "@/lib/professorData";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";
import { useAnalyticsI18n } from "@/components/professor/analytics/useAnalyticsI18n";
import EmptyState from "@/components/professor/analytics/EmptyState";
import {
  PageContainer,
  PageHeader,
  PrimaryButton,
  Card,
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
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    // 캐시가 없을 때만 스피너 — 재방문 시 캐시로 즉시 렌더하고 깜빡임을 막는다.
    if (getCachedProfessorData() === null) setLoading(true);

    (async () => {
      try {
        // 강좌·강의는 공유 캐시에서. 재시도(retry>0)는 강제로 새로 가져온다.
        const { courses: cs, lectures: lecs } =
          await fetchProfessorData<Lecture>({ force: retry > 0 });
        if (cancelled) return;
        setCourses(cs);
        setLectures(lecs);
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
    <PageContainer>
      <div lang={locale} />
      <PageHeader
        eyebrow="분석 리포트"
        title={t("indexTitle")}
        subtitle={t("indexSubtitle")}
        actions={
          lectures.length > 0 ? (
            <span
              style={{
                ...tabularStyle,
                fontSize: 12,
                color: "var(--text-subtle)",
              }}
            >
              {t("indexLectureCount", { count: lectures.length })}
            </span>
          ) : undefined
        }
      />

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
            <PrimaryButton variant="primary" size="md" onClick={handleCreate}>
              {t("indexEmptyCta")}
            </PrimaryButton>
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
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {lecs.map((lec) => (
                    <li key={lec.id}>
                      <Link
                        href={`/professor/analytics/${lec.id}`}
                        style={{ textDecoration: "none", display: "block", height: "100%" }}
                      >
                        <Card
                          padding={20}
                          radius={14}
                          interactive
                          style={{ display: "flex", flexDirection: "column", height: "100%" }}
                        >
                          <div className="flex items-start justify-between gap-2" style={{ marginBottom: 8 }}>
                            <h3
                              className="line-clamp-2"
                              style={{
                                margin: 0,
                                fontSize: 15,
                                fontWeight: 700,
                                color: "var(--text)",
                                letterSpacing: "-0.01em",
                              }}
                            >
                              {lec.title}
                            </h3>
                            <span
                              className="inline-flex flex-none items-center gap-1 rounded-full"
                              style={{
                                padding: "3px 8px",
                                fontSize: 10.5,
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
                                  background: lec.is_published ? "var(--success)" : "var(--text-faint)",
                                }}
                              />
                              {lec.is_published
                                ? t("indexCardPublished")
                                : t("indexCardDraft")}
                            </span>
                          </div>
                          <span
                            className="inline-flex items-center"
                            style={{
                              marginTop: "auto",
                              fontSize: 13,
                              fontWeight: 600,
                              color: "var(--gold)",
                            }}
                          >
                            {t("indexCardOpen")}
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{ marginLeft: 4 }}
                              aria-hidden="true"
                            >
                              <path d="M9 5l7 7-7 7" />
                            </svg>
                          </span>
                        </Card>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
