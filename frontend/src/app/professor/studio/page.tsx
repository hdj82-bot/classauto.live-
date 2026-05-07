"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import StepIndicator from "@/components/professor/studio/StepIndicator";
import Step1PptUpload from "@/components/professor/studio/Step1PptUpload";
import { useStudioI18n } from "@/components/professor/studio/useStudioI18n";
import type { Course } from "@/components/professor/studio/studioTypes";

/**
 * /professor/studio — 영상 제작 마법사 진입 페이지 (Step 1).
 *
 * 강좌 선택/생성 + 강의 생성 + .pptx 업로드 → 백엔드가 task_id 발급한
 * 시점에 `/professor/studio/[lectureId]` 로 라우팅. 거기서 Step 2~5 진행.
 *
 * 이 페이지는 기존 `/professor/lecture/new` 와 공존한다 — `lecture/new` 는
 * 단순 폼, `studio` 는 5단계 마법사 entry. 통합 PR 시점에 dashboard CTA 를
 * studio 로 이전할지는 별도 결정.
 */
export default function StudioEntryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useStudioI18n();

  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<Course[]>("/api/courses");
        if (!cancelled) setCourses(data);
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
        // 1) 새 강좌 생성 또는 기존 사용
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

        // 2) 강의 생성
        const { data: lecture } = await api.post<{ id: string }>(
          "/api/lectures",
          {
            course_id: resolvedCourseId,
            title,
            description: description || undefined,
          },
        );

        // 3) PPT 업로드 → 파이프라인 시작
        const formData = new FormData();
        formData.append("file", file);
        await api.post(
          `/api/v1/render/upload?lecture_id=${lecture.id}`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } },
        );

        // 4) 다음 단계로 이동
        router.push(`/professor/studio/${lecture.id}?step=2`);
      } catch {
        toast(t("step1.errors.uploadFailed"), "error");
      } finally {
        setSubmitting(false);
      }
    };

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold text-gray-900"
          style={{ fontFamily: "'Paperlogy', 'Pretendard Variable', sans-serif" }}
        >
          {t("pageTitle")}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{t("pageSubtitle")}</p>
      </header>

      <StepIndicator current={1} />

      {coursesLoading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8">
          <LoadingSpinner label={t("common.loading")} />
        </div>
      ) : (
        <Step1PptUpload
          courses={courses}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
