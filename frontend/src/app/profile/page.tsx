"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import ProfileContent from "@/components/student/profile/ProfileContent";

/**
 * /profile — 학생 마이페이지.
 *
 * 정책 출처:
 *   - docs/planning/06-student-pages.md §9 (마이페이지 구성)
 *   - docs/design-system/colors.md §1 (학습자 화면 다크 강제)
 *   - docs/design-system/mascot.md §5.1 (마이페이지에서 마스코트 등장)
 *   - docs/planning/02-guardrails.md (학생 데이터 보호 정책)
 *
 * 학생 전용 라우트 — `ProtectedRoute` 가 비로그인/교수자 접근을 차단한다.
 * 페이지 본문 자체는 메타데이터를 받지 않는 client component (헤더 다크
 * 셸이 layout.tsx 의 light bg 를 덮어쓰기 위함).
 */
export default function ProfilePage() {
  return (
    <ProtectedRoute allowedRoles={["student"]}>
      <ProfileContent />
    </ProtectedRoute>
  );
}
