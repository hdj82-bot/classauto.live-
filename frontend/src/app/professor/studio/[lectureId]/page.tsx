"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import StepIndicator from "@/components/professor/studio/StepIndicator";
import Step2ScriptReview from "@/components/professor/studio/Step2ScriptReview";
import Step3AvatarVoice from "@/components/professor/studio/Step3AvatarVoice";
import Step4RenderProgress from "@/components/professor/studio/Step4RenderProgress";
import Step5Share from "@/components/professor/studio/Step5Share";
import GuardrailBanner from "@/components/professor/studio/GuardrailBanner";
import { useStudioI18n } from "@/components/professor/studio/useStudioI18n";
import { useStudioWizard } from "@/components/professor/studio/useStudioWizard";
import { estimateCost } from "@/components/professor/studio/costEstimator";
import type {
  HeyGenAvatar,
  Lecture,
  PlanUsage,
  RenderStatus,
  ScriptResponse,
  ScriptSegment,
  StudioStep,
} from "@/components/professor/studio/studioTypes";

const SCRIPT_POLL_MS = 6000;
const RENDER_POLL_MS = 5000;

/**
 * /professor/studio/[lectureId] — Step 2~5 진행 페이지.
 *
 * URL ?step= query 가 1차 단계 source-of-truth — 사용자가 새로고침해도 단계가
 * 유지된다. Step5(완료) 도달 후 모든 단계 클릭 가능.
 *
 * 백엔드 폴링:
 *  - GET /api/lectures/{id}/video — video.id 확보
 *  - GET /api/videos/{video_id}/script — pending_review 도달까지 폴링
 *  - GET /api/v1/render/lecture/{id} — 승인 후 슬라이드 렌더 진행 폴링
 *
 * 가드레일:
 *  - 비용·플랜 한도는 Step3 의 CostMeter / GuardrailBanner 가 처리.
 *  - 본 페이지에선 PlanUsage 가 아직 미흡(BACKEND_ASKS.STUDIO §2). 임시로
 *    무제한(Pro 가정) 으로 표시 — 백엔드 endpoint 도착 후 fetch 하도록 변경.
 */
export default function StudioWizardPage() {
  const router = useRouter();
  const { lectureId } = useParams<{ lectureId: string }>();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { t } = useStudioI18n();

  const stepFromUrl = (() => {
    const raw = Number(searchParams.get("step") ?? "2");
    if ([1, 2, 3, 4, 5].includes(raw)) return raw as StudioStep;
    return 2 as StudioStep;
  })();

  const wizard = useStudioWizard(stepFromUrl);

  // URL 동기화 — wizard.state.step 변경 시 URL 도 업데이트.
  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("step", String(wizard.state.step));
    router.replace(`/professor/studio/${lectureId}?${sp.toString()}`, {
      scroll: false,
    });
    // searchParams 의존성을 빼는 건 의도적 — URL 외부 변화 무시.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizard.state.step, lectureId, router]);

  // ── 강의 + 영상 + 스크립트 폴링 ───────────────────────────────────────────
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [lectureLoading, setLectureLoading] = useState(true);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [script, setScript] = useState<ScriptResponse | null>(null);
  const [scriptLoading, setScriptLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const pollHandle = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLecture = useCallback(async () => {
    // BACKEND_ASKS.STUDIO §4: 단일 강의 조회 GET /api/lectures/{id} 가 도착하면
    // 한 호출로 끝. 도착 전까지는 강좌 → 강좌별 강의 순회로 매칭하는 fallback.
    try {
      const { data: courses } = await api.get<{ id: string }[]>(
        "/api/courses",
      );
      for (const c of courses) {
        const { data: lecs } = await api.get<Lecture[]>(
          `/api/courses/${c.id}/lectures`,
        );
        const found = lecs.find((l) => l.id === lectureId);
        if (found) {
          setLecture(found);
          return;
        }
      }
    } catch {
      toast(t("common.loading"), "error");
    }
  }, [lectureId, toast, t]);

  // 첫 진입: 강의 메타 + 영상 메타 가져오기.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchLecture();

      // video.id 확보 — 파이프라인이 video row 만들 때까지 대기 필요.
      try {
        const { data } = await api.get<{ id: string; status: string }>(
          `/api/lectures/${lectureId}/video`,
        );
        if (!cancelled) setVideoId(data.id);
      } catch {
        // 404 — 파이프라인이 아직 video 를 만들지 않음. 폴링이 처리한다.
      }
      if (!cancelled) setLectureLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [lectureId, fetchLecture]);

  // video.id 미확보 시 주기 폴링 (파이프라인 진행 중).
  useEffect(() => {
    if (videoId) return;
    if (wizard.state.step === 1) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await api.get<{ id: string }>(
          `/api/lectures/${lectureId}/video`,
        );
        if (!cancelled) setVideoId(data.id);
      } catch {
        /* still waiting */
      }
    };
    tick();
    const handle = setInterval(tick, SCRIPT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [videoId, wizard.state.step, lectureId]);

  // 스크립트 폴링 — pending_review 도달까지.
  useEffect(() => {
    if (!videoId) {
      setScript(null);
      setScriptLoading(true);
      return;
    }
    if (wizard.state.step >= 5) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await api.get<ScriptResponse>(
          `/api/videos/${videoId}/script`,
        );
        if (cancelled) return;
        setScript(data);
        setScriptLoading(false);
        // status === pending_review (또는 그 이후) 면 폴링 중단.
        if (data.status !== "draft" && data.segments.length > 0) {
          if (pollHandle.current) {
            clearInterval(pollHandle.current);
            pollHandle.current = null;
          }
        }
      } catch {
        /* still generating */
      }
    };
    tick();
    pollHandle.current = setInterval(tick, SCRIPT_POLL_MS);
    return () => {
      cancelled = true;
      if (pollHandle.current) {
        clearInterval(pollHandle.current);
        pollHandle.current = null;
      }
    };
  }, [videoId, wizard.state.step]);

  // ── 스크립트 저장 / 리셋 ──────────────────────────────────────────────────
  const handleSaveScript = useCallback(
    async (segments: ScriptSegment[]) => {
      if (!videoId) return;
      setSaving(true);
      try {
        const { data } = await api.patch<ScriptResponse>(
          `/api/videos/${videoId}/script`,
          { segments },
        );
        setScript(data);
        wizard.setEditedSegments(null); // 저장됐으니 메모리 편집본 비움
        toast(t("step2.saveSuccess"), "success");
      } catch {
        toast(t("step2.saveError"), "error");
      } finally {
        setSaving(false);
      }
    },
    [videoId, wizard, toast, t],
  );

  const handleResetToAi = useCallback(async () => {
    if (!videoId) return;
    try {
      const { data } = await api.post<ScriptResponse>(
        `/api/videos/${videoId}/script/reset`,
      );
      setScript(data);
      wizard.setEditedSegments(null);
      toast(t("step2.saveSuccess"), "info");
    } catch {
      toast(t("step2.saveError"), "error");
    }
  }, [videoId, wizard, toast, t]);

  // ── HeyGen 아바타 목록 ───────────────────────────────────────────────────
  const [avatars, setAvatars] = useState<HeyGenAvatar[]>([]);
  const [avatarsLoading, setAvatarsLoading] = useState(false);
  const [avatarsError, setAvatarsError] = useState<string | null>(null);

  useEffect(() => {
    if (wizard.state.step !== 3) return;
    if (avatars.length > 0) return;
    let cancelled = false;
    setAvatarsLoading(true);
    (async () => {
      try {
        const { data } = await api.get<{ avatars: HeyGenAvatar[] }>(
          "/api/v1/render/avatars",
        );
        if (!cancelled) setAvatars(data.avatars ?? []);
      } catch {
        if (!cancelled) setAvatarsError("error");
      } finally {
        if (!cancelled) setAvatarsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wizard.state.step, avatars.length]);

  // ── 플랜 사용량 (placeholder) ─────────────────────────────────────────────
  // 실제 endpoint 미존재 — BACKEND_ASKS.STUDIO §2.
  // 임시로 무제한 plan (limit=0) 표시 → 모든 영상 생성을 차단하지 않음.
  const usage: PlanUsage = useMemo(
    () => ({ used: 0, limit: 0, monthlyVideoCount: 0, monthlyVideoLimit: 0 }),
    [],
  );

  // ── 승인 + 렌더 진행 ─────────────────────────────────────────────────────
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [renderStatus, setRenderStatus] = useState<RenderStatus | null>(null);

  const segments: ScriptSegment[] = wizard.state.editedSegments ?? script?.segments ?? [];
  const estimateMinutes = Math.max(
    2,
    Math.ceil(segments.reduce((s, x) => s + (x.end_seconds - x.start_seconds), 0) / 60) * 2,
  );

  const handleConfirmApprove = useCallback(async () => {
    if (!videoId) return;
    setApproving(true);
    try {
      // dirty 한 segments 가 있으면 먼저 저장.
      if (wizard.state.editedSegments) {
        await api.patch(`/api/videos/${videoId}/script`, {
          segments: wizard.state.editedSegments,
        });
        wizard.setEditedSegments(null);
      }
      await api.post(`/api/videos/${videoId}/approve`);
      setApproved(true);
      setApproveModalOpen(false);
    } catch {
      toast(t("step2.saveError"), "error");
    } finally {
      setApproving(false);
    }
  }, [videoId, wizard, toast, t]);

  // 렌더 진행 폴링 — Step 4 진입 시 + approved 인 동안.
  useEffect(() => {
    if (wizard.state.step !== 4) return;
    if (!approved && wizard.state.step !== 4) return;
    if (!lectureId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await api.get<RenderStatus>(
          `/api/v1/render/lecture/${lectureId}`,
        );
        if (cancelled) return;
        setRenderStatus(data);
        if (data.total > 0 && data.completed === data.total) {
          // 모두 ready — 자동으로 Step 5 권유 (사용자가 "viewResult" 클릭으로 이동)
        }
      } catch {
        /* keep polling */
      }
    };
    tick();
    const handle = setInterval(tick, RENDER_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [wizard.state.step, approved, lectureId]);

  // ── Step 5 — 게시 토글 ────────────────────────────────────────────────────
  const [publishing, setPublishing] = useState(false);

  const handlePublishToggle = useCallback(
    async (publish: boolean) => {
      if (!lecture) return;
      setPublishing(true);
      try {
        // Step3 의 만료일도 같은 PATCH 에 포함 — wizard.state.expiresAt 이
        // 미설정이면 백엔드의 기존 값이 그대로 유지되도록 키 자체를 생략.
        const body: Record<string, unknown> = { is_published: publish };
        if (wizard.state.expiresAt) body.expires_at = wizard.state.expiresAt;

        const { data } = await api.patch<Lecture>(
          `/api/lectures/${lecture.id}`,
          body,
        );
        setLecture(data);
        if (publish) toast(t("step5.publishedSuccess"), "success");
      } catch {
        toast(t("step2.saveError"), "error");
      } finally {
        setPublishing(false);
      }
    },
    [lecture, wizard.state.expiresAt, toast, t],
  );

  // ── 렌더링 ───────────────────────────────────────────────────────────────
  if (lectureLoading) {
    return <LoadingSpinner fullScreen label={t("common.loading")} />;
  }

  if (!lecture) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-8">
        <p className="text-sm text-gray-500">{t("common.loading")}</p>
      </div>
    );
  }

  const totalDuration = segments.reduce(
    (s, x) => s + Math.max(0, x.end_seconds - x.start_seconds),
    0,
  );

  const reviewable = wizard.state.step === 5;

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold text-gray-900"
          style={{ fontFamily: "'Paperlogy', 'Pretendard Variable', sans-serif" }}
        >
          {t("pageTitle")}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{lecture.title}</p>
      </header>

      <StepIndicator
        current={wizard.state.step}
        reviewable={reviewable}
        onJump={(s) => wizard.goTo(s)}
      />

      {!videoId && wizard.state.step <= 4 && (
        <GuardrailBanner variant="noPipeline" />
      )}

      {wizard.state.step === 2 && (
        <Step2ScriptReview
          script={script}
          loading={scriptLoading}
          reviewByIndex={wizard.state.reviewByIndex}
          onReview={wizard.setReview}
          editedSegments={wizard.state.editedSegments}
          onEditedChange={wizard.setEditedSegments}
          saving={saving}
          onSave={handleSaveScript}
          onResetToAi={handleResetToAi}
          onNext={() => wizard.goTo(3)}
        />
      )}

      {wizard.state.step === 3 && (
        <Step3AvatarVoice
          segments={segments}
          avatars={avatars}
          avatarsLoading={avatarsLoading}
          avatarsError={avatarsError}
          selectedAvatarId={wizard.state.selectedAvatarId}
          onSelectAvatar={wizard.setSelectedAvatar}
          ttsProvider={wizard.state.ttsProvider}
          onChangeTtsProvider={wizard.setTtsProvider}
          expiresAt={wizard.state.expiresAt}
          onChangeExpiresAt={wizard.setExpiresAt}
          usage={usage}
          onNext={() => wizard.goTo(4)}
        />
      )}

      {wizard.state.step === 4 && (
        <Step4RenderProgress
          approved={approved || lecture.is_published}
          approving={approving}
          approveModalOpen={approveModalOpen}
          onOpenApproveModal={() => setApproveModalOpen(true)}
          onCloseApproveModal={() => setApproveModalOpen(false)}
          onConfirmApprove={handleConfirmApprove}
          estimateMinutes={estimateMinutes}
          renderStatus={renderStatus}
          emailNotify={wizard.state.emailNotify}
          onChangeEmailNotify={wizard.setEmailNotify}
          onComplete={() => wizard.goTo(5)}
        />
      )}

      {wizard.state.step === 5 && (
        <Step5Share
          lecture={lecture}
          durationSeconds={totalDuration}
          origin={
            typeof window !== "undefined" ? window.location.origin : ""
          }
          onPublishToggle={handlePublishToggle}
          publishing={publishing}
          classCode={null}
        />
      )}

      {/* 비용 추정 노출 — Step 4 직전이거나 진행 중일 때 작은 박스로 표시 */}
      {wizard.state.step === 4 && segments.length > 0 && (
        <p className="text-xs text-gray-400 tabular-nums text-right">
          $
          {estimateCost(segments, wizard.state.ttsProvider).total.toFixed(2)} ·{" "}
          {totalDuration}s
        </p>
      )}
    </div>
  );
}
