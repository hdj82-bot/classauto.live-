"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  SlidePanel,
  WorkArea,
  SettingsPanel,
  ActionBar,
  GenerationModal,
  type StudioSlide,
} from "@/components/professor/studio/v2";
import { useStudioI18n } from "@/components/professor/studio/useStudioI18n";
import type {
  Lecture,
  RenderStatus,
  ScriptResponse,
  ScriptSegment,
  SlideMeta,
  SlideReviewStatus,
  SlidesResponse,
  VoiceGender,
} from "@/components/professor/studio/studioTypes";

const SCRIPT_POLL_MS = 6000;
// 슬라이드 메타는 스크립트보다 짧은 주기로 폴링 — 파싱·임베딩 결과가 도착하는
// 순간 좌측 카드가 빠르게 채워지도록 한다. 모든 슬라이드가 ready 가 되면 폴링
// 자체를 중단(useEffect 내부에서)하므로 정상화 후 네트워크 부담은 없다.
const SLIDES_POLL_MS = 3000;
const RENDER_POLL_MS = 5000;

/**
 * /professor/studio/[lectureId] — v2 3단 wizard.
 *
 * docs/prototypes/05-studio-flow.extracted.html SCREEN 2 의 3단 구조를 그대로
 * 옮긴 v2 페이지. 좌(slide-panel 240) 중(work 가변) 우(settings 340) +
 * 하단 action-bar (60px).
 *
 * v1 의 5단계 선형 wizard (Step1~5 컴포넌트) 와는 다른 접근 — 본 페이지는
 * Step2~3 의 결정을 한 화면에서 동시에 받고, "전체 생성 시작" 시 GenerationModal
 * (Step4 대체) 을 띄운다. Step5 (공유) 는 별도 페이지 /professor/lecture/[id]
 * 로 이동.
 *
 * 백엔드 호출 (기존 페이지와 동일 패턴 보존):
 * - GET /api/lectures/{id}/video — video.id 확보 (파이프라인 진행 폴링)
 * - GET /api/videos/{video_id}/script — 스크립트 segments 폴링
 * - PATCH /api/lectures/{id} — 음성/만료 설정 반영
 * - POST /api/videos/{video_id}/approve — 승인
 * - GET /api/v1/render/lecture/{id} — 렌더 진행 폴링
 *
 * 비용 표시 정책 (planning/05 §1.1): 본 페이지 전체에서 $·₩ 노출 없음.
 * 진행 정보는 GenerationModal 의 "진행 정보" 박스(슬라이드 진행률·예상 영상
 * 길이·월 한도 편수) 로만 제공.
 */
export default function StudioWizardPage() {
  const { lectureId } = useParams<{ lectureId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { t } = useStudioI18n();

  // ── 강의 + 비디오 ID ─────────────────────────────────────────────────────────
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [lectureLoading, setLectureLoading] = useState(true);
  const [videoId, setVideoId] = useState<string | null>(null);

  // ── 스크립트 ─────────────────────────────────────────────────────────────────
  const [script, setScript] = useState<ScriptResponse | null>(null);
  const [scriptLoading, setScriptLoading] = useState(true);
  const scriptPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 슬라이드 메타 (편집기 즉시 렌더용) ───────────────────────────────────────
  // GET /api/lectures/{lecture_id}/slides — PPTX 파싱·임베딩 완료 시점부터
  // pending 슬라이드 카드를 내려준다. 스크립트(AI 발화) 와는 독립 폴링이라
  // 5단계 Celery 전체를 기다리지 않고 좌측 패널 + 중앙 영역이 즉시 채워진다.
  // null = 아직 첫 응답 전 (skeleton), [] = 응답 왔는데 파싱 직전.
  const [slidesMeta, setSlidesMeta] = useState<SlideMeta[] | null>(null);
  const slidesPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Wizard 결정 ──────────────────────────────────────────────────────────────
  const [activeIndex, setActiveIndex] = useState(0);
  const [reviewByIndex, setReviewByIndex] = useState<
    Record<number, SlideReviewStatus>
  >({});
  const [voiceGender, setVoiceGender] = useState<VoiceGender>("male");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [qaScopeOnUploaded, setQaScopeOnUploaded] = useState(true);
  const [blockExternalSearch, setBlockExternalSearch] = useState(true);
  const [attentionWarn, setAttentionWarn] = useState(true);

  // ── Generation modal ────────────────────────────────────────────────────────
  const [genOpen, setGenOpen] = useState(false);
  const [genPercent, setGenPercent] = useState(0);
  const [genStage, setGenStage] = useState<1 | 2 | 3 | 4>(1);
  const [genDone, setGenDone] = useState(false);
  const [approved, setApproved] = useState(false);
  const renderPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 1) 강의 + 비디오 ID 로드 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!lectureId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: courses } = await api.get<{ id: string }[]>("/api/courses");
        for (const c of courses) {
          const { data: lecs } = await api.get<Lecture[]>(
            `/api/courses/${c.id}/lectures`,
          );
          const found = lecs.find((l) => l.id === lectureId);
          if (found) {
            if (!cancelled) {
              setLecture(found);
              setVoiceGender(found.voice_gender);
              setExpiresAt(found.expires_at);
            }
            break;
          }
        }
        try {
          const { data } = await api.get<{ id: string }>(
            `/api/lectures/${lectureId}/video`,
          );
          if (!cancelled) setVideoId(data.id);
        } catch {
          /* 파이프라인이 video 를 만들기 전 — 폴링이 처리 */
        }
      } finally {
        if (!cancelled) setLectureLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lectureId]);

  // video.id 폴링 (파이프라인 도착 대기)
  useEffect(() => {
    if (videoId || !lectureId) return;
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
    const id = setInterval(tick, SCRIPT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [videoId, lectureId]);

  // 슬라이드 메타 폴링 — videoId / script 와 무관하게 lectureId 만 알면 진행.
  // 모든 슬라이드가 ready 상태로 도착하면 폴링 중단 (네트워크 절약).
  useEffect(() => {
    if (!lectureId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await api.get<SlidesResponse>(
          `/api/lectures/${lectureId}/slides`,
        );
        if (cancelled) return;
        setSlidesMeta(data.slides);
        const allReady =
          data.slides.length > 0 &&
          data.slides.every((s) => s.status === "ready");
        if (allReady && slidesPollRef.current) {
          clearInterval(slidesPollRef.current);
          slidesPollRef.current = null;
        }
      } catch {
        /* 권한 오류 / 강의 없음 — 빈 배열로 폴백 후 폴링은 계속 (재시도) */
        if (!cancelled) setSlidesMeta((prev) => prev ?? []);
      }
    };
    tick();
    slidesPollRef.current = setInterval(tick, SLIDES_POLL_MS);
    return () => {
      cancelled = true;
      if (slidesPollRef.current) {
        clearInterval(slidesPollRef.current);
        slidesPollRef.current = null;
      }
    };
  }, [lectureId]);

  // 스크립트 폴링
  useEffect(() => {
    if (!videoId) {
      setScript(null);
      setScriptLoading(true);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await api.get<ScriptResponse>(
          `/api/videos/${videoId}/script`,
        );
        if (cancelled) return;
        setScript(data);
        setScriptLoading(false);
        if (data.status !== "draft" && data.segments.length > 0) {
          if (scriptPollRef.current) {
            clearInterval(scriptPollRef.current);
            scriptPollRef.current = null;
          }
        }
      } catch {
        /* still generating */
      }
    };
    tick();
    scriptPollRef.current = setInterval(tick, SCRIPT_POLL_MS);
    return () => {
      cancelled = true;
      if (scriptPollRef.current) {
        clearInterval(scriptPollRef.current);
        scriptPollRef.current = null;
      }
    };
  }, [videoId]);

  // ── 슬라이드 목록 도출 ───────────────────────────────────────────────────────
  // 데이터 소스 우선순위:
  //   1) slidesMeta (백엔드 /api/lectures/{id}/slides) — index/title/status 의 권위.
  //   2) script.segments — ready 슬라이드의 한자 추출, review 상태 결정.
  // 두 소스 중 어느 쪽이 먼저 와도 카드가 즉시 보이도록 union 으로 인덱스를
  // 모은다 — 종전 처럼 script.segments 만 본다면 5단계 Celery 전체가 끝나야
  // 좌측 패널이 채워졌다.
  const slides: StudioSlide[] = useMemo(() => {
    const segments = script?.segments ?? [];
    const segByIndex = new Map<number, ScriptSegment>();
    for (const s of segments) {
      if (!segByIndex.has(s.slide_index)) segByIndex.set(s.slide_index, s);
    }

    const indexSet = new Set<number>();
    for (const m of slidesMeta ?? []) indexSet.add(m.index);
    for (const s of segments) indexSet.add(s.slide_index);
    const indices = Array.from(indexSet).sort((a, b) => a - b);
    if (indices.length === 0) return [];

    const metaByIndex = new Map<number, SlideMeta>();
    for (const m of slidesMeta ?? []) metaByIndex.set(m.index, m);

    return indices.map((idx) => {
      const seg = segByIndex.get(idx) ?? null;
      const meta = metaByIndex.get(idx);
      const review = reviewByIndex[idx];

      // backend 가 ready 라고 표시했거나, segment 텍스트가 실제로 도착한 경우 ready.
      const backendReady = meta?.status === "ready";
      const hasSegmentText = !!seg && seg.text.trim().length > 0;
      const ready = backendReady || hasSegmentText;

      let status: StudioSlide["status"];
      if (!ready) {
        status = "pending";
      } else if (review === "accepted" || review === "edited") {
        status = "adopted";
      } else if (review === "rejected" || review === "warning") {
        status = "warn";
      } else {
        status = "empty";
      }

      const segText = seg?.text ?? "";
      const hanMatch = segText.match(/[㐀-䶿一-鿿]/);
      const titleSource =
        segText.trim() || meta?.title?.trim() || `슬라이드 ${idx + 1}`;
      const title = titleSource.slice(0, 26).trim();

      return { index: idx, title, thumbChar: hanMatch?.[0], status };
    });
  }, [script, slidesMeta, reviewByIndex]);

  // SlidePanel 의 skeleton 표시 조건 — 양 쪽 소스 모두 아직 응답 전.
  // slidesMeta=null 이면 첫 폴링 응답조차 안 옴. script===null 도 동일.
  const slidesShellLoading = slidesMeta === null && script === null;

  const activeOrigSegment = useMemo(() => {
    return script?.segments?.find((s) => s.slide_index === activeIndex) ?? null;
  }, [script, activeIndex]);

  const activeAiSegment = useMemo(() => {
    return (
      script?.ai_segments?.find((s) => s.slide_index === activeIndex) ?? null
    );
  }, [script, activeIndex]);

  const acceptedCount = useMemo(
    () =>
      Object.values(reviewByIndex).filter((r) => r === "accepted" || r === "edited")
        .length,
    [reviewByIndex],
  );

  const handleAccept = useCallback(() => {
    setReviewByIndex((prev) => ({ ...prev, [activeIndex]: "accepted" }));
  }, [activeIndex]);

  const handleReject = useCallback(() => {
    setReviewByIndex((prev) => ({ ...prev, [activeIndex]: "rejected" }));
  }, [activeIndex]);

  const handleNext = useCallback(() => {
    setActiveIndex((i) => Math.min(slides.length - 1, i + 1));
  }, [slides.length]);

  const handlePrev = useCallback(() => {
    setActiveIndex((i) => Math.max(0, i - 1));
  }, []);

  // ── 전체 생성 시작 ───────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!videoId || !lecture) {
      // 파이프라인 미준비 — 시뮬레이션 모드 (백엔드 없이 시각 데모)
      setGenOpen(true);
      setGenPercent(0);
      setGenStage(1);
      setGenDone(false);
      let pct = 0;
      const id = setInterval(() => {
        pct = Math.min(100, pct + 8);
        setGenPercent(pct);
        if (pct < 25) setGenStage(1);
        else if (pct < 70) setGenStage(2);
        else if (pct < 95) setGenStage(3);
        else setGenStage(4);
        if (pct >= 100) {
          clearInterval(id);
          setGenDone(true);
        }
      }, 450);
      return;
    }

    try {
      setGenOpen(true);
      setGenPercent(0);
      setGenStage(1);
      setGenDone(false);

      // 음성·만료 PATCH (idempotent)
      if (
        lecture.voice_gender !== voiceGender ||
        lecture.expires_at !== expiresAt
      ) {
        const { data } = await api.patch<Lecture>(
          `/api/lectures/${lectureId}`,
          { voice_gender: voiceGender, expires_at: expiresAt },
        );
        setLecture(data);
      }

      await api.post(`/api/videos/${videoId}/approve`);
      setApproved(true);
    } catch {
      toast(t("step2.saveError"), "error");
      setGenOpen(false);
    }
  }, [videoId, lecture, lectureId, voiceGender, expiresAt, toast, t]);

  // 렌더 진행 폴링 (approved 인 동안)
  useEffect(() => {
    if (!approved || !lectureId) return;
    const tick = async () => {
      try {
        const { data } = await api.get<RenderStatus>(
          `/api/v1/render/lecture/${lectureId}`,
        );
        const total = data.total || slides.length || 1;
        const completed = data.completed;
        const pct = Math.min(100, Math.round((completed / total) * 100));
        setGenPercent(pct);
        if (pct < 25) setGenStage(1);
        else if (pct < 70) setGenStage(2);
        else if (pct < 95) setGenStage(3);
        else setGenStage(4);
        if (total > 0 && completed === total) {
          setGenDone(true);
          if (renderPollRef.current) {
            clearInterval(renderPollRef.current);
            renderPollRef.current = null;
          }
        }
      } catch {
        /* keep polling */
      }
    };
    tick();
    renderPollRef.current = setInterval(tick, RENDER_POLL_MS);
    return () => {
      if (renderPollRef.current) {
        clearInterval(renderPollRef.current);
        renderPollRef.current = null;
      }
    };
  }, [approved, lectureId, slides.length]);

  const handleViewVideo = useCallback(() => {
    setGenOpen(false);
    router.push(`/professor/lecture/${lectureId}`);
  }, [router, lectureId]);

  // ── 렌더링 ───────────────────────────────────────────────────────────────────
  if (lectureLoading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ height: "100%" }}
      >
        <LoadingSpinner label={t("common.loading")} />
      </div>
    );
  }

  if (!lecture) {
    return (
      <div className="flex items-center justify-center p-10" style={{ height: "100%" }}>
        <div
          role="alert"
          style={{
            background: "rgba(239, 68, 68, 0.06)",
            border: "1px solid rgba(239, 68, 68, 0.24)",
            borderRadius: 12,
            padding: "16px 22px",
            color: "#B91C1C",
            fontSize: 14,
          }}
        >
          강의 정보를 찾을 수 없습니다.
        </div>
      </div>
    );
  }

  const activeSlide = slides[activeIndex];
  const slideTitle = activeSlide?.title ?? lecture.title;

  // URL ?step=5 호환성 (기존 진입로 보존)
  if (searchParams.get("step") === "5") {
    router.replace(`/professor/lecture/${lectureId}`);
  }

  return (
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateColumns: "240px 1fr 340px",
        gridTemplateRows: "1fr auto",
        minHeight: 0,
      }}
    >
      <SlidePanel
        slides={slides}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
        loading={slidesShellLoading}
      />

      <WorkArea
        slideNumber={activeIndex + 1}
        totalSlides={slides.length}
        slideTitle={slideTitle}
        // 활성 슬라이드가 pending 이면 WorkArea 내부에서 미리보기·script 영역을
        // skeleton + "AI 생성 중…" 으로 표시한다. 텍스트 자체가 비어있는 ready
        // 슬라이드는 종전대로 안내 문구 fallback.
        activeSlidePending={activeSlide?.status === "pending"}
        originalText={
          activeOrigSegment?.text ??
          (scriptLoading
            ? "AI 가 PPT 노트를 추출하고 있어요. 잠시만 기다려주세요…"
            : "원본 PPT 노트가 비어 있습니다.")
        }
        aiText={
          activeAiSegment?.text ??
          (scriptLoading
            ? "AI 다듬은 스크립트가 곧 표시됩니다."
            : "다듬은 스크립트가 준비되지 않았습니다.")
        }
        meta={
          activeAiSegment
            ? `예상 ${formatDuration(activeAiSegment)} · ${activeAiSegment.text.length}자`
            : undefined
        }
        onAccept={handleAccept}
        onReject={handleReject}
      />

      <SettingsPanel
        avatarName="김교수"
        ttsProvider="elevenlabs"
        voiceGender={voiceGender}
        expiresAt={expiresAt}
        qaScopeOnUploaded={qaScopeOnUploaded}
        blockExternalSearch={blockExternalSearch}
        attentionWarn={attentionWarn}
        onChangeExpires={setExpiresAt}
        onToggleQaScope={setQaScopeOnUploaded}
        onToggleBlockExternal={setBlockExternalSearch}
        onToggleAttentionWarn={setAttentionWarn}
      />

      <div style={{ gridColumn: "1 / -1" }}>
        <ActionBar
          current={activeIndex + 1}
          total={slides.length}
          acceptedCount={acceptedCount}
          canPrev={activeIndex > 0}
          canNext={activeIndex < slides.length - 1}
          onPrev={handlePrev}
          onNext={handleNext}
          onGenerate={handleGenerate}
        />
      </div>

      <GenerationModal
        open={genOpen}
        percent={genPercent}
        activeStage={genStage}
        eta={genDone ? undefined : "약 2분 30초"}
        lectureTitle={lecture.title}
        slideCount={slides.length}
        processedSlides={Math.min(
          Math.round((genPercent / 100) * slides.length),
          slides.length,
        )}
        expectedDuration="약 5분 12초"
        done={genDone}
        onBackground={() => setGenOpen(false)}
        onViewVideo={handleViewVideo}
        onDevAdd={(d) => setGenPercent((p) => Math.min(100, p + d))}
        onDevComplete={() => {
          setGenPercent(100);
          setGenDone(true);
        }}
        onDevBackground={() => setGenOpen(false)}
      />
    </div>
  );
}

/* ───────── helpers ───────── */

function formatDuration(seg: ScriptSegment | null): string {
  if (!seg) return "—";
  const d = Math.max(0, seg.end_seconds - seg.start_seconds);
  const m = Math.floor(d / 60);
  const s = Math.floor(d % 60);
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}
