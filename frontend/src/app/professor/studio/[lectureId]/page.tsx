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
  SlideReviewStatus,
  VoiceGender,
} from "@/components/professor/studio/studioTypes";

const SCRIPT_POLL_MS = 6000;
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
  const slides: StudioSlide[] = useMemo(() => {
    const segs = script?.segments ?? [];
    const grouped = new Map<number, ScriptSegment[]>();
    for (const s of segs) {
      const arr = grouped.get(s.slide_index) ?? [];
      arr.push(s);
      grouped.set(s.slide_index, arr);
    }
    const indices = Array.from(grouped.keys()).sort((a, b) => a - b);

    // 데이터 부재 시 prototype 把자문 8슬라이드 시연 데이터 (planning/05 §5.3.3)
    if (indices.length === 0) {
      const hanChar = "把";
      return [
        { index: 0, title: "把자문 도입", thumbChar: hanChar, status: "warn" },
        { index: 1, title: "把자문의 의미", thumbChar: hanChar, status: "adopted" },
        { index: 2, title: "어순 비교 — SVO vs 把자문", thumbChar: hanChar, status: "adopted" },
        { index: 3, title: "把의 문법적 기능", thumbChar: hanChar, status: "warn" },
        { index: 4, title: "把자문 예시", thumbChar: hanChar, status: "adopted" },
        { index: 5, title: "사용 조건", thumbChar: hanChar, status: "adopted" },
        { index: 6, title: "흔한 오류", thumbChar: hanChar, status: "warn" },
        { index: 7, title: "마무리", thumbChar: hanChar, status: "adopted" },
      ];
    }

    return indices.map((idx) => {
      const first = grouped.get(idx)?.[0];
      const text = first?.text ?? "";
      const hanMatch = text.match(/[㐀-䶿一-鿿]/);
      const title = text.slice(0, 26).trim() || `슬라이드 ${idx + 1}`;
      const review = reviewByIndex[idx];
      const status: StudioSlide["status"] =
        review === "accepted" || review === "edited"
          ? "adopted"
          : review === "rejected" || review === "warning"
            ? "warn"
            : "empty";
      return { index: idx, title, thumbChar: hanMatch?.[0], status };
    });
  }, [script, reviewByIndex]);

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
      />

      <WorkArea
        slideNumber={activeIndex + 1}
        totalSlides={slides.length}
        slideTitle={slideTitle}
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
