"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import PrivacyNotice from "@/components/professor/learners/PrivacyNotice";
import { useLearnersI18n } from "@/components/professor/learners/useLearnersI18n";
import {
  PageContainer,
  PageHeader,
  Card,
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
    <PageContainer>
      <div className="space-y-6" data-testid="learners-index-page">
      <PageHeader
        eyebrow="학습자 관리"
        title={t("indexTitle")}
        subtitle={t("indexSubtitle")}
      />

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
          <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>
            {t("selectLecturePrompt")}
          </p>
          {grouped.map(({ course, lectures: lecs }) => (
            <Card key={course.id} padding={0} radius={14} role="article" data-testid={`learners-course-${course.id}`}>
              <header
                className="flex items-center justify-between"
                style={{
                  padding: "12px 20px",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <div>
                  <p style={{ margin: 0, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", fontWeight: 700, color: "var(--text-faint)" }}>
                    {t("courseLabel")}
                  </p>
                  <h2 style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                    {course.title}
                  </h2>
                </div>
              </header>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {lecs.map((l, i) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between"
                    style={{
                      padding: "12px 20px",
                      borderTop: i === 0 ? "none" : "1px solid var(--line)",
                      transition: "background 140ms var(--ease-out)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div className="min-w-0">
                      <p style={{ margin: 0, fontSize: 13, color: "var(--text)" }}>{l.title}</p>
                      <span
                        className="inline-flex items-center gap-1 rounded-full"
                        style={{
                          marginTop: 4,
                          padding: "2px 7px",
                          fontSize: 10,
                          fontWeight: 600,
                          color: l.is_published ? "var(--success)" : "var(--text-subtle)",
                          background: l.is_published
                            ? "rgba(16, 185, 129, 0.10)"
                            : "var(--bg-subtle)",
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: 999,
                            background: l.is_published ? "var(--success)" : "var(--text-faint)",
                          }}
                        />
                        {l.is_published ? t("publishedBadge") : t("unpublishedBadge")}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => router.push(`/professor/learners/${l.id}`)}
                      style={{
                        flexShrink: 0,
                        padding: "6px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--gold)",
                        background: "var(--gold-soft)",
                        border: "1px solid var(--gold-medium)",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "all 140ms var(--ease-out)",
                      }}
                      data-testid={`learners-open-${l.id}`}
                    >
                      {t("openLectureLearners")} →
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </section>
      )}
      </div>
    </PageContainer>
  );
}
