"use client";

import { useParams, useSearchParams } from "next/navigation";
import PlayerV2 from "@/components/player/PlayerV2";
import ProtectedRoute from "@/components/ProtectedRoute";
import AccessibilityPanel from "@/components/student/accessibility/AccessibilityPanel";

/**
 * /lecture/[slug] — 영상 시청 페이지 (v2 다크 톤).
 *
 * v1 의 모놀리식 inline UI 를 분해해 PlayerV2(다크 surface 래퍼 + 상단바 +
 * 영상 + 컨트롤 + Q&A) / InterstitialQuiz / AttentionWarningV2 /
 * OnboardingFlowV2 컴포넌트로 옮겼다. 본 페이지 자체는 useParams 로 slug 만
 * 뽑아 PlayerV2 로 넘긴다.
 *
 * AccessibilityPanel 은 v1 의 mount 위치(글로벌 단축키 + 접근성 토글)를 그대로
 * 보존 — feat/profile-a11y 의 단일 mount 약속을 유지.
 */
export default function LectureViewerPage() {
  const params = useParams<{ slug: string | string[] }>();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  // ?preview=1 → 교수자 미리보기(세션·집중도 추적 없이 결과물 검토).
  const searchParams = useSearchParams();
  const preview = searchParams.get("preview") === "1";

  if (!slug) {
    return null;
  }

  return (
    <ProtectedRoute>
      <PlayerV2 slug={slug} preview={preview} />
      <AccessibilityPanel />
    </ProtectedRoute>
  );
}
