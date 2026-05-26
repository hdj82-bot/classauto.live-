"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import StepIndicator from "@/components/professor/studio/StepIndicator";
import Step1PptUpload from "@/components/professor/studio/Step1PptUpload";
import { useStudioI18n } from "@/components/professor/studio/useStudioI18n";
import type { Course } from "@/components/professor/studio/studioTypes";
import {
  PageContainer,
  PageHeader,
  Card,
} from "@/components/professor/shell";

/**
 * /professor/studio — 영상 제작 마법사 진입 페이지 (Step 1).
 *
 * v2 디자인 — 라이트 카드 위 폼 + prototype dropzone 패턴. AppShell 의 focused
 * 변형으로 sidebar 가 없으므로 본 페이지는 좁은 컬럼(narrow) 으로 가운데 정렬.
 *
 * 강좌 선택/생성 + 강의 생성 + .pptx 업로드 → 백엔드가 task_id 발급한 시점에
 * `/professor/studio/[lectureId]` 로 라우팅. 거기서 Step 2~5 진행.
 *
 * 본 페이지는 `/professor/lecture/new` 와 공존한다 — `lecture/new` 는
 * 단순 폼, `studio` 는 5단계 마법사 entry.
 */
export default function StudioEntryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useStudioI18n();

  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // 최근 작업 강의(이어서 작업하기) — 강좌별 강의를 모아 최신순 상위 몇 개.
  const [recent, setRecent] = useState<
    { id: string; title: string; courseTitle: string }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: cs } = await api.get<Course[]>("/api/courses");
        if (cancelled) return;
        setCourses(cs);
        const perCourse = await Promise.all(
          cs.map(async (c) => {
            try {
              const { data } = await api.get<
                {
                  id: string;
                  title: string;
                  created_at?: string;
                  updated_at?: string;
                }[]
              >(`/api/courses/${c.id}/lectures`);
              return data.map((l) => ({
                id: l.id,
                title: l.title,
                courseTitle: c.title,
                ts: Date.parse(l.updated_at || l.created_at || "") || 0,
              }));
            } catch {
              return [];
            }
          }),
        );
        if (cancelled) return;
        const flat = perCourse.flat().sort((a, b) => b.ts - a.ts);
        setRecent(
          flat.slice(0, 4).map(({ id, title, courseTitle }) => ({
            id,
            title,
            courseTitle,
          })),
        );
      } catch {
        if (!cancelled) setCourses([]);
      } finally {
        if (!cancelled) setCoursesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit: React.ComponentProps<typeof Step1PptUpload>["onSubmit"] =
    async ({ courseId, newCourseTitle, title, description, file }) => {
      setSubmitting(true);
      try {
        let resolvedCourseId = courseId;
        if (!resolvedCourseId && newCourseTitle) {
          const { data: course } = await api.post<{ id: string }>(
            "/api/courses",
            { title: newCourseTitle },
          );
          resolvedCourseId = course.id;
        }
        if (!resolvedCourseId) {
          toast(t("step1.errors.courseCreate"), "error");
          return;
        }

        const { data: lecture } = await api.post<{ id: string }>(
          "/api/lectures",
          {
            course_id: resolvedCourseId,
            title,
            description: description || undefined,
          },
        );

        const formData = new FormData();
        formData.append("file", file);
        await api.post(
          `/api/v1/render/upload?lecture_id=${lecture.id}`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } },
        );

        router.push(`/professor/studio/${lecture.id}?step=2`);
      } catch {
        toast(t("step1.errors.uploadFailed"), "error");
      } finally {
        setSubmitting(false);
      }
    };

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="STUDIO"
        title={t("pageTitle")}
        subtitle={t("pageSubtitle")}
      />

      {!coursesLoading && recent.length > 0 && (
        <div
          style={{
            marginBottom: 24,
            padding: 16,
            borderRadius: 14,
            border: "1px solid var(--line)",
            background: "var(--bg-card)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <h3
            style={{
              margin: "0 0 10px",
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text)",
            }}
          >
            이어서 작업하기
          </h3>
          <div className="flex flex-col gap-1.5">
            {recent.map((l) => (
              <Link
                key={l.id}
                href={`/professor/studio/${l.id}`}
                className="flex items-center justify-between gap-2"
                style={{
                  padding: "9px 12px",
                  borderRadius: 9,
                  border: "1px solid var(--line)",
                  background: "var(--bg)",
                  textDecoration: "none",
                }}
              >
                <span
                  className="truncate"
                  style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}
                >
                  {l.title}
                </span>
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 11.5,
                    color: "var(--gold-on-light, #B88308)",
                    fontWeight: 600,
                  }}
                >
                  {l.courseTitle} · 이어서 →
                </span>
              </Link>
            ))}
          </div>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 11.5,
              color: "var(--text-subtle)",
            }}
          >
            아래에서 새 강의를 만들 수도 있어요.
          </p>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <StepIndicator current={1} />
      </div>

      {coursesLoading ? (
        <Card padding={40}>
          <LoadingSpinner label={t("common.loading")} />
        </Card>
      ) : (
        <Step1PptUpload
          courses={courses}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
      )}
    </PageContainer>
  );
}
