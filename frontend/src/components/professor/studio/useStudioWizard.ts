"use client";

import { useCallback, useState } from "react";
import type {
  ScriptSegment,
  SlideReviewStatus,
  StudioStep,
  TtsProvider,
  VoiceGender,
} from "./studioTypes";

/**
 * 마법사 단계와 사용자가 만든 결정을 한 곳에서 보관하는 훅.
 *
 * 페이지 분기(`/professor/studio` Step1 vs `/professor/studio/[lectureId]`
 * Step2~5) 가 있어도 이 훅이 단계 정보를 들고 있어 사용자가 새로고침해도
 * 단계 자체는 URL 이 책임진다. 컴포넌트 메모리는 검토 상태·아바타 선택 등
 * URL 에 두지 않을 결정에 한정.
 */

export interface StudioWizardState {
  step: StudioStep;
  // 슬라이드별 검토 결과 — slide_index → status. 진행률 표시·다음 단계 활성화에 사용.
  reviewByIndex: Record<number, SlideReviewStatus>;
  // 사용자가 직접 편집한 segments. 비어있으면 백엔드 GET /script 응답을 그대로 사용.
  editedSegments: ScriptSegment[] | null;
  selectedAvatarId: string | null;
  ttsProvider: TtsProvider;
  // 강의 단위 아바타·보이스 성별. 기본 male — Step3 의 토글에서 변경되며,
  // Step4 의 approve 직전에 PATCH /api/lectures/{id} 로 백엔드에 반영된다.
  voiceGender: VoiceGender;
  expiresAt: string | null;
  emailNotify: boolean;
}

const initialState: StudioWizardState = {
  step: 1,
  reviewByIndex: {},
  editedSegments: null,
  selectedAvatarId: null,
  ttsProvider: "elevenlabs",
  voiceGender: "male",
  expiresAt: null,
  emailNotify: false,
};

export function useStudioWizard(initialStep: StudioStep = 1) {
  const [state, setState] = useState<StudioWizardState>(() => ({
    ...initialState,
    step: initialStep,
  }));

  const goTo = useCallback((step: StudioStep) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  const setReview = useCallback(
    (slideIndex: number, status: SlideReviewStatus) => {
      setState((prev) => ({
        ...prev,
        reviewByIndex: { ...prev.reviewByIndex, [slideIndex]: status },
      }));
    },
    [],
  );

  const setEditedSegments = useCallback((segments: ScriptSegment[] | null) => {
    setState((prev) => ({ ...prev, editedSegments: segments }));
  }, []);

  const setSelectedAvatar = useCallback((avatarId: string | null) => {
    setState((prev) => ({ ...prev, selectedAvatarId: avatarId }));
  }, []);

  const setTtsProvider = useCallback((provider: TtsProvider) => {
    setState((prev) => ({ ...prev, ttsProvider: provider }));
  }, []);

  const setVoiceGender = useCallback((g: VoiceGender) => {
    setState((prev) => ({ ...prev, voiceGender: g }));
  }, []);

  const setExpiresAt = useCallback((iso: string | null) => {
    setState((prev) => ({ ...prev, expiresAt: iso }));
  }, []);

  const setEmailNotify = useCallback((on: boolean) => {
    setState((prev) => ({ ...prev, emailNotify: on }));
  }, []);

  return {
    state,
    goTo,
    setReview,
    setEditedSegments,
    setSelectedAvatar,
    setTtsProvider,
    setVoiceGender,
    setExpiresAt,
    setEmailNotify,
  };
}

// ── 도우미: 단계 진행률 계산 (StepIndicator 가 사용) ──────────────────────────

export function stepCompletionFraction(
  step: StudioStep,
  totalSlides: number,
  acceptedOrEditedCount: number,
): number {
  if (step === 1) return 0;
  if (step === 5) return 1;
  if (step === 4) return 0.85;
  if (step === 3) return 0.65;
  // step === 2 — 슬라이드 검토 진행도 비례.
  if (totalSlides <= 0) return 0.2;
  return 0.2 + Math.min(0.45, (acceptedOrEditedCount / totalSlides) * 0.45);
}
