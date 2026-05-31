"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/professor/shell";
import { useToast } from "@/components/ui/Toast";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useReducedMotion } from "@/components/professor/avatars/useReducedMotion";
import { usePhotoAvatarI18n } from "@/components/professor/avatars/onboarding/usePhotoAvatarI18n";
import { usePhotoAvatarFlow } from "@/components/professor/avatars/onboarding/usePhotoAvatarFlow";
import OnboardingStepper from "@/components/professor/avatars/onboarding/OnboardingStepper";
import PhotoUploadStep from "@/components/professor/avatars/onboarding/PhotoUploadStep";
import LookGenerateStep from "@/components/professor/avatars/onboarding/LookGenerateStep";
import LookSelectStep from "@/components/professor/avatars/onboarding/LookSelectStep";
import PreviewConfirmStep from "@/components/professor/avatars/onboarding/PreviewConfirmStep";
import type {
  LookGenerateInput,
  OnboardingStep,
} from "@/components/professor/avatars/onboarding/photoAvatarTypes";

/**
 * /professor/avatars/onboarding — 교수자 본인 아바타 온보딩 (v0.2 압축).
 *
 * docs/planning/12-self-avatar-onboarding.md §0.3 의 train 없는 흐름을 구현한다:
 * ① 사진 업로드(provider=gpt 는 즉시 ready) → ② 구조화 옵션으로 룩 배치 생성 →
 * ③ 기본 룩 선택 → ④ 본인 목소리로 움직이는 미리보기 → 확정.
 *
 * 디자인: 라이트 베이지 + 골드(design-system v2). 음성 클론은 기존 기능을
 * 재사용한다. 백엔드(§7 계약)가 미배포면 photoAvatarApi 가 mock 으로 폴백해
 * 화면 전체가 동작한다. 단계는 서버 상태로 복원되어 localStorage 없이도
 * 새로고침 후 이어진다.
 */
export default function PhotoAvatarOnboardingPage() {
  const router = useRouter();
  const { t } = usePhotoAvatarI18n();
  const { toast } = useToast();
  const reducedMotion = useReducedMotion();
  const flow = usePhotoAvatarFlow();

  const selectedLook =
    flow.looks.find((l) => l.look_id === flow.selectedLookId) ?? null;

  const reachable = useCallback(
    (step: OnboardingStep): boolean => {
      switch (step) {
        case "upload":
          return true;
        case "generate":
          return flow.group.status === "ready";
        case "select":
          return flow.looks.some((l) => l.status === "ready");
        default:
          return false;
      }
    },
    [flow.group.status, flow.looks],
  );

  const handleGenerate = useCallback(
    async (input: LookGenerateInput) => {
      try {
        await flow.generate(input);
      } catch {
        toast(t("looks.error"), "error");
      }
    },
    [flow, toast, t],
  );

  const handleSelect = useCallback(
    async (lookId: string) => {
      try {
        await flow.select(lookId);
      } catch {
        toast(t("select.error"), "error");
      }
    },
    [flow, toast, t],
  );

  const handleConfirm = useCallback(() => {
    toast(t("preview.confirmed"), "success");
    router.push("/professor/avatars");
  }, [toast, t, router]);

  return (
    <PageContainer>
      <div className="space-y-6" data-testid="photo-avatar-onboarding">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
          actions={
            <button
              type="button"
              onClick={() => router.push("/professor/avatars")}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 10,
                border: "1px solid var(--line-strong)",
                background: "var(--bg-card)",
                color: "var(--text)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
              data-testid="onboarding-exit"
            >
              {t("exitToGallery")}
            </button>
          }
        />

        {flow.deferred && (
          <div
            role="status"
            data-testid="onboarding-deferred-banner"
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--gold-on-light)",
              background: "var(--gold-soft)",
              border: "1px solid var(--gold-medium)",
            }}
          >
            {t("deferredBanner")}
          </div>
        )}

        {flow.initializing ? (
          <LoadingSpinner label={t("loading")} />
        ) : (
          <>
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--line)",
                borderRadius: 14,
                padding: "18px 20px",
              }}
            >
              <OnboardingStepper
                current={flow.step}
                reachable={reachable}
                onJump={flow.goTo}
                t={t}
              />
            </div>

            {flow.step === "upload" && (
              <PhotoUploadStep onSubmit={flow.uploadPhoto} t={t} />
            )}

            {flow.step === "generate" && (
              <LookGenerateStep
                looks={flow.looks}
                onGenerate={handleGenerate}
                looksPending={flow.looksPending}
                reducedMotion={reducedMotion}
                onNext={() => flow.goTo("select")}
                onRestart={() => flow.goTo("upload")}
                t={t}
              />
            )}

            {flow.step === "select" && (
              <LookSelectStep
                looks={flow.looks}
                selectedLookId={flow.selectedLookId}
                onSelect={handleSelect}
                reducedMotion={reducedMotion}
                onBack={() => flow.goTo("generate")}
                onRestart={() => flow.goTo("upload")}
                onNext={() => flow.goTo("preview")}
                t={t}
              />
            )}

            {flow.step === "preview" && (
              <PreviewConfirmStep
                selectedLook={selectedLook}
                reducedMotion={reducedMotion}
                onBack={() => flow.goTo("select")}
                onConfirm={handleConfirm}
                t={t}
              />
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
}
