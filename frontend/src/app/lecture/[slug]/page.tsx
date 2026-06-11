"use client";

import { useParams, useSearchParams } from "next/navigation";
import PlayerV2 from "@/components/player/PlayerV2";
import ProtectedRoute from "@/components/ProtectedRoute";
import AccessibilityPanel from "@/components/student/accessibility/AccessibilityPanel";
import { A11yProvider } from "@/components/student/accessibility/A11yContext";

/**
 * /lecture/[slug] — 영상 시청 페이지 (v2 다크 톤).
 *
 * v1 의 모놀리식 inline UI 를 분해해 PlayerV2(다크 surface 래퍼 + 상단바 +
 * 영상 + 컨트롤 + Q&A) / InterstitialQuiz / AttentionWarningV2 /
 * OnboardingFlowV2 컴포넌트로 옮겼다. 본 페이지 자체는 useParams 로 slug 만
 * 뽑아 PlayerV2 로 넘긴다.
 *
 * AccessibilityPanel 과 PlayerV2 는 **하나의 `A11yProvider`** 아래 둔다 — 예전엔
 * 패널이 자체 provider 를 들고 있어 토글이 플레이어(자막·글씨크기·고대비)에
 * 전혀 닿지 않았다. provider 를 여기로 올려 패널 토글이 곧 영상 설정이 되도록 한다.
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
      <A11yProvider>
        <PlayerV2 slug={slug} preview={preview} />
        <AccessibilityPanel />
      </A11yProvider>
    </ProtectedRoute>
  );
}
