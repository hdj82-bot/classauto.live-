"use client";

import { useSearchParams } from "next/navigation";
import StudentSurfaceLight from "@/components/student/v2/StudentSurfaceLight";
import SignupWizard from "@/components/student/v2/SignupWizard";

/**
 * /auth/signup — 학생 측 가입 페이지 (v2).
 *
 * 디자인 출처: docs/prototypes/06-student-flow.html SCREEN 2 (3단계 마법사).
 * 가입 흐름 명세: docs/planning/06-student-pages.md §4.
 *
 * 페이지 자체는 매우 얇은 래퍼 — 실제 마법사 UI 는 SignupWizard 가 담당.
 * 본 페이지는 라이트 톤 surface(브랜드바 + aurora 배경) 만 제공한다.
 */
export default function SignupContent() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? undefined;

  return (
    <StudentSurfaceLight>
      <SignupWizard next={next} />
    </StudentSurfaceLight>
  );
}
