"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, API_URL, userApi, bootstrapAuth } from "@/lib/api";
import { useSlideshowPlayback } from "./useSlideshowPlayback";
import {
  pickActiveCaptionWithCues,
  DEFAULT_CAPTION_LEAD_SECONDS,
  detectCaptionScript,
} from "./captionTiming";
import type { SubtitleCue, SubtitlePosition } from "./useSlideshowPlayback";
import { tokens as tokenStorage } from "@/lib/tokens";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAttention } from "@/hooks/useAttention";
import { useA11y, type FontSize } from "@/components/student/accessibility/A11yContext";
import { parseCourseTitle } from "@/components/student/v2/CourseTitle";
import OnboardingFlowV2 from "@/components/student/v2/OnboardingFlowV2";
import PlayerSurfaceDark from "./PlayerSurfaceDark";
import AttentionWarningV2 from "./AttentionWarningV2";
import ShareLinks from "@/components/professor/studio/ShareLinks";
import {
  getPlaybackQuizzes,
  submitInterstitialAnswer,
  type PlaybackQuiz,
} from "./quizPlaybackApi";
import styles from "./Player.module.css";

/**
 * 채팅 말풍선은 마크다운을 렌더링하지 않고 텍스트 그대로 보여준다(아래 bubble).
 * 답변에 섞인 마크다운 기호(`**굵게**`, `##`/`###` 제목)가 글자 그대로 노출돼
 * 거슬리는 문제를 막는다. 백엔드가 생성 시점에 이미 제거하지만(qa.py _strip_markdown),
 * 이 fix 이전에 캐시·저장된 옛 답변까지 깨끗하게 보이도록 표시 직전 동일한 안전망을 둔다.
 */
function stripChatMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "");
}

/**
 * PlayerV2 — /lecture/[slug] 영상 시청 페이지의 다크 톤 UI.
 *
 * 출처: docs/prototypes/06-student-flow.extracted.html SCREEN 4
 *      + docs/planning/06-student-pages.md §6-8.
 *
 * 기능:
 *  1. 상단바: 강의 주차·제목 (한자 강조) + 학생 정보 + 설정 아이콘
 *  2. 영상 stage(60%) + 컨트롤 바(재생/시간/익명 반응×4/자막/풀스크린)
 *  3. Q&A 사이드 패널(40%) — 다크 톤, 영상 화면 연속
 *  4. 인터스티셜 퀴즈 오버레이 (DEMO 트리거 + 백엔드 신호 시 자동)
 *  5. 집중 경고 3단계 오버레이 (useAttention 훅 통합)
 *  6. 첫 진입 온보딩 4슬라이드 (sessionStorage 1탭 1회)
 *
 * 영상 세션 생명주기는 v1 LectureViewerPage 와 동일 — POST /sessions
 * + attention/start, beforeunload 시 paused 처리.
 */

interface LectureData {
  id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  slug: string;
  is_expired?: boolean;
  // 06 prototype 시연 필드 — 백엔드 PR 후 자동 채움
  professor_name?: string | null;
  course_name?: string | null;
  school_name?: string | null;
  week_number?: number | null;
  lesson_number?: number | null;
  /** 강의 아바타 얼굴 이미지(presigned). Q&A 채팅 답변자 아이콘에 사용. 없으면 'AI'. */
  avatar_image_url?: string | null;
}

interface QAMessage {
  role: "user" | "assistant";
  text: string;
  source?: string | null;
  /** 캐시 적중 시 함께 내려오는 HeyGen 아바타 답변 클립 URL (없으면 텍스트만). */
  avatarUrl?: string | null;
  /**
   * 캐시 아바타 클립이 맞춰진 "원 질문"(09 §5.2 투명성). 캐시 클립은 이 학생의
   * 질문이 아니라 비슷한 과거 질문에 렌더된 것이므로, 클립 위에 그 사실을 표기한다.
   */
  matchedQuestion?: string | null;
  /** 교수자 사전 제작 추천 질문의 정답 클립(=이 질문에 대한 정확한 답). 캐시
   *  "비슷한 질문" 안내문을 띄우지 않는다. */
  seed?: boolean;
}

const indexToLetter = (idx: string): string =>
  String.fromCharCode(65 + Math.max(0, parseInt(idx, 10) || 0));

// 자막 색 팔레트 — 다크 자막 배경 위에서 잘 보이는 색들.
const CAPTION_COLORS = ["#ffffff", "#ffe14d", "#8fd3ff", "#9affc0", "#ffb3c7"];

export interface PlayerV2Props {
  slug: string;
  /**
   * 교수자 미리보기 모드. 배포 전 결과물을 학생과 동일한 플레이어로 검토한다.
   * 학생 시청 세션·집중도 추적을 만들지 않아(분석 오염 방지) 슬라이드쇼·자막
   * 재생만 그대로 확인한다. (소유 교수자는 미발행 강의도 백엔드가 조회 허용.)
   */
  preview?: boolean;
}

export default function PlayerV2({ slug, preview = false }: PlayerV2Props) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();
  // 접근성 패널과 **같은** A11yProvider(상위 mount)를 공유한다. 자막 표시·글씨
  // 크기·고대비가 곧 영상 설정이 되도록 본 컨텍스트를 단일 source 로 쓴다.
  const a11y = useA11y();
  const captionsOn = a11y.captions;

  // ── 미리보기 자막·속도 사용자 조절 (재생성 없이 즉시 반영) ──────────────────
  // 음성/자막 언어·TTS 마다 체감 동기가 달라, 교수자가 미리보기에서 직접 맞춘다.
  const [avSettingsOpen, setAvSettingsOpen] = useState(false);
  // 자막 폰트 — 언어별 기본값: 한국어=프리텐다드, 중국어(한자)=명조(serif). 폰트는
  // 강의에 저장되지 않는 공통 기본값이라(미리보기·학생 동일), 로드 시 자막 내용으로
  // 언어를 추정해 적용한다. 교수자가 칩으로 직접 고르면 그 선택을 유지한다(아래 ref).
  const [capFont, setCapFont] = useState<"sans" | "serif" | "pretendard">(
    "pretendard",
  );
  const capFontUserSetRef = useRef(false);
  const [capColor, setCapColor] = useState<string>("#ffffff");
  const [capScale, setCapScale] = useState(1); // 0.7 ~ 1.6
  const [voiceRate, setVoiceRate] = useState(1); // 0.5 ~ 2.0 (음성 빠르기)
  const [capLead, setCapLead] = useState(DEFAULT_CAPTION_LEAD_SECONDS); // 자막 빠르기(초)
  // 자막 위치(영상 영역 기준 정규화 좌표). null = 기본(하단 중앙). 폰트/색/크기와 달리
  // 이 값은 강의에 저장돼 학생 화면에도 반영된다(미리보기에서 드래그 → PATCH 저장).
  const [capPos, setCapPos] = useState<SubtitlePosition | null>(null);

  const [lecture, setLecture] = useState<LectureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // 본문은 단일 영상이 아니라 슬라이드쇼(이미지 + 구간 음성 + 타임라인)로 재생한다.
  // 진행 콜백은 ref 로 최신화해 훅(안정 콜백)과 퀴즈/집중도 로직의 순환 의존을 끊는다.
  const stageRef = useRef<HTMLDivElement | null>(null);
  // 전체화면은 영상 영역만이 아니라 플레이어 전체(영상+Q&A 패널)를 대상으로 한다.
  // stageRef(.video)만 전체화면하면 우측 채팅이 사라지고 슬라이드가 레터박스된다.
  const playerRef = useRef<HTMLDivElement | null>(null);
  // 강의 화면 ↔ Q&A 채팅 좌우 비율(데스크탑). 경계 핸들을 드래그해 바꾼다.
  // 0.3~0.8 로 클램프. CSS 변수 --stage-basis 로 .stage 폭에 전달한다(모바일은
  // 미디어쿼리가 세로 스택으로 덮어써 이 값은 무시된다).
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [stageRatio, setStageRatio] = useState(0.6);
  const resizingRef = useRef(false);
  const startResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizingRef.current = true;
  }, []);
  const moveResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizingRef.current) return;
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    setStageRatio(Math.min(0.8, Math.max(0.3, ratio)));
  }, []);
  const endResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizingRef.current) return;
    resizingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
  }, []);
  const handleProgressRef = useRef<(sec: number) => void>(() => {});
  const handleProgress = useCallback(
    (sec: number) => handleProgressRef.current(sec),
    [],
  );
  const player = useSlideshowPlayback(slug, handleProgress);
  // 렌더에서 쓰는 필드/안정 메서드는 구조분해(멤버로 ref 에 접근하지 않도록).
  const {
    audioRef,
    currentSlide,
    ready: playerReady,
    bodyReady,
    pause: pausePlayer,
    play: playPlayer,
  } = player;
  const isPlaying = player.isPlaying;
  const progressSec = Math.floor(player.currentTime);
  const durationSec = player.duration;

  // 강의에 저장된 자막 위치가 로드되면 로컬 상태로 동기화(학생·미리보기 공통).
  const loadedCapPos = player.subtitlePosition;
  useEffect(() => {
    setCapPos(loadedCapPos);
  }, [loadedCapPos]);

  // 자막 언어별 기본 폰트 — 한국어=프리텐다드, 중국어(한자)=명조. 자막 내용으로 언어를
  // 추정해 적용한다(교수자가 칩으로 직접 고른 경우엔 그 선택을 유지). 학생 화면엔 폰트
  // 칩이 없으므로 이 추정 기본값이 곧 학생이 보는 자막 폰트가 된다.
  const slides = player.slides;
  useEffect(() => {
    if (capFontUserSetRef.current) return;
    const sample = slides
      .map((s) => s.subtitle_text || s.text || "")
      .join(" ")
      .slice(0, 2000);
    const script = detectCaptionScript(sample);
    if (script === "zh") setCapFont("serif");
    else if (script === "ko") setCapFont("pretendard");
  }, [slides]);

  // 미리보기에서 교수자가 자막을 끌어 놓으면(또는 '기본 위치로') 강의에 저장한다.
  // 폰트/색/크기는 미리보기 임시값이지만 위치는 학생 화면에 반영돼야 하므로 PATCH.
  const saveCapPos = useCallback(
    async (pos: SubtitlePosition | null) => {
      if (!preview || !lecture) return;
      try {
        await api.patch(`/api/lectures/${lecture.id}`, {
          subtitle_position: pos,
        });
      } catch {
        /* 저장 실패는 조용히 무시 — 로컬 미리보기 위치는 유지된다. */
      }
    },
    [preview, lecture],
  );

  // 음성 빠르기 — 본문 슬라이드쇼 <audio> 의 playbackRate 를 즉시 바꾼다. 슬라이드가
  // 넘어가면 src 가 바뀌며 rate 가 1.0 으로 초기화되므로 loadeddata/play 에 재적용한다.
  // currentTime 은 배속과 무관한 미디어 시각이라 자막·슬라이드 동기는 그대로 유지된다.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = voiceRate;
    const reapply = () => {
      if (audioRef.current) audioRef.current.playbackRate = voiceRate;
    };
    a.addEventListener("loadeddata", reapply);
    a.addEventListener("play", reapply);
    return () => {
      a.removeEventListener("loadeddata", reapply);
      a.removeEventListener("play", reapply);
    };
  }, [voiceRate, audioRef]);

  // Q&A
  const [qaMessages, setQaMessages] = useState<QAMessage[]>([
    { role: "assistant", text: "" }, // placeholder welcome (replaced after t() loads)
  ]);
  const [qaInput, setQaInput] = useState("");
  const [qaSending, setQaSending] = useState(false);
  const [micOn, setMicOn] = useState(false);
  // 교수자 사전 제작 추천 질문(클립 보유분). 클릭 시 미리 만든 Q&A 영상 재생.
  const [seedSuggestions, setSeedSuggestions] = useState<
    { id: string; question: string; video_url: string }[]
  >([]);
  // 추천 질문은 기본 접힘 — 채팅 영역을 잠식하지 않게 버튼으로 펼친다.
  const [seedOpen, setSeedOpen] = useState(false);
  const qaBottomRef = useRef<HTMLDivElement>(null);

  // ── Q&A 아바타 영상 재생 위치 ───────────────────────────────────────────────
  // "stage"(기본) = 좌측 강의 화면에 크게 재생, "chat" = 우측 채팅창에서 재생.
  // 강의 화면을 가리는 게 불편한 학습자는 "추천 질문" 왼쪽 토글로 채팅 재생을 고른다.
  const [qaPlayMode, setQaPlayMode] = useState<"stage" | "chat">("stage");
  // 좌측 강의 화면에 오버레이로 재생할 현재 아바타 클립(stage 모드 전용).
  const [stageAvatar, setStageAvatar] = useState<{ url: string } | null>(null);
  const stageAvatarRef = useRef<HTMLVideoElement | null>(null);

  // ── 음량(본문 슬라이드쇼 음성 + 아바타 Q&A 영상 공통) ──────────────────────
  // localStorage 금지(SSR·artifact) — React state 로만 유지. 0~1, 기본 최대.
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const effVolume = muted ? 0 : volume;
  // 핸들러(아바타 onPlay)에서 최신 음량을 읽도록 ref 동기화.
  const volumeRef = useRef(effVolume);
  useEffect(() => {
    volumeRef.current = effVolume;
    // <audio>.volume 은 src 가 바뀌어도 유지되므로(미디어가 아닌 엘리먼트 속성)
    // playbackRate 와 달리 재적용 리스너가 필요 없다. 아바타 Q&A 영상은 자체 네이티브
    // 컨트롤을 가지며 재생 시작(onPlay)에 volumeRef 로 현재 음량을 반영한다.
    if (audioRef.current) audioRef.current.volume = effVolume;
  }, [effVolume, audioRef]);

  // 인터스티셜 퀴즈 — 슬라이드 경계(또는 타임스탬프)에서 우측 Q&A 채팅에 출제.
  // 학생은 채팅에서 보기 버튼/입력으로 답한다(모달 아님).
  const [playbackQuizzes, setPlaybackQuizzes] = useState<PlaybackQuiz[]>([]);
  const [pendingQuiz, setPendingQuiz] = useState<PlaybackQuiz | null>(null);
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  // 퀴즈는 우측 채팅이 아니라 좌측 영상 화면 위 오버레이로 출제·응답한다. 응답 후
  // 결과(정/오답·모범답안 등)를 오버레이에 보여주고, "계속"으로 영상을 재개한다.
  const [quizResult, setQuizResult] = useState<string | null>(null);
  const [quizAnswerInput, setQuizAnswerInput] = useState("");
  const quizzesRef = useRef<PlaybackQuiz[]>([]);
  const shownQuizRef = useRef<Set<string>>(new Set());
  const quizOpenRef = useRef(false);

  // 배포하기 모달(교수자 미리보기 전용) — 강의를 발행하고 학생 링크·QR 을 보여준다.
  const [deployOpen, setDeployOpen] = useState(false);
  const [deployStatus, setDeployStatus] = useState<
    "publishing" | "published" | "error"
  >("publishing");

  // 아바타 Q&A 영상과 강의(슬라이드쇼)는 음성이 겹치지 않도록 상호 배타로 재생한다.
  // 아바타가 재생되면 강의를 멈추고, 강의가 재생되면 아바타를 멈춘다.
  const activeAvatarRef = useRef<HTMLVideoElement | null>(null);
  // timeupdate 클로저가 최신 값을 읽도록 ref 동기화.
  useEffect(() => {
    quizzesRef.current = playbackQuizzes;
  }, [playbackQuizzes]);
  useEffect(() => {
    quizOpenRef.current = pendingQuiz !== null;
  }, [pendingQuiz]);

  // 첫 진입 온보딩. 서버 onboarded_at("다시 보지 않기")를 우선 확인해 영구 스킵.
  // 확인 전(false)엔 띄우지 않아, 이미 스킵한 사용자에게 깜빡임이 없다.
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // 비로그인(데모 등)은 서버 플래그가 없으니 기존대로 표시(컴포넌트 sessionStorage 가드).
      // 동기 setState-in-effect 회피 — rAF 로 다음 프레임에.
      const h = requestAnimationFrame(() => {
        if (!cancelled) setShowOnboarding(true);
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(h);
      };
    }
    (async () => {
      try {
        const { data } = await userApi.getMe();
        if (!cancelled) setShowOnboarding(!data.onboarded_at);
      } catch {
        // 조회 실패 시 안내는 보여준다(놓치는 것보다 한 번 더 보는 게 안전).
        if (!cancelled) setShowOnboarding(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // "다시 보지 않기" — 즉시 숨기고 서버에 영구 스킵 기록(fire-and-forget).
  // 비로그인(익명) 시청자는 서버 플래그가 없고 markOnboarded 가 인증 필요(401 →
  // /auth/login 리다이렉트)라 호출하지 않는다. 익명은 컴포넌트 sessionStorage 가드로
  // 같은 세션 내 재노출만 막으면 충분하다.
  const handleDismissOnboardingForever = () => {
    setShowOnboarding(false);
    if (user) userApi.markOnboarded().catch(() => {});
  };

  // ─── 강의 fetch ───
  useEffect(() => {
    if (!slug) {
      router.replace("/dashboard");
      return;
    }
    (async () => {
      // 새 탭(교수자 미리보기)·직접 진입은 메모리상 access 토큰이 휘발돼 있다.
      // /public 은 소유 교수자면 미발행 강의도 내려주는데(owner-bypass), 토큰이
      // 없으면 viewer=익명으로 처리돼 미발행 강의가 404 → /dashboard 로 튕긴다.
      // 그래서 fetch 전에 refresh 쿠키로 access 토큰을 선제 복원한다(비로그인은 그냥 통과).
      await bootstrapAuth();
      try {
        const { data } = await api.get<LectureData>(`/api/lectures/${slug}/public`);
        if (data.is_expired) {
          router.replace("/expired");
          return;
        }
        setLecture(data);
      } catch {
        router.replace("/dashboard");
      }
      setLoading(false);
    })();
  }, [slug, router]);

  // ─── 세션 생성 + 첫 환영 메시지 ───
  useEffect(() => {
    // 미리보기 모드: 학생 시청 세션·집중도를 만들지 않는다(분석 오염 방지).
    // sessionId 가 null 로 남으면 퀴즈 제출·Q&A·집중도 등은 기존 가드로 no-op.
    if (preview) return;
    if (!lecture || !user || !durationSec) return;
    (async () => {
      try {
        const { data } = await api.post("/api/v1/sessions", null, {
          params: { lecture_id: lecture.id, total_sec: Math.ceil(durationSec) },
        });
        setSessionId(data.id);
        await api.post("/api/v1/attention/start", {
          session_id: data.id,
          user_id: user.id,
          lecture_id: lecture.id,
        });
      } catch {
        /* ignore */
      }
    })();
  }, [lecture, user, durationSec, preview]);

  // ─── 재생 구간 히트맵 계측 (스펙 11 §F, 10 §3.1) ───
  // 슬라이드 진입/완료 이벤트를 watch_events 로 적재한다(분석 대시보드 §F 의 1차 자료,
  // 소급 수집 불가). 로그인 학생의 실제 세션(sessionId)에서만 발생하며 익명·미리보기는
  // sessionId 가 null 이라 no-op. 학습 흐름과 무관한 fire-and-forget — 실패·예외는 전부
  // 삼켜 재생에 영향 주지 않는다. 슬라이드가 바뀔 때 직전 슬라이드 완료(+체류시간)와
  // 새 슬라이드 진입을 함께 보낸다.
  const watchSlideRef = useRef<{ index: number; enteredAt: number } | null>(null);
  useEffect(() => {
    if (!sessionId || !currentSlide) return;
    const idx = currentSlide.slide_index;
    const prev = watchSlideRef.current;
    if (prev && prev.index === idx) return;
    const now = Date.now();
    const events: Record<string, unknown>[] = [];
    if (prev) {
      events.push({
        event_type: "segment_complete",
        slide_index: prev.index,
        meta: { dwell_seconds: Math.max(0, Math.round((now - prev.enteredAt) / 1000)) },
      });
    }
    events.push({ event_type: "segment_enter", slide_index: idx });
    watchSlideRef.current = { index: idx, enteredAt: now };
    void api
      .post("/api/v1/dashboard/watch-events", { session_id: sessionId, events })
      .catch(() => {
        /* 분석 계측 실패는 무시 — 재생에 영향 없음 */
      });
  }, [currentSlide, sessionId]);

  // ─── 인터스티셜 퀴즈 목록 fetch (타임스탬프 트리거용, 정답·해설 미포함) ───
  // /quiz/playback 은 선택 인증으로 바뀌어(발행 강의는 익명도 조회) 비로그인 홍보
  // 시청에서도 퀴즈가 영상 중간에 뜬다. 정답·해설은 응답에 없고, 익명은 세션이 없어
  // 제출 시 안내만 표시된다(채점은 로그인 학생만). 교수자 미리보기는 preview 경로.
  useEffect(() => {
    if (!lecture?.id) return;
    let cancelled = false;
    (async () => {
      const quizzes = await getPlaybackQuizzes(lecture.id, preview);
      if (!cancelled) setPlaybackQuizzes(quizzes);
    })();
    return () => {
      cancelled = true;
    };
  }, [lecture?.id, preview]);

  // ─── 추천(사전 제작) 질문 fetch — 클립 보유분만, 클릭 시 사전 제작 영상 재생 ───
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      // slideshow 와 동일 — 미발행 강의의 사전 질문은 소유 교수자에게만 보인다.
      // 새 탭(미리보기)엔 토큰이 없어 익명 호출 시 404(401 아님)로 떨어져 추천이
      // 안 뜬다. 호출 전 refresh 쿠키로 토큰을 선제 복원한다(학생/발행 강의엔 무영향).
      await bootstrapAuth();
      if (cancelled) return;
      try {
        const { data } = await api.get<{
          questions: { id: string; question: string; video_url: string }[];
        }>(`/api/lectures/${slug}/seed-questions/public`);
        if (!cancelled) setSeedSuggestions(data.questions ?? []);
      } catch {
        /* 사전 질문 없으면 추천 미표시 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // 환영 메시지를 i18n locale 로드 후 한 번 세팅 (placeholder → 실제 텍스트).
  // react-hooks/set-state-in-effect: rAF 로 비동기화.
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      setQaMessages((prev) =>
        prev.length === 1 && prev[0]?.text === ""
          ? [
              {
                role: "assistant",
                text: t("student.playerV2.qaWelcome"),
                source: t("student.playerV2.qaSourceFallback"),
              },
            ]
          : prev,
      );
    });
    return () => cancelAnimationFrame(handle);
  }, [t]);

  // ─── 언로드 시 세션 paused ───
  useEffect(() => {
    if (!sessionId) return;
    const pause = () => {
      // 중앙 API_URL 사용 — prod 빌드에 env 누락 시 api.ts 가 먼저 throw 하므로
      // 여기서 localhost 로 조용히 새지 않는다.
      const tok = tokenStorage.getAccess();
      fetch(`${API_URL}/api/v1/sessions/${sessionId}?status=paused`, {
        method: "PATCH",
        keepalive: true,
        headers: tok ? { Authorization: `Bearer ${tok}` } : undefined,
      }).catch(() => {});
    };
    window.addEventListener("beforeunload", pause);
    return () => {
      window.removeEventListener("beforeunload", pause);
      pause();
    };
  }, [sessionId]);

  const attention = useAttention({ sessionId: sessionId || "" });

  // ─── 인터스티셜 퀴즈: 슬라이드 경계에서 우측 채팅에 출제 → 채팅에서 응답 ───
  const resumeAfterQuiz = () => playPlayer();

  /** 퀴즈를 좌측 영상 화면 위 오버레이로 띄운다(이미 출제분 skip). 영상은 답할 때까지
   *  일시정지. 채팅이 아니라 영상 화면에 출제된다. */
  const openQuiz = useCallback(
    (quiz: PlaybackQuiz) => {
      if (shownQuizRef.current.has(quiz.id)) return;
      shownQuizRef.current.add(quiz.id);
      quizOpenRef.current = true;
      pausePlayer();
      setQuizResult(null);
      setQuizAnswerInput("");
      setPendingQuiz(quiz);
    },
    [pausePlayer],
  );

  const triggerNextQuiz = (): boolean => {
    if (quizOpenRef.current) return false;
    const next = quizzesRef.current.find((q) => !shownQuizRef.current.has(q.id));
    if (!next) return false;
    openQuiz(next);
    return true;
  };

  // 진행 콜백 — 집중도 + 슬라이드 anchor 가 없는(AI 형성평가) 퀴즈를 타임스탬프로 출제.
  // 슬라이드 anchor 가 있는 스튜디오 퀴즈는 아래 currentIndex effect 가 담당한다(추정
  // 타임스탬프 vs 실측 재생 시간 불일치로 시간 기준은 안 맞음 — slideshow-timeline 축).
  useEffect(() => {
    handleProgressRef.current = (sec: number) => {
      attention.setProgress(sec);
      if (!quizOpenRef.current) {
        const due = quizzesRef.current.find(
          (q) =>
            q.insert_after_slide_index == null &&
            q.timestamp_seconds != null &&
            sec >= q.timestamp_seconds &&
            !shownQuizRef.current.has(q.id),
        );
        if (due) openQuiz(due);
      }
    };
  }, [attention, openQuiz]);

  // 슬라이드 anchor 퀴즈 — 문제가 걸린 슬라이드를 지나면 출제(실측 슬라이드 전환 기준).
  useEffect(() => {
    if (quizOpenRef.current) return;
    const idx = player.currentIndex;
    const due = quizzesRef.current.find(
      (q) =>
        q.insert_after_slide_index != null &&
        idx > q.insert_after_slide_index &&
        !shownQuizRef.current.has(q.id),
    );
    if (!due) return;
    const h = requestAnimationFrame(() => openQuiz(due));
    return () => cancelAnimationFrame(h);
  }, [player.currentIndex, openQuiz]);

  // 퀴즈 종료(오버레이 닫기) → 영상 재개.
  const finishQuiz = () => {
    setPendingQuiz(null);
    setQuizResult(null);
    setQuizAnswerInput("");
    quizOpenRef.current = false;
    setQuizSubmitting(false);
    resumeAfterQuiz();
  };

  /** 영상 오버레이에서 퀴즈 응답. userAnswer=객관식 보기 index 문자열 / 주관식 텍스트.
   *  기록·채점 결과를 같은 오버레이에 표시하고, 학생이 "계속"을 누르면 영상을 재개한다. */
  const answerQuiz = async (quiz: PlaybackQuiz, userAnswer: string) => {
    if (quizSubmitting || quizResult !== null) return;

    // 세션 없음 — 채점·기록 없이 안내만 표시. 교수자 미리보기 vs 비로그인(홍보 익명
    // 시청)을 구분한다: 미리보기는 "학생이 응답" 안내, 익명은 로그인 유도.
    if (!sessionId) {
      setQuizResult(
        t(
          preview
            ? "student.playerV2.quiz.previewNote"
            : "student.playerV2.quiz.demoNote",
        ),
      );
      return;
    }

    setQuizSubmitting(true);
    const isMC = quiz.question_type === "multiple_choice";
    try {
      const res = await submitInterstitialAnswer(lecture!.id, {
        sessionId,
        questionId: quiz.id,
        userAnswer,
        videoTimestampSeconds: progressSec,
      });
      let resultText: string;
      if (!res.reveal) {
        resultText = t("student.playerV2.quiz.recordedFeedback");
      } else if (isMC) {
        const head =
          res.is_correct === true
            ? t("student.playerV2.quiz.correctFeedback")
            : t("student.playerV2.quiz.wrongFeedback");
        const ans =
          res.correct_answer != null
            ? `\n${t("student.playerV2.quiz.correctAnswerLabel")}: ${indexToLetter(res.correct_answer)}`
            : "";
        const expl = res.explanation ? `\n${res.explanation}` : "";
        resultText = `${head}${ans}${expl}`;
      } else {
        const model = res.correct_answer
          ? `${t("student.playerV2.quiz.modelAnswerLabel")}: ${res.correct_answer}`
          : t("student.playerV2.quiz.recordedFeedback");
        const expl = res.explanation ? `\n${res.explanation}` : "";
        resultText = `${model}${expl}`;
      }
      setQuizResult(resultText);
    } catch {
      setQuizResult(t("student.playerV2.quiz.recordError"));
    }
    setQuizSubmitting(false);
  };

  // ─── 아바타 Q&A ↔ 강의영상 상호 배타 재생 ───
  // 강의(슬라이드쇼)가 재생되기 시작하면, 재생 중이던 아바타 Q&A 영상을 멈춰
  // 음성이 겹치지 않게 한다. (반대 방향 — 아바타 재생 시 강의 멈춤 — 은 아바타
  // <video> 의 onPlay 에서 pausePlayer() 로 처리.)
  useEffect(() => {
    if (isPlaying && activeAvatarRef.current) {
      activeAvatarRef.current.pause();
    }
  }, [isPlaying]);

  // 새 아바타 답변(캐시 적중·추천 질문)을 받으면, stage 모드일 때 좌측 강의 화면에
  // 띄운다. setState-in-effect 를 피하려 이벤트 핸들러(sendQuestion·playSeedQuestion)
  // 에서 직접 호출한다(qaPlayMode 는 클릭/전송 시점 값으로 충분).
  const routeAvatarToStage = (url: string) => {
    if (qaPlayMode === "stage") setStageAvatar({ url });
  };

  // ─── 재생 컨트롤 (슬라이드쇼 엔진에 위임) ───
  const togglePlay = () => player.togglePlay();
  const seekDelta = (delta: number) => player.seekDelta(delta);
  const toggleFullscreen = () => {
    const el = playerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen?.()
        .then(() => {
          // 모바일: 전체화면 진입 시 가로로 회전(세로 스택은 영상이 너무 납작해
          // 보기 힘들다). 지원 브라우저(주로 Android)만 적용되고, 미지원(데스크탑·
          // iOS Safari)에선 reject 돼 조용히 무시된다.
          const orientation = screen.orientation as ScreenOrientation & {
            lock?: (o: "landscape") => Promise<void>;
          };
          orientation?.lock?.("landscape").catch(() => {});
        })
        .catch(() => {});
    }
  };

  // 전체화면을 벗어나면(컨트롤 버튼·시스템 뒤로가기·ESC 모두 포함) 가로 잠금을 푼다.
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        try {
          (
            screen.orientation as ScreenOrientation & { unlock?: () => void }
          )?.unlock?.();
        } catch {
          /* no-op */
        }
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // ─── 배포하기(미리보기 전용) — 강의 발행 후 학생 링크·QR 모달 표시 ───
  const openDeploy = async () => {
    if (!lecture) return;
    pausePlayer();
    setDeployStatus("publishing");
    setDeployOpen(true);
    try {
      // 미발행 강의를 발행해 학생이 /v/[slug] 링크로 접속할 수 있게 한다.
      await api.patch(`/api/lectures/${lecture.id}`, { is_published: true });
      setDeployStatus("published");
    } catch {
      setDeployStatus("error");
    }
  };

  // ─── Q&A 전송 ───
  const sendQuestion = async (text?: string) => {
    const question = (text ?? qaInput).trim();
    if (!question) return;
    setQaInput("");
    setQaMessages((m) => [...m, { role: "user", text: question }]);
    setQaSending(true);
    try {
      // 호출 경로 3종:
      //  - 미리보기(교수자): 소유 교수자 전용 /qa/preview (세션 없음)
      //  - 로그인 학생(세션 보유): 세션 기반 /qa (로그·아바타 캐시)
      //  - 익명 시청(세션 없음): 공개 /qa/public (발행 강의, 인증 불필요)
      // 요청 타임아웃(75초) — 백엔드/외부 API 가 멈춰도 "..."가 무한 대기하지 않도록.
      // 초과하면 axios 가 reject → 아래 catch 가 오류 답변을 띄운다.
      const { data } = preview
        ? await api.post(
            `/api/v1/qa/preview`,
            { lecture_id: lecture?.id, question },
            { timeout: 75000 },
          )
        : sessionId
          ? await api.post(
              `/api/v1/qa`,
              { session_id: sessionId, lecture_id: lecture?.id, question },
              { timeout: 75000 },
            )
          : await api.post(
              `/api/v1/qa/public`,
              { lecture_id: lecture?.id, question },
              { timeout: 75000 },
            );
      // 겹치는 질문이라 사전 렌더된 아바타 클립이 있으면 함께 재생(부가).
      const avatarUrl: string | null = data.avatar?.video_url ?? null;
      setQaMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: data.answer ?? t("student.playerV2.qaGenericFallback"),
          source: data.source ?? t("student.playerV2.qaSourceFallback"),
          avatarUrl,
          // 투명성(09 §5.2) — 캐시 클립이 맞춰진 원 질문.
          matchedQuestion: data.avatar?.matched_question ?? null,
        },
      ]);
      // stage 모드면 좌측 강의 화면에 자동 재생(채팅 모드는 채팅에서 인라인 재생).
      if (avatarUrl) routeAvatarToStage(avatarUrl);
    } catch {
      setQaMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: t("student.playerV2.qaErrorAnswer"),
          source: null,
        },
      ]);
    }
    setQaSending(false);
    setTimeout(() => qaBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  // ─── 추천(사전 제작) 질문 클릭 — 실시간 RAG 대신 미리 만든 Q&A 영상 재생 ───
  // 일반 질문은 채팅(sendQuestion)으로 RAG, 추천 질문은 교수자가 미리 만든 정답
  // 클립을 보여준다. 강의를 잠시 멈추고 질문+정답 영상을 채팅에 띄운다.
  const playSeedQuestion = (q: {
    id: string;
    question: string;
    video_url: string;
  }) => {
    pausePlayer();
    setQaMessages((m) => [
      ...m,
      { role: "user", text: q.question },
      { role: "assistant", text: "", avatarUrl: q.video_url, seed: true },
    ]);
    // stage 모드면 좌측 강의 화면에 자동 재생(채팅 모드는 채팅에서 인라인 재생).
    routeAvatarToStage(q.video_url);
    setTimeout(
      () => qaBottomRef.current?.scrollIntoView({ behavior: "smooth" }),
      50,
    );
  };

  if (loading) {
    return (
      <PlayerSurfaceDark>
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            color: "rgba(255,255,255,0.55)",
            fontSize: 14,
          }}
        >
          <p role="status">{t("student.entry.loadingLecture")}</p>
        </div>
      </PlayerSurfaceDark>
    );
  }
  if (!lecture) return null;

  const titleSegments = parseCourseTitle(lecture.title);
  const week = lecture.week_number ?? null;
  const userInitial = (user?.name ?? user?.email ?? "?").trim().charAt(0).toUpperCase();
  const userSchoolDept = (() => {
    // useAuth 의 AuthUser 에는 school / department 가 없어 안전하게 옵셔널.
    type Maybe = { school?: string; department?: string; year?: number | string };
    const u = (user ?? null) as (typeof user & Maybe) | null;
    const parts: string[] = [];
    if (u?.school) parts.push(u.school);
    if (u?.department) parts.push(u.department);
    if (u?.year) parts.push(`${u.year}학년`);
    return parts.join(" · ");
  })();

  // Q&A 답변자 아이콘 — 강의 아바타 얼굴 이미지가 있으면 그 얼굴, 없으면 'AI' 텍스트.
  const botAvatar = lecture?.avatar_image_url ? (
    <span className={`${styles.msgAv} ${styles.msgAvBot}`} aria-label="AI">
      {/* presigned S3 URL(만료·외부 도메인 가변)이라 next/image 부적합 → 일반 img. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={lecture.avatar_image_url}
        alt=""
        className={styles.msgAvImg}
        draggable={false}
      />
    </span>
  ) : (
    <span className={`${styles.msgAv} ${styles.msgAvBot}`}>AI</span>
  );

  return (
    <PlayerSurfaceDark>
      <div className={styles.player} ref={playerRef}>
        {/* Top bar */}
        <header className={styles.bar}>
          <div className={styles.course}>
            <span className={styles.crumb}>
              {week
                ? t("student.playerV2.crumb", { week: String(week) })
                : t("student.entry.lessonNumberFallback")}
            </span>
            <span className={styles.courseTitle}>
              {titleSegments.map((seg, i) =>
                seg.kind === "han" ? (
                  <span key={i} className="han">
                    {seg.text}
                  </span>
                ) : seg.kind === "pcl" ? (
                  <span key={i} className="pcl">
                    {seg.text}
                  </span>
                ) : (
                  <span key={i}>{seg.text}</span>
                ),
              )}
            </span>
          </div>
          <div className={styles.user}>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label={t("student.playerV2.userSettings")}
              onClick={() => router.push("/profile")}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
            </button>
            <div className={styles.userInfo}>
              <span className="name">{user?.name ?? "—"}</span>
              {userSchoolDept && <span className="school">{userSchoolDept}</span>}
            </div>
            <div className={styles.userAvatar} aria-hidden="true">
              {userInitial}
            </div>
          </div>
        </header>

        {/* Body */}
        <div
          className={styles.body}
          ref={bodyRef}
          style={
            { "--stage-basis": `${stageRatio * 100}%` } as React.CSSProperties
          }
        >
          <div className={styles.stage}>
            <div className={styles.video} ref={stageRef}>
              {/* 본문 = 슬라이드쇼: 현재 슬라이드 이미지 + 숨겨진 구간 음성 + 자막. */}
              <audio ref={audioRef} preload="auto" aria-hidden="true" />
              {/* 본문 렌더가 끝났고(bodyReady) 슬라이드 이미지가 있을 때만 재생면을
                  보여준다. 공개됐지만 아직 렌더 중(bodyReady=false)이면 무음으로
                  슬라이드만 넘기는 대신 "준비 중" 안내를 띄운다. */}
              {bodyReady && currentSlide ? (
                currentSlide.image_url ? (
                  <button
                    type="button"
                    className={styles.slideClick}
                    onClick={togglePlay}
                    aria-label={t("student.playerV2.controlPlay")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={currentSlide.image_url}
                      alt={lecture.title}
                      className={styles.slideImg}
                    />
                  </button>
                ) : (
                  /* 슬라이드 PNG 가 없는 경우(LibreOffice 렌더 실패·미생성). 본문 음성은
                     준비됐으므로 "준비 안 됨"으로 막지 않고 발화 텍스트를 슬라이드로
                     대체해 재생을 잇는다(자막도 함께 노출). */
                  <button
                    type="button"
                    className={styles.slideFallback}
                    onClick={togglePlay}
                    aria-label={t("student.playerV2.controlPlay")}
                  >
                    <span className={styles.slideFallbackNum}>
                      {currentSlide.slide_index + 1}
                    </span>
                    <span className={styles.slideFallbackText}>
                      {currentSlide.text}
                    </span>
                  </button>
                )
              ) : (
                <div className={styles.placeholder}>
                  <div className={styles.playOrb}>
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M7 4.5v15a1 1 0 0 0 1.55.83l11-7.5a1 1 0 0 0 0-1.66l-11-7.5A1 1 0 0 0 7 4.5z" />
                    </svg>
                  </div>
                  <span className={styles.placeholderLabel}>
                    {playerReady
                      ? t("student.playerV2.videoNotReady")
                      : t("student.entry.loadingLecture")}
                  </span>
                  {playerReady && !bodyReady && (
                    <span className={styles.placeholderLabel}>
                      {t("student.playerV2.videoNotReadyDesc")}
                    </span>
                  )}
                </div>
              )}

              {/* 자막 — 한국어 음성에 맞춰 외국어 번역 자막을 문장 단위로 순차
                  노출(노래방식). 구간 내 경과 시간 비례로 현재 문장을 보여준다. */}
              {captionsOn && currentSlide &&
                (currentSlide.subtitle_text || currentSlide.text) && (
                  <KaraokeCaption
                    className={styles.caption}
                    text={currentSlide.subtitle_text || currentSlide.text}
                    sourceText={
                      currentSlide.subtitle_text ? currentSlide.text : undefined
                    }
                    cues={currentSlide.subtitle_cues}
                    elapsed={player.currentSlideElapsed}
                    duration={player.currentSlideDuration}
                    fontSize={a11y.fontSize}
                    highContrast={a11y.highContrast}
                    userScale={capScale}
                    userColor={capColor}
                    userFont={capFont}
                    leadSeconds={capLead}
                    position={capPos}
                    draggable={preview}
                    onDragMove={setCapPos}
                    onDragEnd={(p) => {
                      setCapPos(p);
                      void saveCapPos(p);
                    }}
                  />
                )}

              {/* 미리보기 전용 싱크 진단 배지 — 이 슬라이드에 발성 시각 cue 가 있으면
                  '정밀 싱크', 없으면 글자수 추정 폴백('추정 싱크'). cue 가 안 생기면
                  (워커 미배포·정렬 실패 등) 여기서 바로 드러난다. 학생 화면엔 안 보인다. */}
              {preview && captionsOn && currentSlide &&
                (currentSlide.subtitle_text || currentSlide.text) && (
                  <span className={styles.syncBadge}>
                    {currentSlide.subtitle_cues &&
                    currentSlide.subtitle_cues.length > 0
                      ? "정밀 싱크"
                      : "추정 싱크"}
                  </span>
                )}

              {/* Q&A 아바타 — stage 모드: 좌측 강의 화면에 크게 오버레이 재생.
                  강의(슬라이드)를 잠시 가리고, 닫거나 끝나면 다시 강의로 돌아간다. */}
              {qaPlayMode === "stage" && stageAvatar && (
                <div className={styles.stageAvatar}>
                  <video
                    key={stageAvatar.url}
                    ref={stageAvatarRef}
                    src={stageAvatar.url}
                    autoPlay
                    playsInline
                    controls
                    aria-label="AI 아바타 답변"
                    onPlay={(e) => {
                      pausePlayer();
                      const prev = activeAvatarRef.current;
                      if (prev && prev !== e.currentTarget) prev.pause();
                      e.currentTarget.volume = volumeRef.current;
                      activeAvatarRef.current = e.currentTarget;
                    }}
                    onPause={(e) => {
                      if (activeAvatarRef.current === e.currentTarget) {
                        activeAvatarRef.current = null;
                      }
                    }}
                    onEnded={(e) => {
                      if (activeAvatarRef.current === e.currentTarget) {
                        activeAvatarRef.current = null;
                      }
                      setStageAvatar(null);
                    }}
                  />
                  <button
                    type="button"
                    className={styles.stageAvatarClose}
                    onClick={() => {
                      if (stageAvatarRef.current) stageAvatarRef.current.pause();
                      setStageAvatar(null);
                    }}
                    aria-label="강의 화면 아바타 닫기"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.4}
                      strokeLinecap="round"
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              )}

              {/* 인터스티셜 퀴즈 — 좌측 영상 화면 위 오버레이로 출제·응답(채팅 아님). */}
              {pendingQuiz && (
                <div
                  className={styles.quizStage}
                  role="dialog"
                  aria-label={t("student.playerV2.quiz.badge")}
                >
                  <div className={styles.quizCard}>
                    <div className={styles.quizTop}>
                      <span className={styles.quizBadge}>
                        {t("student.playerV2.quiz.badge")}
                      </span>
                    </div>
                    {quizResult === null ? (
                      <>
                        <p className={styles.quizQ}>{pendingQuiz.content}</p>
                        {pendingQuiz.question_type === "multiple_choice" ? (
                          <div className={styles.quizOpts}>
                            {(pendingQuiz.options ?? []).map((opt, oi) => {
                              const letter = String.fromCharCode(65 + oi);
                              const quiz = pendingQuiz;
                              return (
                                <button
                                  key={oi}
                                  type="button"
                                  className={styles.quizOpt}
                                  disabled={quizSubmitting}
                                  onClick={() => answerQuiz(quiz, String(oi))}
                                >
                                  <span className={styles.letter}>{letter}</span>
                                  <span>{opt}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <form
                            className={styles.quizShortForm}
                            onSubmit={(e) => {
                              e.preventDefault();
                              const txt = quizAnswerInput.trim();
                              if (!txt || quizSubmitting) return;
                              void answerQuiz(pendingQuiz, txt);
                            }}
                          >
                            <input
                              className={styles.quizShortInput}
                              value={quizAnswerInput}
                              onChange={(e) => setQuizAnswerInput(e.target.value)}
                              placeholder={t(
                                "student.playerV2.quiz.shortAnswerPlaceholder",
                              )}
                              maxLength={500}
                              autoFocus
                            />
                            <button
                              type="submit"
                              className={styles.quizSubmit}
                              disabled={quizSubmitting || !quizAnswerInput.trim()}
                            >
                              {quizSubmitting
                                ? t("student.playerV2.quiz.submitting")
                                : t("student.playerV2.quiz.submit")}
                            </button>
                          </form>
                        )}
                      </>
                    ) : (
                      <>
                        <p
                          className={styles.quizResult}
                          style={{ whiteSpace: "pre-line" }}
                        >
                          {quizResult}
                        </p>
                        <button
                          type="button"
                          className={styles.quizContinue}
                          onClick={finishQuiz}
                        >
                          {t("student.playerV2.quiz.continue")}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom controls */}
            <div className={styles.controls}>
              <div
                className={styles.progress}
                role="progressbar"
                aria-valuenow={progressSec}
                aria-valuemin={0}
                aria-valuemax={durationSec || 100}
                onClick={(e) => {
                  if (!durationSec) return;
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  player.seekTo((x / rect.width) * durationSec);
                }}
              >
                <div
                  className={styles.progressBuffer}
                  style={{
                    width: `${durationSec > 0 ? Math.min(((progressSec + 20) / durationSec) * 100, 100) : 0}%`,
                  }}
                />
                <div
                  className={styles.progressFill}
                  style={{
                    width: `${durationSec > 0 ? (progressSec / durationSec) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className={styles.controlsRow}>
                <div className={styles.controlsLeft}>
                  <button
                    type="button"
                    className={`${styles.ctrl} ${styles.play}`}
                    onClick={togglePlay}
                    aria-label={t("student.playerV2.controlPlay")}
                  >
                    {isPlaying ? (
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="5" width="4" height="14" rx="1" />
                        <rect x="14" y="5" width="4" height="14" rx="1" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 4.5v15a1 1 0 0 0 1.55.83l11-7.5a1 1 0 0 0 0-1.66l-11-7.5A1 1 0 0 0 7 4.5z" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    className={styles.ctrl}
                    onClick={() => seekDelta(-10)}
                    aria-label={t("student.playerV2.controlBack10")}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M11 17l-5-5 5-5" />
                      <path d="M6 12h8a6 6 0 1 1 0 12h-2" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={styles.ctrl}
                    onClick={() => seekDelta(10)}
                    aria-label={t("student.playerV2.controlFwd10")}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M13 17l5-5-5-5" />
                      <path d="M18 12h-8a6 6 0 1 0 0 12h2" />
                    </svg>
                  </button>
                  <span className={styles.timeLabel}>
                    {formatClock(progressSec)} / {formatClock(durationSec)}
                  </span>
                </div>
                <div className={styles.controlsRight}>
                  {/* 자막·속도 설정 — 미리보기·학생·익명 모두에게 노출(자막 모양·속도는
                      시청자 로컬 환경설정). 단 '위치'는 강의에 저장돼 학생 화면에 반영되므로
                      미리보기(교수자)에서만 보인다. */}
                  <div className={styles.avSettingsWrap}>
                      <button
                        type="button"
                        className={styles.ctrl}
                        aria-label="자막·속도 설정"
                        aria-expanded={avSettingsOpen}
                        onClick={() => setAvSettingsOpen((v) => !v)}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                        >
                          <line x1="4" y1="7" x2="20" y2="7" />
                          <circle cx="9" cy="7" r="2.4" fill="currentColor" stroke="none" />
                          <line x1="4" y1="17" x2="20" y2="17" />
                          <circle cx="15" cy="17" r="2.4" fill="currentColor" stroke="none" />
                        </svg>
                      </button>
                      {avSettingsOpen && (
                        <>
                          <div
                            className={styles.avBackdrop}
                            onClick={() => setAvSettingsOpen(false)}
                            aria-hidden="true"
                          />
                          <div
                            className={styles.avPanel}
                            role="dialog"
                            aria-label="자막·속도 설정"
                          >
                            {/* 자막 — 폰트/색깔/크기 */}
                            <div className={styles.avSection}>
                              <span className={styles.avTitle}>자막</span>
                              <div className={styles.avField}>
                                <span className={styles.avLabel}>폰트</span>
                                <div className={styles.avBtns}>
                                  <button
                                    type="button"
                                    className={`${styles.avChip} ${capFont === "sans" ? styles.avChipOn : ""}`}
                                    onClick={() => {
                                      capFontUserSetRef.current = true;
                                      setCapFont("sans");
                                    }}
                                  >
                                    고딕
                                  </button>
                                  <button
                                    type="button"
                                    className={`${styles.avChip} ${capFont === "serif" ? styles.avChipOn : ""}`}
                                    onClick={() => {
                                      capFontUserSetRef.current = true;
                                      setCapFont("serif");
                                    }}
                                  >
                                    명조
                                  </button>
                                  <button
                                    type="button"
                                    className={`${styles.avChip} ${capFont === "pretendard" ? styles.avChipOn : ""}`}
                                    onClick={() => {
                                      capFontUserSetRef.current = true;
                                      setCapFont("pretendard");
                                    }}
                                  >
                                    프리텐다드
                                  </button>
                                </div>
                              </div>
                              <div className={styles.avField}>
                                <span className={styles.avLabel}>색깔</span>
                                <div className={styles.avBtns}>
                                  {CAPTION_COLORS.map((c) => (
                                    <button
                                      key={c}
                                      type="button"
                                      className={`${styles.avSwatch} ${capColor === c ? styles.avSwatchOn : ""}`}
                                      style={{ background: c }}
                                      aria-label={`자막 색 ${c}`}
                                      aria-pressed={capColor === c}
                                      onClick={() => setCapColor(c)}
                                    />
                                  ))}
                                </div>
                              </div>
                              <div className={styles.avSliderTop}>
                                <span className={styles.avLabel}>크기</span>
                                <span className={styles.avVal}>
                                  {Math.round(capScale * 100)}%
                                </span>
                              </div>
                              <input
                                type="range"
                                className="slider-rb"
                                min={0.7}
                                max={1.6}
                                step={0.05}
                                value={capScale}
                                aria-label="자막 크기"
                                onChange={(e) =>
                                  setCapScale(Number(parseFloat(e.target.value).toFixed(2)))
                                }
                              />
                              {/* 위치 — 자막을 끌어서 옮긴다(강의에 저장 → 학생 화면 반영).
                                  강의에 영구 저장되므로 미리보기(교수자)에서만 노출. */}
                              {preview && (
                                <>
                                  <div className={styles.avField}>
                                    <span className={styles.avLabel}>위치</span>
                                    <div className={styles.avBtns}>
                                      <button
                                        type="button"
                                        className={styles.avChip}
                                        onClick={() => {
                                          setCapPos(null);
                                          void saveCapPos(null);
                                        }}
                                        disabled={!capPos}
                                      >
                                        기본 위치로
                                      </button>
                                    </div>
                                  </div>
                                  <p className={styles.avHint}>
                                    {capPos
                                      ? "자막을 끌어서 위치를 옮길 수 있어요. 위치는 강의에 저장돼 학생 화면에도 적용됩니다."
                                      : "영상 위 자막을 끌어서 원하는 위치에 놓으세요. (강의에 저장 → 학생 화면 반영)"}
                                  </p>
                                </>
                              )}
                            </div>

                            {/* 음성 빠르기 */}
                            <div className={styles.avSection}>
                              <div className={styles.avSliderTop}>
                                <span className={styles.avTitle}>음성 빠르기</span>
                                <span className={styles.avVal}>
                                  {voiceRate.toFixed(2)}×
                                </span>
                              </div>
                              <input
                                type="range"
                                className="slider-rb"
                                min={0.5}
                                max={2}
                                step={0.05}
                                value={voiceRate}
                                aria-label="음성 빠르기"
                                onChange={(e) =>
                                  setVoiceRate(Number(parseFloat(e.target.value).toFixed(2)))
                                }
                              />
                              <div className={styles.avEnds}>
                                <span>느리게</span>
                                <span>원배속</span>
                                <span>빠르게</span>
                              </div>
                            </div>

                            {/* 자막 빠르기 (리드) */}
                            <div className={styles.avSection}>
                              <div className={styles.avSliderTop}>
                                <span className={styles.avTitle}>자막 빠르기</span>
                                <span className={styles.avVal}>
                                  {capLead > 0 ? "+" : ""}
                                  {capLead.toFixed(2)}s
                                </span>
                              </div>
                              <input
                                type="range"
                                className="slider-rb"
                                min={-0.5}
                                max={1.5}
                                step={0.05}
                                value={capLead}
                                aria-label="자막 빠르기"
                                onChange={(e) =>
                                  setCapLead(Number(parseFloat(e.target.value).toFixed(2)))
                                }
                              />
                              <div className={styles.avEnds}>
                                <span>느리게</span>
                                <span>맞춤</span>
                                <span>빠르게</span>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  {preview && (
                    <button
                      type="button"
                      className={styles.deployBtn}
                      onClick={openDeploy}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 11l19-9-9 19-2-8-8-2z" />
                      </svg>
                      {t("student.playerV2.deploy.button")}
                    </button>
                  )}
                  {/* 음량 — 본문 슬라이드쇼 음성 + 아바타 Q&A 영상 공통. 음소거
                      버튼 + 슬라이더(좁은 화면에선 슬라이더 숨기고 버튼만). */}
                  <div className={styles.volume}>
                    <button
                      type="button"
                      className={styles.ctrl}
                      onClick={() => setMuted((v) => !v)}
                      aria-label={muted || volume === 0 ? "음소거 해제" : "음소거"}
                      aria-pressed={muted || volume === 0}
                    >
                      {muted || volume === 0 ? (
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M11 5 6 9H2v6h4l5 4z" />
                          <line x1="22" y1="9" x2="16" y2="15" />
                          <line x1="16" y1="9" x2="22" y2="15" />
                        </svg>
                      ) : (
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M11 5 6 9H2v6h4l5 4z" />
                          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                        </svg>
                      )}
                    </button>
                    <input
                      type="range"
                      className={`slider-rb slider-vol ${styles.volumeSlider}`}
                      min={0}
                      max={1}
                      step={0.05}
                      value={muted ? 0 : volume}
                      aria-label="음량"
                      // 트랙 채움 비율(노브 위치)을 CSS 변수로 전달 → 음량만큼만 골드로
                      // 채우고 나머지는 비워(검정) 보이게 한다.
                      style={
                        {
                          "--vol": `${(muted ? 0 : volume) * 100}%`,
                        } as React.CSSProperties
                      }
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setVolume(v);
                        setMuted(v === 0);
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className={styles.ctrl}
                    onClick={() => a11y.setCaptions(!captionsOn)}
                    aria-label={t("student.playerV2.controlCaptions")}
                    aria-pressed={captionsOn}
                    style={captionsOn ? undefined : { opacity: 0.5 }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <line x1="7" y1="11" x2="11" y2="11" />
                      <line x1="7" y1="15" x2="15" y2="15" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={styles.ctrl}
                    onClick={toggleFullscreen}
                    aria-label={t("student.playerV2.controlFullscreen")}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 강의 화면 ↔ Q&A 채팅 경계 핸들 — 잡고 좌우로 끌어 비율 조절(데스크탑).
              모바일(세로 스택)에선 CSS 로 숨긴다. */}
          <div
            className={styles.resizer}
            role="separator"
            aria-orientation="vertical"
            aria-label="강의 화면과 채팅창 비율 조절"
            onPointerDown={startResize}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
          />

          {/* Q&A panel */}
          <aside className={styles.qa} aria-label={t("student.playerV2.qaTitle")}>
            <div className={styles.qaHead}>
              <h3>{t("student.playerV2.qaTitle")}</h3>
            </div>

            <div className={styles.qaBody} aria-live="polite">
              {qaMessages.map((m, i) =>
                m.role === "assistant" ? (
                  <div key={i} className={styles.msg}>
                    {botAvatar}
                    <div>
                      {m.text && (
                        <div
                          className={styles.bubble}
                          style={{ whiteSpace: "pre-line" }}
                        >
                          {stripChatMarkdown(m.text)}
                        </div>
                      )}
                      {m.avatarUrl && !m.seed && (
                        // 투명성(09 §5.2) — 캐시 클립은 비슷한 과거 질문에 렌더된 것.
                        // "권위 있는 답"은 위 텍스트(이 학생 질문에 맞춘 RAG)이고 아바타는
                        // 전달 보조임을 명시한다. (사전 제작 추천 질문은 정확한 답이라 제외.)
                        <span
                          className={styles.source}
                          style={{ marginTop: 8, display: "flex" }}
                          data-testid="qa-avatar-disclaimer"
                        >
                          {m.matchedQuestion
                            ? t("student.playerV2.qaSimilarAnswerOf", {
                                question: m.matchedQuestion,
                              })
                            : t("student.playerV2.qaSimilarAnswer")}
                        </span>
                      )}
                      {m.avatarUrl &&
                        (qaPlayMode === "chat" ? (
                          // 채팅 재생 모드: 채팅창에서 바로 재생. 가로로 채팅창 폭을
                          // 가득 채워(끝에서 끝까지) 작아서 안 보이는 문제를 없앤다.
                          // 텍스트가 본답이고 영상은 전달 보조 — 로드 실패해도 텍스트는
                          // 남는다. 음성 겹침 방지: 아바타 재생 시 (1) 강의를 멈추고
                          // (2) 먼저 재생 중이던 다른 아바타도 멈춘다.
                          <video
                            src={m.avatarUrl}
                            autoPlay
                            playsInline
                            controls
                            aria-label="AI 아바타 답변"
                            className={styles.qaAvatarVideo}
                            onPlay={(e) => {
                              pausePlayer();
                              const prev = activeAvatarRef.current;
                              if (prev && prev !== e.currentTarget) {
                                prev.pause();
                              }
                              e.currentTarget.volume = volumeRef.current;
                              activeAvatarRef.current = e.currentTarget;
                            }}
                            onPause={(e) => {
                              if (activeAvatarRef.current === e.currentTarget) {
                                activeAvatarRef.current = null;
                              }
                            }}
                            onEnded={(e) => {
                              if (activeAvatarRef.current === e.currentTarget) {
                                activeAvatarRef.current = null;
                              }
                            }}
                          />
                        ) : (
                          // 강의 화면 재생 모드(기본): 좌측 큰 화면에 띄운다. 채팅엔
                          // 다시 보기용 버튼만 둬 강의 화면을 가리지 않는다.
                          <button
                            type="button"
                            className={styles.qaStagePlayBtn}
                            onClick={() => setStageAvatar({ url: m.avatarUrl! })}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d="M7 4.5v15a1 1 0 0 0 1.55.83l11-7.5a1 1 0 0 0 0-1.66l-11-7.5A1 1 0 0 0 7 4.5z" />
                            </svg>
                            강의 화면에서 보기
                          </button>
                        ))}
                      {m.source && (
                        <span className={styles.source}>
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.4}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 22s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12z" />
                          </svg>
                          {m.source}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div key={i} className={`${styles.msg} ${styles.me}`}>
                    <span className={`${styles.msgAv} ${styles.msgAvMe}`}>나</span>
                    <div className={styles.bubble}>{m.text}</div>
                  </div>
                ),
              )}
              {qaSending && (
                <div className={styles.msg}>
                  {botAvatar}
                  <div className={styles.bubble}>•••</div>
                </div>
              )}
              <div ref={qaBottomRef} />
            </div>

            {/* 푸터 — 왼쪽: Q&A 영상 재생 위치 토글, 오른쪽: 추천 질문(있을 때). */}
            <div className={styles.qaFooter}>
              {/* Q&A 영상 재생 위치 — "강의 화면"(기본, 좌측 큰 화면) / "채팅창".
                  강의 화면을 가리는 게 불편한 학습자는 채팅창 재생을 고른다. */}
              <div
                className={styles.playModeToggle}
                role="group"
                aria-label="Q&A 영상 재생 위치"
              >
                <button
                  type="button"
                  className={`${styles.playModeBtn} ${qaPlayMode === "stage" ? styles.playModeOn : ""}`}
                  aria-pressed={qaPlayMode === "stage"}
                  onClick={() => setQaPlayMode("stage")}
                >
                  강의 화면
                </button>
                <button
                  type="button"
                  className={`${styles.playModeBtn} ${qaPlayMode === "chat" ? styles.playModeOn : ""}`}
                  aria-pressed={qaPlayMode === "chat"}
                  onClick={() => {
                    setQaPlayMode("chat");
                    // 채팅 재생으로 바꾸면 좌측 화면 아바타는 닫는다(중복 재생 방지).
                    if (stageAvatarRef.current) stageAvatarRef.current.pause();
                    setStageAvatar(null);
                  }}
                >
                  채팅창
                </button>
              </div>

              {/* 추천 질문 = 교수자가 사전 제작한 예상 질문(클립 보유분). 클릭 시
                  실시간 RAG 가 아니라 미리 만든 Q&A 영상을 재생한다. */}
              {seedSuggestions.length > 0 && (
              <div className={styles.suggest}>
                <button
                  type="button"
                  className={styles.suggestToggle}
                  aria-expanded={seedOpen}
                  onClick={() => setSeedOpen((v) => !v)}
                >
                  <span className={styles.suggestLabel}>
                    {t("student.playerV2.qaSuggestLabel")}
                    <span className={styles.suggestCount}>
                      {seedSuggestions.length}
                    </span>
                  </span>
                  <svg
                    className={`${styles.suggestChevron} ${seedOpen ? styles.suggestChevronOpen : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {seedOpen && (
                  <div className={styles.suggestList}>
                    {seedSuggestions.map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        className={styles.chip}
                        onClick={() => playSeedQuestion(q)}
                      >
                        {q.question}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>

            <form
              className={styles.qaInput}
              onSubmit={(e) => {
                e.preventDefault();
                // 퀴즈는 좌측 영상 오버레이에서 응답한다 — 채팅 입력은 일반 Q&A 전용.
                sendQuestion();
              }}
            >
              <button
                type="button"
                className={`${styles.micBtn} ${micOn ? styles.on : ""}`}
                onClick={() => setMicOn((v) => !v)}
                aria-label={t("student.playerV2.qaMic")}
                aria-pressed={micOn}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="9" y="3" width="6" height="12" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0" />
                  <line x1="12" y1="18" x2="12" y2="22" />
                  <line x1="8" y1="22" x2="16" y2="22" />
                </svg>
              </button>
              <div className={styles.ipWrap}>
                <label htmlFor="qa-input" style={{ display: "none" }}>
                  {t("student.playerV2.qaPlaceholder")}
                </label>
                <input
                  id="qa-input"
                  type="text"
                  placeholder={t("student.playerV2.qaPlaceholder")}
                  value={qaInput}
                  maxLength={500}
                  onChange={(e) => setQaInput(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className={styles.sendBtn}
                disabled={qaSending || !qaInput.trim()}
                aria-label={t("student.playerV2.qaSend")}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
                </svg>
              </button>
            </form>
          </aside>
        </div>
      </div>

      {/* 인터스티셜 퀴즈는 우측 Q&A 채팅에 출제·응답한다(모달 폐지). */}

      {/* Attention warning — useAttention 의 warningLevel 이 1/2/3 일 때만 표시 */}
      {attention.isPaused && attention.warningLevel >= 1 && attention.warningLevel <= 3 && (
        <AttentionWarningV2
          level={attention.warningLevel as 1 | 2 | 3}
          onResume={attention.resume}
          onTakeQuiz={() => {
            attention.resume();
            triggerNextQuiz();
          }}
          onRestart={() => {
            player.restart();
            attention.resume();
          }}
        />
      )}

      {/* 첫 진입 4슬라이드 온보딩 (라이트→다크 전환). sessionStorage 가드 +
          서버 onboarded_at 영구 스킵. 우측 하단 "다시 보지 않기" 로 영구 스킵. */}
      {showOnboarding && (
        <OnboardingFlowV2
          onComplete={() => setShowOnboarding(false)}
          onSkip={() => setShowOnboarding(false)}
          onDismissForever={handleDismissOnboardingForever}
        />
      )}

      {/* 배포하기 모달(미리보기 전용) — 강의 발행 후 학생 링크·QR 표시. 라이트 카드. */}
      {deployOpen && (
        <div
          className={styles.deployScrim}
          role="dialog"
          aria-modal="true"
          aria-label={t("student.playerV2.deploy.title")}
          onClick={() => setDeployOpen(false)}
        >
          <div
            className={styles.deployCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.deployHead}>
              <h3>{t("student.playerV2.deploy.title")}</h3>
              <button
                type="button"
                className={styles.deployClose}
                onClick={() => setDeployOpen(false)}
                aria-label={t("student.playerV2.deploy.close")}
              >
                ✕
              </button>
            </div>

            {deployStatus === "publishing" && (
              <p className={styles.deployHint}>
                {t("student.playerV2.deploy.publishing")}
              </p>
            )}
            {deployStatus === "error" && (
              <p className={styles.deployError}>
                {t("student.playerV2.deploy.error")}
              </p>
            )}
            {deployStatus === "published" && (
              <>
                <p className={styles.deployPublished}>
                  {t("student.playerV2.deploy.published")}
                </p>
                <p className={styles.deployDesc}>
                  {t("student.playerV2.deploy.desc")}
                </p>
                <ShareLinks
                  url={
                    // 학생이 링크를 열면 진입 게이트 없이 바로 강의 영상이 나오도록
                    // 플레이어로 직행한다(발행 강의는 익명 시청 허용 — 교수자 결정 2026-06-12).
                    typeof window !== "undefined"
                      ? `${window.location.origin}/lecture/${lecture.slug}`
                      : `/lecture/${lecture.slug}`
                  }
                  classCode={null}
                  lectureTitle={lecture.title}
                />
              </>
            )}
          </div>
        </div>
      )}
    </PlayerSurfaceDark>
  );
}

function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * 노래방식 자막 — 외국어 번역 자막을 문장 단위로 순차 노출한다.
 *
 * 한국어 음성에 맞춰 현재 슬라이드의 자막을 한 문장씩 보여준다. 구간(슬라이드)
 * 내 경과 시간 비례로 현재 문장을 고른다(문장별 균등 분배 — 강제정렬 없이도
 * "노래방처럼" 진행되는 근사). 과거 문장은 흐리게, 현재 문장은 강조한다.
 */
/**
 * 음성에 맞춰 자막을 문장 단위로 순차 노출한다(노래방식).
 *
 * 타이밍은 **실측 음성 기준** `elapsed`/`duration`(슬라이드 내 경과·길이)로 계산한다.
 * 종전엔 추정 타임라인(start/end_seconds, 5자/초)과 실측 currentTime 을 섞어 비교해
 * 음성과 자막이 어긋났다. 선택 로직은 captionTiming.pickActiveCaption 에 있다.
 */
function KaraokeCaption({
  className,
  text,
  sourceText,
  cues,
  elapsed,
  duration,
  fontSize = "normal",
  highContrast = false,
  userScale = 1,
  userColor,
  userFont,
  leadSeconds,
  position,
  draggable = false,
  onDragMove,
  onDragEnd,
}: {
  className?: string;
  text: string;
  sourceText?: string;
  /** 발성 시각 cue(있으면 정밀 싱크, 없으면 글자수 폴백). */
  cues?: SubtitleCue[] | null;
  elapsed: number;
  duration: number;
  /** 접근성 글씨 크기 — 자막 텍스트를 확대한다. */
  fontSize?: FontSize;
  /** 접근성 고대비 — 자막 배경을 불투명 검정 + 굵게로 강화한다. */
  highContrast?: boolean;
  /** 미리보기 설정의 사용자 크기 배율(접근성 배율과 곱해진다). */
  userScale?: number;
  /** 미리보기 설정의 사용자 글자색(고대비 모드면 무시). */
  userColor?: string;
  /** 미리보기 설정의 사용자 폰트(고딕/명조/프리텐다드). */
  userFont?: "sans" | "serif" | "pretendard";
  /** 미리보기 '자막 빠르기' 리드(초). 양수=빨라짐. */
  leadSeconds?: number;
  /** 자막 위치(영상 영역 기준 정규화 좌표, 박스 중심). null = 기본(하단 중앙). */
  position?: SubtitlePosition | null;
  /** true 면(미리보기) 자막을 끌어서 위치를 옮길 수 있다. */
  draggable?: boolean;
  /** 드래그 중 위치 변경(로컬 즉시 반영). */
  onDragMove?: (pos: SubtitlePosition) => void;
  /** 드래그 종료 시 최종 위치(저장 트리거). */
  onDragEnd?: (pos: SubtitlePosition) => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  // 포인터 좌표 → 영상 영역 기준 정규화(0~1) 자막 중심. 화면 밖으로 나가지 않게 클램프.
  const posFromEvent = useCallback(
    (clientX: number, clientY: number): SubtitlePosition | null => {
      const parent = boxRef.current?.offsetParent as HTMLElement | null;
      const rect = (parent ?? boxRef.current?.parentElement)?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return null;
      const clamp = (v: number) => Math.min(0.92, Math.max(0.08, v));
      return {
        x: clamp((clientX - rect.left) / rect.width),
        y: clamp((clientY - rect.top) / rect.height),
      };
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggable) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
      const p = posFromEvent(e.clientX, e.clientY);
      if (p) onDragMove?.(p);
    },
    [draggable, onDragMove, posFromEvent],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const p = posFromEvent(e.clientX, e.clientY);
      if (p) onDragMove?.(p);
    },
    [dragging, onDragMove, posFromEvent],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      setDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* no-op */
      }
      const p = posFromEvent(e.clientX, e.clientY);
      if (p) onDragEnd?.(p);
    },
    [dragging, onDragEnd, posFromEvent],
  );
  // 자막은 다크 surface 위 CSS 모듈 고정 크기라 body 클래스(globals)에 안 닿는다.
  // 접근성 토글·미리보기 설정이 자막에 직접 반영되도록 인라인 style 로 덮어쓴다.
  const a11yScale = fontSize === "x-large" ? 1.5 : fontSize === "large" ? 1.25 : 1;
  const scale = a11yScale * (userScale || 1);
  const style: React.CSSProperties = {
    fontSize: scale === 1 ? undefined : `calc(1em * ${scale})`,
    ...(userFont
      ? {
          fontFamily:
            userFont === "serif"
              ? "var(--font-han, Georgia, serif)"
              : userFont === "pretendard"
                ? "'Pretendard Variable', 'Pretendard', sans-serif"
                : // 고딕 — 시스템 한글 고딕(프리텐다드와 구분되도록 명시).
                  "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
        }
      : null),
    ...(highContrast
      ? {
          background: "#000",
          color: "#fff",
          fontWeight: 800,
          padding: "0.4em 0.7em",
          borderRadius: 8,
          outline: "2px solid #fff",
        }
      : userColor
        ? { color: userColor }
        : null),
    // 저장된 위치가 있으면 기본(하단 중앙) 대신 정규화 좌표로 배치(박스 중심 기준).
    ...(position
      ? {
          left: `${position.x * 100}%`,
          top: `${position.y * 100}%`,
          bottom: "auto",
          right: "auto",
          transform: "translate(-50%, -50%)",
        }
      : null),
    // 미리보기: 자막을 끌 수 있게 포인터 이벤트를 켜고 드래그 표시를 준다.
    ...(draggable
      ? {
          pointerEvents: "auto" as const,
          cursor: dragging ? "grabbing" : "grab",
          touchAction: "none" as const,
          userSelect: "none" as const,
          outline: "1px dashed rgba(255,182,39,0.7)",
          outlineOffset: 2,
        }
      : null),
  };
  return (
    <div
      ref={boxRef}
      className={className}
      style={style}
      aria-live="off"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      title={draggable ? "끌어서 자막 위치 이동" : undefined}
    >
      {pickActiveCaptionWithCues(text, sourceText, cues, elapsed, duration, leadSeconds)}
    </div>
  );
}
