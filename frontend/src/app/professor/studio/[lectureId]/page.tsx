"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  SlidePanel,
  WorkArea,
  SettingsPanel,
  ActionBar,
  GenerationModal,
  SocraticQuizModal,
  type StudioSlide,
} from "@/components/professor/studio/v2";
import { useStudioI18n } from "@/components/professor/studio/useStudioI18n";
import { langLabel } from "@/components/professor/studio/studioTypes";
import {
  deleteQuiz,
  listAuthoredQuizzes,
} from "@/components/professor/studio/quizApi";
import {
  generateSeedAnswer,
  generateSeedQuestions,
  getSeedQuestions,
  putSeedQuestions,
  type SeedQuestionDraft,
} from "@/components/professor/studio/seedQuestionsApi";
import { useReducedMotion } from "@/components/professor/avatars/useReducedMotion";
import type {
  LangCode,
  Lecture,
  QuizDraft,
  QuizInsertionPoint,
  RenderStatus,
  ScriptResponse,
  ScriptSegment,
  SlideMeta,
  SlideReviewStatus,
  SlidesResponse,
  TtsVoice,
  VoiceGender,
} from "@/components/professor/studio/studioTypes";

/**
 * 창1 계약: PATCH·GET /api/lectures 응답에 avatar_id·avatar_name 이 추가될
 * 예정. studioTypes.Lecture 에 정식 반영되기 전까지, 이 페이지 안에서만
 * 옵셔널 확장으로 안전 접근한다 (미배포 동안 avatar_name 은 undefined →
 * "기본 아바타" 폴백). Lecture 타입 파일은 창1 소유라 여기서 건드리지 않는다.
 */
type LectureWithAvatar = Lecture & {
  avatar_id?: string | null;
  avatar_name?: string | null;
  /** 영상에서 아바타 크기 배율 (1.0 = 기본). 미배포 동안 undefined → 1.0 폴백. */
  avatar_scale?: number | null;
};

const SCRIPT_POLL_MS = 6000;
// 슬라이드 메타는 스크립트보다 짧은 주기로 폴링 — 파싱·임베딩 결과가 도착하는
// 순간 좌측 카드가 빠르게 채워지도록 한다. 모든 슬라이드가 ready 가 되면 폴링
// 자체를 중단(useEffect 내부에서)하므로 정상화 후 네트워크 부담은 없다.
const SLIDES_POLL_MS = 3000;
const RENDER_POLL_MS = 5000;
// 사전 질문 아바타 클립 렌더 폴링 최대 횟수(4초 간격). 백엔드 자체 폴링이
// 30초×20회(+초기 30초)≈10.5분이므로, 프론트는 그보다 길게(≈11분=165회) 잡아
// 정상 완료를 놓치지 않게 한다. 초과 시 무한 "생성 중"을 막고 안내로 전환한다.
const SEED_RENDER_POLL_MAX = 165;

// 사전 질문 자동 생성 실패 토스트 — 백엔드가 준 detail(예: "강의 파이프라인이 아직
// 처리되지 않았습니다.")을 그대로 보여줘 원인을 알 수 있게 한다. detail 이 없으면
// (네트워크/5xx) 일반 안내로 폴백한다.
function seedAutoGenErrorMessage(err: unknown): string {
  const detail = (
    err as { response?: { data?: { detail?: unknown } } } | undefined
  )?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  return "아직 질문과 답변 자동 생성을 사용할 수 없어요. 잠시 후 다시 시도해주세요.";
}
// 완료(ready) 슬라이드 수가 이 시간 동안 늘지 않으면 "멈춤"으로 간주해 재시도
// 안내를 띄운다. 한 슬라이드 TTS 의 정상 상한(render_slide soft_time_limit≈5분)
// 보다 살짝 짧게 둬, 정상 진행 중인 슬라이드를 멈춤으로 오인하지 않게 한다.
const RENDER_STALL_MS = 240_000; // 4분

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
 * - PATCH /api/videos/{video_id}/script — 수동 편집 저장 (스크립트 패널)
 * - POST /api/videos/{video_id}/script/regenerate — 슬라이드 1장 Claude 재생성
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
  const { toast } = useToast();
  const { t } = useStudioI18n();
  const reducedMotion = useReducedMotion();

  // ── 강의 + 비디오 ID ─────────────────────────────────────────────────────────
  const [lecture, setLecture] = useState<LectureWithAvatar | null>(null);
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
  // expires_at 은 UI 에서 제거됐지만(강의 설정 섹션 삭제) 음성/만료 저장 effect 가
  // voice_gender 와 함께 보내므로 강의의 기존 값을 보존하기 위해 상태는 유지한다.
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  // ── 음성·자막 ──────────────────────────────────────────────────────────────
  const [voiceLang, setVoiceLang] = useState<LangCode>("ko");
  const [subtitleLang, setSubtitleLang] = useState<LangCode | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [voiceSpeed, setVoiceSpeed] = useState<number>(1.0);
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [translatingSubtitle, setTranslatingSubtitle] = useState(false);
  const [savingSubtitle, setSavingSubtitle] = useState(false);
  // 발화 언어 변경 시 전 슬라이드 재생성 진행 표시(셀렉터 잠금 + 안내).
  const [voiceLangRegenerating, setVoiceLangRegenerating] = useState(false);
  // 속도 슬라이더 드래그 중 PATCH 폭주 방지용 디바운스 타이머.
  const voiceSpeedSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Generation modal ────────────────────────────────────────────────────────
  const [genOpen, setGenOpen] = useState(false);
  const [genPercent, setGenPercent] = useState(0);
  const [genStage, setGenStage] = useState<1 | 2 | 3 | 4>(1);
  const [genDone, setGenDone] = useState(false);
  // 제작 완료(viewable) 여부 — 재방문 시에도 미리보기 버튼을 켜기 위해 video 상태를 보관.
  const [videoStatus, setVideoStatus] = useState<string | null>(null);
  // 실제로 ready 까지 끝난 슬라이드 수 — 진행 정보 박스의 "X / N 슬라이드" 에
  // 쓴다. 원형 막대(genPercent)는 중간 단계 가중치까지 더한 값이라 따로 둔다.
  const [genCompleted, setGenCompleted] = useState(0);
  const [approved, setApproved] = useState(false);
  // 진행이 오래 정체되면(워커 재시작 등으로 한 슬라이드 렌더 유실) true — 모달에
  // "다시 시도" 안내를 띄운다. 완료(ready) 슬라이드 수가 늘면 갱신·해제한다.
  const [genStalled, setGenStalled] = useState(false);
  const lastProgressRef = useRef<{ completed: number; at: number }>({
    completed: -1,
    at: 0,
  });
  const renderPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // "다시 제작" 시 완료돼 멈춘 렌더 폴링을 다시 돌리기 위한 트리거. 증가하면
  // 렌더 폴링 effect 가 재실행돼 interval 을 새로 건다.
  const [renderPollNonce, setRenderPollNonce] = useState(0);

  // ── 스크립트 검토 패널 액션 진행 상태 ────────────────────────────────────────
  const [savingScript, setSavingScript] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // ── 인터랙티브 퀴즈 (소크라테스 저작) ────────────────────────────────────────
  // 우측 "퀴즈/문제" 패널의 삽입 지점들 + 소크라테스 대화 모달 대상 인덱스.
  // 저작된 문제는 GET /api/lectures/{id}/quiz 로 불러와 점으로 복원한다.
  const [quizPoints, setQuizPoints] = useState<QuizInsertionPoint[]>([]);
  const [socraticOpenIndex, setSocraticOpenIndex] = useState<number | null>(null);

  // ── 예상 질문 (Q&A 사전 답변) ────────────────────────────────────────────────
  // 우측 "예상 질문" 패널의 사전 질문·답변 목록. 로드 시 GET, 변경 시 디바운스
  // PUT(전량 교체), 생성 직전 flush. 백엔드 미배포/404 시 빈 목록으로 degrade.
  const [seedQuestions, setSeedQuestions] = useState<SeedQuestionDraft[]>([]);
  // "AI 질문 승인 — 아바타 미리 생성" 클릭 후 렌더가 끝날 때까지 true. 렌더는 celery
  // 비동기라 클립이 pending→rendering→ready 로 가는데, 폴링을 'rendering' 에만 걸면
  // pending 구간에서 폴링이 멈춰 버튼이 idle 로 되돌아가 "실패했나?" 오해를 준다.
  // 이 플래그가 켜진 동안은 모든 클립이 ready/failed(종료)가 될 때까지 계속 폴링한다.
  const [seedAwaitingRender, setSeedAwaitingRender] = useState(false);
  // 입력 중 PUT 폭주 방지용 디바운스 타이머.
  const seedSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 점검(미리보기) 모달에 띄울 클립 URL. null 이면 닫힘.
  const [seedPreviewUrl, setSeedPreviewUrl] = useState<string | null>(null);
  // 좌측 슬라이드 패널에 "문제N"을 슬라이드 사이에 삽입 표시 (작성된 퀴즈만).
  // 번호는 우측 카드("문제 N", 배열 순서)와 동일하게 맞춘다.
  const quizMarkers = useMemo(
    () =>
      quizPoints
        .map((p, i) => ({
          boundaryIndex: p.boundaryIndex,
          label: `문제 ${i + 1}`,
          authored: p.authoredId !== null,
        }))
        .filter((m) => m.authored)
        .map(({ boundaryIndex, label }) => ({ boundaryIndex, label })),
    [quizPoints],
  );

  // ── 1) 강의 + 비디오 ID 로드 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!lectureId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: courses } = await api.get<{ id: string }[]>("/api/courses");
        for (const c of courses) {
          const { data: lecs } = await api.get<LectureWithAvatar[]>(
            `/api/courses/${c.id}/lectures`,
          );
          const found = lecs.find((l) => l.id === lectureId);
          if (found) {
            if (!cancelled) {
              setLecture(found);
              setVoiceGender(found.voice_gender);
              setExpiresAt(found.expires_at);
              setVoiceLang(found.voice_lang ?? "ko");
              setSubtitleLang(found.subtitle_lang ?? null);
              setVoiceId(found.voice_id ?? null);
              setVoiceSpeed(found.voice_speed ?? 1.0);
            }
            break;
          }
        }
        try {
          const { data } = await api.get<{ id: string; status?: string }>(
            `/api/lectures/${lectureId}/video`,
          );
          if (!cancelled) {
            setVideoId(data.id);
            setVideoStatus(data.status ?? null);
            // 이미 승인(생성 시작/완료)된 강의는 재승인 불가(approve 는 pending_review
            // 에서만 → 아니면 409). approved 로 표시해 재approve 를 막고 진행/완료를 폴링.
            if (data.status === "rendering" || data.status === "done") {
              setApproved(true);
            }
          }
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

  // ElevenLabs 보이스 목록 (음성 선택용). 키 미설정·장애 시 빈 목록.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<{ voices: TtsVoice[]; total: number }>(
          "/api/voices",
        );
        if (!cancelled) setVoices(data.voices ?? []);
      } catch {
        /* 빈 목록 유지 — 기본 보이스로 생성 */
      } finally {
        if (!cancelled) setVoicesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // video.id 폴링 (파이프라인 도착 대기)
  useEffect(() => {
    if (videoId || !lectureId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await api.get<{ id: string; status?: string }>(
          `/api/lectures/${lectureId}/video`,
        );
        if (!cancelled) {
          setVideoId(data.id);
          setVideoStatus(data.status ?? null);
          if (data.status === "rendering" || data.status === "done") {
            setApproved(true);
          }
        }
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

  // 저작된 인터랙티브 퀴즈 로드 — 삽입 지점들을 경계별로 복원(경계당 1문항).
  useEffect(() => {
    if (!lectureId) return;
    let cancelled = false;
    (async () => {
      const { quizzes } = await listAuthoredQuizzes(lectureId);
      if (cancelled) return;
      const points: QuizInsertionPoint[] = quizzes
        .filter((q) => q.insert_after_slide_index !== null)
        .map((q) => ({
          boundaryIndex: q.insert_after_slide_index as number,
          questionType: q.question_type,
          difficulty: q.difficulty,
          revealAnswer: q.reveal_answer,
          authoredId: q.id,
          savedDraft: {
            question_type: q.question_type,
            difficulty: q.difficulty,
            content: q.content,
            options: q.options,
            correct_answer: q.correct_answer,
            explanation: q.explanation,
          },
        }))
        .sort((a, b) => a.boundaryIndex - b.boundaryIndex);
      // 백엔드에 저작된 게 있으면 그것으로 복원. (없으면 빈 상태 — 교수자가 추가)
      if (points.length > 0) setQuizPoints(points);
    })();
    return () => {
      cancelled = true;
    };
  }, [lectureId]);

  // 등록된 사전 질문 로드 — 있으면 패널에 복원. (없으면 빈 상태 — 교수자가 추가)
  useEffect(() => {
    if (!lectureId) return;
    let cancelled = false;
    (async () => {
      const { seedQuestions: loaded } = await getSeedQuestions(lectureId);
      if (cancelled) return;
      if (loaded.length > 0) {
        setSeedQuestions(
          loaded.map((q) => ({
            id: q.id,
            question: q.question,
            answer: q.answer,
            status: q.status,
            has_clip: q.has_clip,
            preview_url: q.preview_url,
          })),
        );
      }
    })();
    return () => {
      cancelled = true;
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

      // 백엔드 snake_case (image_url) → 프론트 camelCase (imageUrl) 변환.
      // 컬럼이 없는 환경에서는 항상 null — WorkArea 가 DefaultSlideMock 으로
      // fallback 한다.
      return {
        index: idx,
        title,
        thumbChar: hanMatch?.[0],
        status,
        imageUrl: meta?.image_url ?? null,
      };
    });
  }, [script, slidesMeta, reviewByIndex]);

  // SlidePanel 의 skeleton 표시 조건 — 양 쪽 소스 모두 아직 응답 전.
  // slidesMeta=null 이면 첫 폴링 응답조차 안 옴. script===null 도 동일.
  const slidesShellLoading = slidesMeta === null && script === null;

  // 현재 슬라이드의 편집 가능한 세그먼트 (segments = AI 초안에서 시작해 교수자
  // 편집이 누적되는 working copy). 원본 baseline 은 script.ai_segments 에 별도
  // 보존되어 있으며 reset 시에만 참조한다.
  const activeSegment = useMemo(() => {
    return script?.segments?.find((s) => s.slide_index === activeIndex) ?? null;
  }, [script, activeIndex]);

  const acceptedCount = useMemo(
    () =>
      Object.values(reviewByIndex).filter((r) => r === "accepted" || r === "edited")
        .length,
    [reviewByIndex],
  );

  // 자막이 음성과 동일한지 (null 이거나 voiceLang 과 같으면 동일).
  const subtitleSame = subtitleLang === null || subtitleLang === voiceLang;
  // 활성 슬라이드의 자막 텍스트. subtitle_segments 가 없으면 null(미번역).
  const activeSubtitle = useMemo<string | null>(() => {
    const subs = script?.subtitle_segments;
    if (!subs) return null;
    return subs.find((s) => s.slide_index === activeIndex)?.text ?? "";
  }, [script, activeIndex]);

  // 선택한 보이스 — WorkArea 의 'AI 발화 내용' 미리듣기 버튼 표시명용.
  const selectedVoice = useMemo(
    () => voices.find((v) => v.voice_id === voiceId) ?? null,
    [voices, voiceId],
  );

  // 미리듣기 캐시 키 — 보이스·속도·활성 슬라이드·본문이 바뀌면 재합성.
  const activeAiText = activeSegment?.text ?? "";
  const voicePreviewKey = `${voiceId ?? "default"}|${voiceSpeed}|${activeIndex}|${activeAiText.length}`;

  // 'AI 발화 내용' 미리듣기 — 현재 발화 내용을 선택 보이스·속도로 실제 합성.
  // POST /api/voices/preview 가 audio/mpeg 를 반환 → Blob 으로 받아 WorkArea 가 재생.
  const handleRequestVoicePreview = useCallback(async (): Promise<Blob | null> => {
    const text = activeAiText.trim();
    if (!text) {
      toast("미리들을 발화 내용이 없습니다.", "error");
      return null;
    }
    try {
      const { data } = await api.post<Blob>(
        "/api/voices/preview",
        { text, voice_id: voiceId, gender: voiceGender, speed: voiceSpeed },
        { responseType: "blob" },
      );
      return data;
    } catch (err) {
      // 응답이 Blob(responseType blob)이라 에러 본문도 Blob — 백엔드 detail 을
      // 꺼내 토스트로 보여줘 사유(예: 합성 오류 종류)를 화면에서 바로 확인 가능.
      const data = (err as { response?: { data?: unknown } })?.response?.data;
      let detail = "";
      if (data instanceof Blob) {
        try {
          const parsed = JSON.parse(await data.text());
          if (typeof parsed?.detail === "string") detail = parsed.detail;
        } catch {
          /* JSON 아님 — 무시 */
        }
      }
      toast(detail || "미리듣기 생성 중 오류가 발생했습니다.", "error");
      return null;
    }
  }, [activeAiText, voiceId, voiceGender, voiceSpeed, toast]);

  // ── 수동 편집 저장 ───────────────────────────────────────────────────────────
  // PATCH /api/videos/{video_id}/script — 백엔드는 전체 segments 배열을 받으므로
  // 활성 슬라이드의 text 만 갈아끼운 새 배열을 보낸다. 성공 시 segments 전체
  // 응답을 받아 로컬 script 도 동기화한다.
  const handleEditSave = useCallback(
    async (nextText: string) => {
      if (!videoId || !script) {
        // 시뮬레이션 모드 (백엔드 미준비) — 로컬 state 만 갱신
        setReviewByIndex((prev) => ({ ...prev, [activeIndex]: "edited" }));
        return;
      }
      const trimmed = nextText.trim();
      if (!trimmed) {
        toast("발화 내용은 비워둘 수 없습니다.", "error");
        throw new Error("empty");
      }
      const nextSegments = (script.segments ?? []).map((s) =>
        s.slide_index === activeIndex ? { ...s, text: trimmed } : s,
      );
      try {
        setSavingScript(true);
        const { data } = await api.patch<ScriptResponse>(
          `/api/videos/${videoId}/script`,
          { segments: nextSegments },
        );
        setScript(data);
        setReviewByIndex((prev) => ({ ...prev, [activeIndex]: "edited" }));
        toast(t("step2.saveSuccess"), "success");
      } catch (err) {
        toast(t("step2.saveError"), "error");
        throw err;
      } finally {
        setSavingScript(false);
      }
    },
    [videoId, script, activeIndex, toast, t],
  );

  // ── 다시 생성 ────────────────────────────────────────────────────────────────
  // POST /api/videos/{video_id}/script/regenerate — 해당 슬라이드 1장만 Claude 로
  // 재생성한다. 응답은 PATCH 와 동일한 ScriptResponse.
  const handleRegenerate = useCallback(async () => {
    if (!videoId) {
      // 시뮬레이션 모드 — 다른 액션처럼 로컬 state 만 표시
      setReviewByIndex((prev) => ({ ...prev, [activeIndex]: "pending" }));
      return;
    }
    try {
      setRegenerating(true);
      const { data } = await api.post<ScriptResponse>(
        `/api/videos/${videoId}/script/regenerate`,
        { slide_index: activeIndex },
      );
      setScript(data);
      setReviewByIndex((prev) => ({ ...prev, [activeIndex]: "pending" }));
      toast("발화 내용을 다시 생성했어요.", "success");
    } catch {
      toast("재생성 중 오류가 발생했습니다.", "error");
    } finally {
      setRegenerating(false);
    }
  }, [videoId, activeIndex, toast]);

  // ── 음성·자막 설정 저장 (변경 즉시 PATCH) ────────────────────────────────────
  const persistLecture = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!lectureId) return;
      try {
        const { data } = await api.patch<LectureWithAvatar>(
          `/api/lectures/${lectureId}`,
          patch,
        );
        setLecture(data);
      } catch {
        toast("설정 저장 중 오류가 발생했습니다.", "error");
      }
    },
    [lectureId, toast],
  );

  const handleChangeSubtitleLang = useCallback(
    (lang: LangCode | null) => {
      if (lang === subtitleLang) return;
      setSubtitleLang(lang);
      // 언어가 바뀌면 기존(이전 언어) 자막은 무효 — 즉시 비워서 카드가 새 언어의
      // "번역 생성" 프롬프트를 바로 보여주게 한다. (서버도 subtitle_lang 변경 시
      // subtitle_segments 를 비우므로 새로고침 후에도 일관됨.)
      setScript((prev) =>
        prev?.subtitle_segments ? { ...prev, subtitle_segments: null } : prev,
      );
      void persistLecture({ subtitle_lang: lang });
    },
    [persistLecture, subtitleLang],
  );

  // ── 발화(음성) 언어 변경 → 전 슬라이드를 해당 언어로 네이티브 재생성 ──────────
  // 서버가 voice_lang 갱신·스크립트 재생성·기존 자막 무효화를 한 번에 처리하므로
  // 별도 persistLecture 가 필요 없다. 실패하면 이전 언어로 되돌린다.
  const handleChangeVoiceLang = useCallback(
    async (lang: LangCode) => {
      if (lang === voiceLang || !videoId || voiceLangRegenerating) return;
      const prev = voiceLang;
      setVoiceLang(lang);
      setVoiceLangRegenerating(true);
      // 언어가 바뀌면 기존(이전 언어) 자막은 무효 — 즉시 비워 카드가 새 언어의
      // "번역 생성" 프롬프트를 보여주게 한다. (서버도 subtitle_segments 를 비운다.)
      setScript((p) => (p?.subtitle_segments ? { ...p, subtitle_segments: null } : p));
      try {
        const { data } = await api.post<ScriptResponse>(
          `/api/videos/${videoId}/script/language`,
          undefined,
          { params: { target_lang: lang } },
        );
        setScript(data);
        toast(`${langLabel(lang)}로 스크립트를 다시 생성했어요.`, "success");
      } catch {
        setVoiceLang(prev); // 실패 — 이전 언어로 복원
        toast("발화 언어 변경 중 오류가 발생했습니다.", "error");
      } finally {
        setVoiceLangRegenerating(false);
      }
    },
    [videoId, voiceLang, voiceLangRegenerating, toast],
  );

  const handleChangeVoiceId = useCallback(
    (id: string | null) => {
      setVoiceId(id);
      void persistLecture({ voice_id: id });
    },
    [persistLecture],
  );

  // 속도는 슬라이더 드래그 중 연속으로 바뀌므로, 로컬 state 는 즉시 갱신하되
  // 서버 PATCH 는 마지막 값으로 디바운스(500ms)해 호출 폭주를 막는다.
  const handleChangeVoiceSpeed = useCallback(
    (speed: number) => {
      setVoiceSpeed(speed);
      if (voiceSpeedSaveRef.current) clearTimeout(voiceSpeedSaveRef.current);
      voiceSpeedSaveRef.current = setTimeout(() => {
        void persistLecture({ voice_speed: speed });
      }, 500);
    },
    [persistLecture],
  );

  // 언마운트 시 대기 중인 속도 저장 타이머 정리.
  useEffect(() => {
    return () => {
      if (voiceSpeedSaveRef.current) clearTimeout(voiceSpeedSaveRef.current);
      if (seedSaveRef.current) clearTimeout(seedSaveRef.current);
    };
  }, []);

  // ── 자막 번역 생성 / 다시 번역 (전체 슬라이드) ───────────────────────────────
  const handleTranslateSubtitle = useCallback(async () => {
    if (!videoId || subtitleSame || !subtitleLang) return;
    try {
      setTranslatingSubtitle(true);
      const { data } = await api.post<ScriptResponse>(
        `/api/videos/${videoId}/subtitle/translate`,
        undefined,
        { params: { target_lang: subtitleLang } },
      );
      setScript(data);
      toast("자막을 생성했어요.", "success");
    } catch {
      toast("자막 번역 중 오류가 발생했습니다.", "error");
    } finally {
      setTranslatingSubtitle(false);
    }
  }, [videoId, subtitleSame, subtitleLang, toast]);

  // ── 자막 수동 편집 저장 (활성 슬라이드 1장) ──────────────────────────────────
  const handleSubtitleEditSave = useCallback(
    async (nextText: string) => {
      if (!videoId || !script?.subtitle_segments) return;
      const next = script.subtitle_segments.map((s) =>
        s.slide_index === activeIndex ? { ...s, text: nextText } : s,
      );
      try {
        setSavingSubtitle(true);
        const { data } = await api.patch<ScriptResponse>(
          `/api/videos/${videoId}/subtitle`,
          { segments: next },
        );
        setScript(data);
        toast("자막을 저장했어요.", "success");
      } catch (err) {
        toast("자막 저장 중 오류가 발생했습니다.", "error");
        throw err;
      } finally {
        setSavingSubtitle(false);
      }
    },
    [videoId, script, activeIndex, toast],
  );

  const handlePrev = useCallback(() => {
    setActiveIndex((i) => Math.max(0, i - 1));
  }, []);

  // ── 예상 질문 핸들러 ─────────────────────────────────────────────────────────
  // 교수자는 질문 + (선택) 사전 대답을 입력한다(답변 비우면 생성 시 RAG 자동). PUT 은
  // 전량 교체 — 질문이 빈 항목은 제외하고 {question, answer} 목록을 보낸다. 백엔드
  // 미배포/네트워크 오류는 삼키고 로컬 상태를 유지(다음 변경/생성 직전에 재시도).
  // 응답으로 state 를 덮어쓰지 않는다 — 입력 중 디바운스 저장이 커서/순서를 흔드는 것을
  // 막기 위함(id·status·preview_url 은 로드/폴링으로 복원).
  const persistSeedQuestions = useCallback(
    async (items: SeedQuestionDraft[]) => {
      if (!lectureId) return;
      const payload = items
        .map((q) => ({ question: q.question.trim(), answer: q.answer.trim() }))
        .filter((q) => q.question !== "");
      try {
        await putSeedQuestions(lectureId, payload);
      } catch {
        /* 미배포/네트워크 — 로컬 상태 유지 */
      }
    },
    [lectureId],
  );

  // 입력 중에는 디바운스(700ms)로 마지막 값만 저장해 PUT 폭주를 막는다.
  const scheduleSeedSave = useCallback(
    (items: SeedQuestionDraft[]) => {
      if (seedSaveRef.current) clearTimeout(seedSaveRef.current);
      seedSaveRef.current = setTimeout(() => {
        void persistSeedQuestions(items);
      }, 700);
    },
    [persistSeedQuestions],
  );

  const handleAddSeedQuestion = useCallback(() => {
    setSeedQuestions((prev) =>
      prev.length >= 3 ? prev : [...prev, { id: null, question: "", answer: "" }],
    );
  }, []);

  const handleChangeSeedQuestion = useCallback(
    (index: number, patch: { question?: string; answer?: string }) => {
      setSeedQuestions((prev) => {
        const next = prev.map((q, i) => (i === index ? { ...q, ...patch } : q));
        scheduleSeedSave(next);
        return next;
      });
    },
    [scheduleSeedSave],
  );

  // 점검(미리보기) — ready 클립 URL 을 모달로 재생.
  const handlePreviewSeed = useCallback((url: string) => {
    setSeedPreviewUrl(url);
  }, []);

  // 서버 기준으로 사전 질문 목록을 다시 불러와 상태(status·preview_url)를 갱신한다.
  // 영상 생성 직후 + 렌더 진척 폴링에서 사용. 편집 중 디바운스 저장이 대기 중이면
  // 건너뛰어(seedSaveRef) 입력 값 손실을 막는다.
  const reloadSeedQuestions = useCallback(async () => {
    if (!lectureId || seedSaveRef.current) return;
    try {
      const { seedQuestions: fresh } = await getSeedQuestions(lectureId);
      setSeedQuestions(
        fresh.map((q) => ({
          id: q.id,
          question: q.question,
          answer: q.answer,
          status: q.status,
          has_clip: q.has_clip,
          preview_url: q.preview_url,
        })),
      );
    } catch {
      /* 미배포/네트워크 — 다음 주기에 재시도 */
    }
  }, [lectureId]);

  const handleRemoveSeedQuestion = useCallback(
    (index: number) => {
      setSeedQuestions((prev) => {
        const next = prev.filter((_, i) => i !== index);
        scheduleSeedSave(next);
        return next;
      });
    },
    [scheduleSeedSave],
  );

  // 카드별 "질문과 답변 자동 생성" — 교수자가 카드마다 직접 입력 또는 자동 생성을
  // 선택할 수 있게 한다(상단 일괄 버튼 폐기). 동작은 카드 상태에 따라 둘로 갈린다:
  //  - 질문이 비어 있으면: 핵심 질문 후보를 받아 다른 카드와 겹치지 않는 1개로 질문+답변
  //    을 채운다.
  //  - 질문이 이미 입력돼 있으면: 그 질문은 보존하고 답변만 생성한다(교수자 입력 존중).
  // 저장은 디바운스. 실패는 백엔드 detail(예: "강의 파이프라인이 아직 처리되지
  // 않았습니다.")을 그대로 노출해 원인을 알 수 있게 한다.
  const handleAutoGenerateSeedQuestion = useCallback(
    async (index: number) => {
      if (!lectureId) return;
      const card = seedQuestions[index];
      if (!card) return;
      const typed = card.question.trim();
      try {
        if (typed) {
          const { answer, inScope } = await generateSeedAnswer(lectureId, typed);
          if (!answer) {
            toast(
              "이 질문은 강의 자료 범위 밖이라 답변을 만들지 못했어요. 질문을 강의 내용에 맞게 다듬어 보세요.",
              "error",
            );
            return;
          }
          setSeedQuestions((prev) => {
            const next = prev.map((q, i) => (i === index ? { ...q, answer } : q));
            scheduleSeedSave(next);
            return next;
          });
          toast(
            inScope
              ? "답변을 생성했어요. 검토 후 수정할 수 있어요."
              : "답변을 생성했어요(강의 자료 밖 질문일 수 있어요). 검토해 주세요.",
            "success",
          );
          return;
        }

        const generated = await generateSeedQuestions(lectureId);
        if (generated.length === 0) {
          toast("강의 자료가 아직 준비되지 않아 질문을 만들 수 없어요.", "error");
          return;
        }
        const used = new Set(
          seedQuestions
            .filter((_, i) => i !== index)
            .map((q) => q.question.trim().toLowerCase())
            .filter(Boolean),
        );
        const pick =
          generated.find((g) => !used.has(g.question.trim().toLowerCase())) ??
          generated[0];
        setSeedQuestions((prev) => {
          const next = prev.map((q, i) =>
            i === index
              ? { ...q, question: pick.question, answer: pick.answer }
              : q,
          );
          scheduleSeedSave(next);
          return next;
        });
        toast("질문과 답변을 생성했어요. 검토 후 수정할 수 있어요.", "success");
      } catch (err) {
        toast(seedAutoGenErrorMessage(err), "error");
      }
    },
    [lectureId, seedQuestions, scheduleSeedSave, toast],
  );

  // 렌더 완료 감지 — 승인 후(seedAwaitingRender) 저장된 클립이 모두 종료(ready/failed)
  // 되면 플래그를 내리고 결과를 한 번 안내한다. ready 가 하나라도 있으면 성공 토스트.
  useEffect(() => {
    if (!seedAwaitingRender) return;
    const saved = seedQuestions.filter((q) => !!q.status);
    if (saved.length === 0) return;
    const allDone = saved.every(
      (q) => q.status === "ready" || q.status === "failed",
    );
    if (!allDone) return;
    setSeedAwaitingRender(false);
    const ready = saved.filter((q) => q.status === "ready").length;
    const failed = saved.filter((q) => q.status === "failed").length;
    if (ready > 0 && failed === 0) {
      toast(
        `AI 아바타 생성 성공! 질문 ${ready}개의 답변 영상이 준비됐어요. 각 질문의 ‘미리보기’로 확인하세요.`,
        "success",
      );
    } else if (ready > 0) {
      toast(
        `아바타 ${ready}개 생성 완료, ${failed}개 실패. 준비된 질문은 ‘미리보기’로 확인하세요.`,
        "success",
      );
    } else {
      toast(
        "아바타 생성에 실패했어요. 질문이 강의 범위 밖이거나 한도를 초과했을 수 있어요.",
        "error",
      );
    }
  }, [seedAwaitingRender, seedQuestions, toast]);

  // ── 전체 생성 시작 ───────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    // 생성 직전 — 대기 중인 사전 답변 편집을 즉시 저장(flush). persist 는
    // 자체적으로 오류를 삼키므로 생성 흐름을 막지 않는다.
    if (seedSaveRef.current) {
      clearTimeout(seedSaveRef.current);
      seedSaveRef.current = null;
    }
    await persistSeedQuestions(seedQuestions);

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

    // 이미 승인된 강의: approve 는 pending_review 에서만 가능(아니면 409).
    if (approved) {
      // 제작이 끝난(done) 강의에서 다시 누르면 = "다시 제작(재생성)".
      // 변경된 슬라이드만 음성을 새로 합성한다(미변경=비용 0) — 확인 후 진행.
      if (genDone && videoId) {
        const ok = window.confirm(
          "수정한 슬라이드의 음성만 새로 합성합니다(바뀐 부분만 비용 발생, 변경 없으면 비용 0). 계속할까요?",
        );
        if (!ok) return;
        try {
          const { data } = await api.post<{
            rerendered_segments?: number;
            status?: string;
          }>(`/api/videos/${videoId}/rerender`);
          // 바뀐 구간이 없으면 재합성할 게 없다 — 모달을 열지 않고 안내만.
          if (!data?.rerendered_segments) {
            // 백엔드가 rendering 에 갇혀 있던 Video 를 done 으로 풀어준 경우
            // (모든 슬라이드는 이미 완성). 미리보기를 바로 열 수 있게 상태를 맞춘다.
            if (data?.status === "done") {
              setVideoStatus("done");
              setGenDone(true);
              toast("이미 모든 슬라이드가 완성되어 있어요. 미리보기로 확인하세요.", "success");
            } else {
              toast("변경된 내용이 없어 다시 제작할 슬라이드가 없습니다.", "info");
            }
            return;
          }
          // 모달을 진행 상태로 되돌리고(완료 표시 제거), 멈춰 있던 렌더 폴링을
          // 재가동(nonce 증가 → 폴링 effect 재실행).
          setGenDone(false);
          setGenPercent(0);
          setGenStage(1);
          setGenCompleted(0);
          setGenStalled(false);
          lastProgressRef.current = { completed: -1, at: 0 };
          setGenOpen(true);
          setRenderPollNonce((n) => n + 1);
        } catch {
          toast(t("step2.saveError"), "error");
          setGenOpen(false);
          setGenDone(true);
        }
        return;
      }
      // 아직 진행 중이면 현황 모달만 연다(폴링이 진행/완료를 채운다).
      setGenOpen(true);
      return;
    }

    try {
      setGenOpen(true);
      setGenPercent(0);
      setGenStage(1);
      setGenDone(false);
      setGenStalled(false);
      lastProgressRef.current = { completed: -1, at: 0 };

      // 음성·만료 PATCH (idempotent)
      if (
        lecture.voice_gender !== voiceGender ||
        lecture.expires_at !== expiresAt
      ) {
        const { data } = await api.patch<LectureWithAvatar>(
          `/api/lectures/${lectureId}`,
          { voice_gender: voiceGender, expires_at: expiresAt },
        );
        setLecture(data);
      }

      await api.post(`/api/videos/${videoId}/approve`);
      setApproved(true);
      // "슬라이드 쇼 제작"(approve)이 슬라이드 렌더와 함께 사전 질문 아바타 클립
      // 렌더도 시작한다(백엔드 approve_video → render_seed_questions, 병렬). 입력된
      // 예상 질문이 있으면 완료까지 폴링·표시한다(별도 '승인' 단계 없이 한 번에).
      void reloadSeedQuestions();
      if (seedQuestions.some((q) => q.question.trim())) {
        setSeedAwaitingRender(true);
      }
    } catch (err) {
      // 409 = 이미 승인됨(동시 클릭·상태 불일치). 에러 대신 현황 모달 유지.
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        setApproved(true);
      } else {
        toast(t("step2.saveError"), "error");
        setGenOpen(false);
      }
    }
  }, [
    videoId,
    lecture,
    lectureId,
    voiceGender,
    expiresAt,
    approved,
    genDone,
    toast,
    t,
    persistSeedQuestions,
    seedQuestions,
    reloadSeedQuestions,
  ]);

  // 멈춤 시 "다시 시도" — 진행 중(아직 done 아님)에 정체된 렌더를 재가동한다.
  // rerender 엔드포인트는 rendering 상태도 받으며, 완료(ready)된 슬라이드는
  // 재사용(비용 0)하고 멈춘 슬라이드만 pending 으로 되돌려 다시 합성한다.
  const handleRetryRender = useCallback(async () => {
    if (!videoId) return;
    setGenStalled(false);
    lastProgressRef.current = { completed: -1, at: 0 };
    try {
      await api.post(`/api/videos/${videoId}/rerender`);
      // 폴링을 재가동(nonce 증가)해 진척을 다시 채운다. 모달은 열어 둔다.
      setGenDone(false);
      setRenderPollNonce((n) => n + 1);
      toast("멈춘 슬라이드를 다시 합성합니다.", "info");
    } catch {
      toast(t("step2.saveError"), "error");
    }
  }, [videoId, toast, t]);

  // 사전 질문 클립 렌더 진척 폴링 — 4초마다 상태 갱신.
  //  · 승인 직후(seedAwaitingRender): 클립이 pending→rendering→ready 로 가므로,
  //    'rendering' 에만 걸면 pending 구간에서 폴링이 끊긴다. 승인 동안은 무조건 폴링.
  //  · 재방문 등으로 이미 rendering 인 항목만 있을 때도(awaiting=false) 폴링 유지.
  // 키가 그대로면 effect 가 재실행되지 않아 인터벌은 1개만 유지된다. 종료 시
  // (모두 ready/failed) awaiting 이 내려가고 rendering 도 없어 폴링이 멈춘다.
  const seedRenderingKey = seedAwaitingRender
    ? "awaiting"
    : seedQuestions
        .filter((q) => q.status === "rendering")
        .map((q) => q.id)
        .filter(Boolean)
        .sort()
        .join(",");
  useEffect(() => {
    if (!seedRenderingKey) return;
    let attempts = 0;
    const id = setInterval(() => {
      attempts += 1;
      // 한도 초과 — 무한 "생성 중" 방지. 백엔드 폴링 한도(~11분)를 넘겨도 완료가
      // 안 오면 대기 상태를 풀고 안내한다(이미 완료됐다면 완료 effect 가 awaiting 을
      // 먼저 내려둔다). 사용자는 새로고침/재시도로 이어갈 수 있다.
      if (attempts > SEED_RENDER_POLL_MAX) {
        clearInterval(id);
        setSeedAwaitingRender((awaiting) => {
          if (awaiting) {
            toast(
              "아바타 생성이 예상보다 오래 걸리고 있어요. 잠시 후 새로고침해 상태를 확인하거나, 다시 시도해 주세요.",
              "error",
            );
          }
          return false;
        });
        return;
      }
      void reloadSeedQuestions();
    }, 4000);
    return () => clearInterval(id);
  }, [seedRenderingKey, reloadSeedQuestions, toast]);

  // 렌더 진행 폴링 (approved 인 동안)
  useEffect(() => {
    if (!approved || !lectureId) return;
    const tick = async () => {
      try {
        const { data } = await api.get<RenderStatus>(
          `/api/v1/render/lecture/${lectureId}`,
        );
        const renders = data.renders ?? [];
        const total = data.total || renders.length || slides.length || 1;
        const completed = data.completed;
        setGenCompleted(completed);

        // 멈춤 감지 — 완료(ready) 슬라이드 수가 늘면 진척 시각을 갱신하고 해제,
        // 그대로면 RENDER_STALL_MS 경과 시 멈춤으로 표시(미완료 + 실패 0 일 때만).
        const now = Date.now();
        if (completed !== lastProgressRef.current.completed) {
          lastProgressRef.current = { completed, at: now };
          setGenStalled(false);
        } else if (
          completed < total &&
          (data.failed ?? 0) === 0 &&
          lastProgressRef.current.at > 0 &&
          now - lastProgressRef.current.at > RENDER_STALL_MS
        ) {
          setGenStalled(true);
        }

        // 슬라이드별 진행 가중치 — completed(ready)만 세면 첫 슬라이드가 완전히
        // 끝나기 전까지 막대가 0% 에 멈춰 보인다(슬라이드당 TTS→HeyGen 합성→
        // 다운로드가 수 분). 중간 단계에도 부분 점수를 줘서 단계별로 막대가
        // 실제로 움직이게 한다. 백엔드 RenderStatus enum 과 1:1.
        const WEIGHT: Record<string, number> = {
          pending: 0,
          queued: 0,
          tts_processing: 0.25,
          rendering: 0.6,
          uploading: 0.9,
          ready: 1,
          failed: 0,
          cancelled: 0,
        };
        const weighted = renders.length
          ? renders.reduce((sum, r) => sum + (WEIGHT[r.status] ?? 0), 0)
          : completed;
        let pct = Math.round((weighted / total) * 100);
        // 전부 ready 가 되기 전엔 99% 를 넘지 않게(완료 처리는 아래 조건에서만).
        if (completed < total) pct = Math.min(pct, 99);
        setGenPercent(Math.max(0, Math.min(100, pct)));

        // 단계 표시 — 아직 진행 중인 가장 이른 단계를 활성으로(순차적 의미 보존).
        // 한 슬라이드라도 TTS 단계면 stage 2, 전부 통과했으면 합성(3)/인코딩(4).
        const has = (s: string) => renders.some((r) => r.status === s);
        if (renders.length === 0) setGenStage(1);
        else if (has("pending") || has("queued") || has("tts_processing")) setGenStage(2);
        else if (has("rendering")) setGenStage(3);
        else setGenStage(4);

        if (total > 0 && completed === total) {
          setGenPercent(100);
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
  }, [approved, lectureId, slides.length, renderPollNonce]);

  const handleViewVideo = useCallback(() => {
    setGenOpen(false);
    // 생성 완료 → 공유·게시 화면(학생 링크·QR·게시 토글·학생 미리보기).
    router.push(`/professor/lecture/${lectureId}/share`);
  }, [router, lectureId]);

  // ── 퀴즈/문제 핸들러 ─────────────────────────────────────────────────────────
  const handleAddQuizPoint = useCallback(() => {
    setQuizPoints((prev) => {
      if (prev.length >= 3) return prev;
      // 아직 안 쓰인 첫 경계를 기본값으로(없으면 0).
      const used = new Set(prev.map((p) => p.boundaryIndex));
      const maxBoundary = Math.max(0, slides.length - 2);
      let boundary = 0;
      for (let n = 0; n <= maxBoundary; n += 1) {
        if (!used.has(n)) {
          boundary = n;
          break;
        }
      }
      return [
        ...prev,
        {
          boundaryIndex: boundary,
          questionType: "multiple_choice",
          difficulty: "medium",
          revealAnswer: true,
          authoredId: null,
        },
      ];
    });
  }, [slides.length]);

  const handleRemoveQuizPoint = useCallback(
    (index: number) => {
      setQuizPoints((prev) => {
        const target = prev[index];
        // 저장된 문제면 백엔드에서도 삭제(best-effort).
        if (target?.authoredId) {
          void deleteQuiz(lectureId, target.authoredId).catch(() => {
            /* 미배포/네트워크 — 로컬 상태만 제거 */
          });
        }
        return prev.filter((_, i) => i !== index);
      });
    },
    [lectureId],
  );

  const handleChangeQuizPoint = useCallback(
    (index: number, patch: Partial<QuizInsertionPoint>) => {
      setQuizPoints((prev) =>
        prev.map((p, i) => (i === index ? { ...p, ...patch } : p)),
      );
    },
    [],
  );

  const handleQuizConfirmed = useCallback(
    (result: { id: string; boundaryIndex: number; draft: QuizDraft }) => {
      setQuizPoints((prev) =>
        prev.map((p, i) =>
          i === socraticOpenIndex
            ? {
                ...p,
                boundaryIndex: result.boundaryIndex,
                authoredId: result.id,
                savedDraft: result.draft,
              }
            : p,
        ),
      );
      setSocraticOpenIndex(null);
      toast("퀴즈가 저장되었습니다.", "success");
    },
    [socraticOpenIndex, toast],
  );

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

  // 과거 ?step=5 는 별도 단순 에디터(/professor/lecture/[id])로 보냈으나,
  // 편집 진입점을 studio 로 통일하면서 그 페이지는 redirect 스텁이 됐다.
  // step=5 로 들어와도 studio 가 곧 에디터이므로 그대로 렌더한다(파라미터 무시).

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
        quizMarkers={quizMarkers}
        loading={slidesShellLoading}
      />

      <WorkArea
        slideNumber={activeIndex + 1}
        totalSlides={slides.length}
        slideTitle={slideTitle}
        slideImageUrl={activeSlide?.imageUrl ?? null}
        // 활성 슬라이드가 pending 이면 WorkArea 내부에서 미리보기·script 영역을
        // skeleton + "AI 생성 중…" 으로 표시한다.
        // 참고: PR #203 에서 "원본 PPT 노트" 블록이 제거됐으므로 originalText
        // prop 은 더 이상 넘기지 않는다.
        activeSlidePending={activeSlide?.status === "pending"}
        aiText={
          activeSegment?.text ??
          (scriptLoading
            ? "AI 아바타 발화 내용이 곧 표시됩니다."
            : "AI 아바타 발화 내용이 준비되지 않았습니다.")
        }
        meta={
          activeSegment
            ? `예상 ${formatDuration(activeSegment)} · ${activeSegment.text.length}자`
            : undefined
        }
        onEditSave={handleEditSave}
        onRegenerate={handleRegenerate}
        onRequestVoicePreview={handleRequestVoicePreview}
        voicePreviewKey={voicePreviewKey}
        voiceName={
          selectedVoice
            ? selectedVoice.display_name || selectedVoice.name
            : undefined
        }
        saving={savingScript}
        regenerating={regenerating}
        subtitleSame={subtitleSame}
        subtitleLangLabel={subtitleSame ? undefined : langLabel(subtitleLang)}
        subtitleText={subtitleSame ? null : activeSubtitle}
        onSubtitleEditSave={handleSubtitleEditSave}
        onTranslateSubtitle={handleTranslateSubtitle}
        translatingSubtitle={translatingSubtitle}
        savingSubtitle={savingSubtitle}
        reducedMotion={reducedMotion}
      />

      <SettingsPanel
        avatarName={lecture.avatar_name ?? "기본 아바타"}
        ttsProvider="elevenlabs"
        voiceGender={voiceGender}
        voiceLang={voiceLang}
        subtitleLang={subtitleLang}
        voiceId={voiceId}
        voiceSpeed={voiceSpeed}
        voiceLangRegenerating={voiceLangRegenerating}
        voices={voices}
        voicesLoading={voicesLoading}
        onChangeVoiceLang={handleChangeVoiceLang}
        onChangeSubtitleLang={handleChangeSubtitleLang}
        onChangeVoiceId={handleChangeVoiceId}
        onChangeVoiceSpeed={handleChangeVoiceSpeed}
        onChangeAvatar={() =>
          router.push(`/professor/avatars?lecture=${lectureId}`)
        }
        slideCount={slides.length}
        quizPoints={quizPoints}
        onAddQuizPoint={handleAddQuizPoint}
        onRemoveQuizPoint={handleRemoveQuizPoint}
        onChangeQuizPoint={handleChangeQuizPoint}
        onOpenSocratic={setSocraticOpenIndex}
        seedQuestions={seedQuestions}
        seedRenderingActive={seedAwaitingRender}
        onAddSeedQuestion={handleAddSeedQuestion}
        onRemoveSeedQuestion={handleRemoveSeedQuestion}
        onChangeSeedQuestion={handleChangeSeedQuestion}
        onPreviewSeed={handlePreviewSeed}
        onAutoGenerateSeedQuestion={handleAutoGenerateSeedQuestion}
      />

      <div style={{ gridColumn: "1 / -1" }}>
        <ActionBar
          current={activeIndex + 1}
          total={slides.length}
          acceptedCount={acceptedCount}
          canPrev={activeIndex > 0}
          onPrev={handlePrev}
          onGenerate={handleGenerate}
          ctaLabel={genDone ? "다시 제작" : "슬라이드 쇼 제작"}
          onPreview={() => {
            // 제작된 강의를 학생과 동일한 플레이어로 새 탭에서 검토(미발행도 소유자는 조회 가능).
            if (lecture?.slug)
              window.open(`/lecture/${lecture.slug}?preview=1`, "_blank");
          }}
          canPreview={genDone || videoStatus === "done"}
        />
      </div>

      <GenerationModal
        open={genOpen}
        percent={genPercent}
        activeStage={genStage}
        lectureTitle={lecture.title}
        slideCount={slides.length}
        processedSlides={Math.min(genCompleted, slides.length)}
        // 추천 질문(Q&A) 아바타 진척 — 저장된(status 보유) 질문 기준. 0 이면 모달에서 숨김.
        qaTotal={seedQuestions.filter((q) => !!q.status).length}
        qaReady={seedQuestions.filter((q) => q.status === "ready").length}
        qaFailed={seedQuestions.filter((q) => q.status === "failed").length}
        done={genDone}
        stalled={genStalled}
        onRetry={handleRetryRender}
        onBackground={() => setGenOpen(false)}
        onViewVideo={handleViewVideo}
        onPreview={() => {
          // 학생과 동일한 플레이어로 결과물 검토(미발행이어도 소유 교수자는 조회 가능).
          // 새 탭으로 열어 studio 편집 화면을 유지한다.
          if (lecture?.slug) window.open(`/lecture/${lecture.slug}?preview=1`, "_blank");
        }}
        // DEV 시뮬레이션 버튼은 로컬 개발에서만 노출 — 프로덕션 빌드에서는
        // process.env.NODE_ENV 가 "production" 으로 정적 치환돼 props 자체가
        // 안 넘어가므로 모달의 DEV 컨트롤 박스가 렌더되지 않는다.
        {...(process.env.NODE_ENV === "development"
          ? {
              onDevAdd: (d: number) =>
                setGenPercent((p) => Math.min(100, p + d)),
              onDevComplete: () => {
                setGenPercent(100);
                setGenDone(true);
              },
              onDevBackground: () => setGenOpen(false),
            }
          : {})}
      />

      <SocraticQuizModal
        open={socraticOpenIndex !== null}
        lectureId={lectureId}
        point={socraticOpenIndex !== null ? quizPoints[socraticOpenIndex] ?? null : null}
        onClose={() => setSocraticOpenIndex(null)}
        onConfirmed={handleQuizConfirmed}
      />

      {/* 사전 답변 클립 점검 — ready 클립 미리보기 재생 모달 */}
      {seedPreviewUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="사전 답변 미리보기"
          onClick={() => setSeedPreviewUrl(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(10,10,10,0.72)",
            display: "grid",
            placeItems: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 100%)",
              background: "var(--bg-card)",
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: "var(--shadow-lg, 0 20px 60px rgba(0,0,0,0.4))",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <strong style={{ fontSize: 14, color: "var(--text)" }}>사전 답변 점검</strong>
              <button
                type="button"
                onClick={() => setSeedPreviewUrl(null)}
                aria-label="닫기"
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "var(--text-subtle)",
                  fontFamily: "inherit",
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              src={seedPreviewUrl}
              controls
              autoPlay
              style={{ display: "block", width: "100%", maxHeight: "70vh", background: "#000" }}
            />
          </div>
        </div>
      )}
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
