"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchProfessorData,
  getCachedProfessorData,
  type CourseLite,
} from "@/lib/professorData";
import CourseQrPanel from "@/components/professor/learners/CourseQrPanel";
import CourseRoster from "@/components/professor/learners/CourseRoster";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import PrivacyNotice from "@/components/professor/learners/PrivacyNotice";
import { useLearnersI18n } from "@/components/professor/learners/useLearnersI18n";
import {
  PageContainer,
  PageHeader,
  Card,
} from "@/components/professor/shell";

/** 강좌 카드에서 열 수 있는 패널. 한 번에 하나만 연다. */
type CoursePanel = "qr" | "roster";

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
  const [courses, setCourses] = useState<CourseLite[]>(
    () => getCachedProfessorData<Lecture>()?.courses ?? [],
  );
  const [lectures, setLectures] = useState<Lecture[]>(
    () => getCachedProfessorData<Lecture>()?.lectures ?? [],
  );
  const [loading, setLoading] = useState(
    () => getCachedProfessorData<Lecture>() === null,
  );
  const [error, setError] = useState(false);
  // 강좌별로 열려 있는 패널. 한 번에 하나만 열어 카드가 길어지지 않게 한다.
  const [openPanel, setOpenPanel] = useState<Record<string, CoursePanel | null>>(
    {},
  );
  const togglePanel = (courseId: string, panel: CoursePanel) =>
    setOpenPanel((prev) => ({
      ...prev,
      [courseId]: prev[courseId] === panel ? null : panel,
    }));

  useEffect(() => {
    let cancelled = false;
    setError(false);
    // 캐시가 없을 때만 스피너 — 재방문 시 캐시로 즉시 렌더.
    if (getCachedProfessorData() === null) setLoading(true);
    (async () => {
      try {
        const { courses: cs, lectures: lecs } =
          await fetchProfessorData<Lecture>();
        if (cancelled) return;
        setCourses(cs);
        setLectures(lecs);
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
    const byCourse = new Map<string, { course: CourseLite; lectures: Lecture[] }>();
    for (const c of courses) byCourse.set(c.id, { course: c, lectures: [] });
    for (const l of lectures) {
      const cid = l.course_id;
      if (cid && byCourse.has(cid)) {
        byCourse.get(cid)!.lectures.push(l);
      }
    }
    // 강의가 0개인 강좌도 남긴다 — 학기 초에 QR 을 띄워 수강 등록을 먼저 받는 것이
    // 정상 순서다(스펙 15 §1.1). 종전에는 강의가 있어야만 강좌가 보였다.
    return Array.from(byCourse.values());
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
                <div className="min-w-0">
                  <p style={{ margin: 0, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", fontWeight: 700, color: "var(--text-faint)" }}>
                    {t("courseLabel")}
                  </p>
                  <h2 style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                    {course.title}
                  </h2>
                </div>
                {/* 강좌 단위 도구 — 새 메뉴를 만들지 않고 이 카드 안에 둔다. */}
                <div className="flex shrink-0 gap-2">
                  {/* slug 는 백엔드 배포 전이면 없다. 그때는 QR 버튼만 빠진다. */}
                  {course.slug && (
                    <button
                      type="button"
                      onClick={() => togglePanel(course.id, "qr")}
                      aria-expanded={openPanel[course.id] === "qr"}
                      style={panelBtn(openPanel[course.id] === "qr")}
                      data-testid={`course-qr-toggle-${course.id}`}
                    >
                      {t("courseQrButton")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => togglePanel(course.id, "roster")}
                    aria-expanded={openPanel[course.id] === "roster"}
                    style={panelBtn(openPanel[course.id] === "roster")}
                    data-testid={`course-roster-toggle-${course.id}`}
                  >
                    {t("courseRosterButton")}
                  </button>
                </div>
              </header>

              {openPanel[course.id] === "qr" && course.slug && (
                <CourseQrPanel courseSlug={course.slug} courseTitle={course.title} />
              )}
              {openPanel[course.id] === "roster" && (
                <CourseRoster courseId={course.id} />
              )}
              {lecs.length === 0 ? (
                <p
                  style={{
                    margin: 0,
                    padding: "14px 20px",
                    fontSize: 12,
                    color: "var(--text-subtle)",
                    borderTop: "1px solid var(--line)",
                  }}
                  data-testid={`learners-course-empty-${course.id}`}
                >
                  {t("courseNoLectures")}
                </p>
              ) : (
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
              )}
            </Card>
          ))}
        </section>
      )}
      </div>
    </PageContainer>
  );
}

/** 강좌 카드 헤더의 패널 토글. 열려 있으면 골드로 눌린 상태를 드러낸다. */
function panelBtn(active: boolean) {
  return {
    padding: "6px 11px",
    fontSize: 11.5,
    fontWeight: 600,
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 140ms var(--ease-out)",
    color: active ? "var(--gold)" : "var(--text-muted)",
    background: active ? "var(--gold-soft)" : "var(--bg-card)",
    border: `1px solid ${active ? "var(--gold-medium)" : "var(--line)"}`,
  } as const;
}
