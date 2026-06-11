"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, API_URL } from "@/lib/api";
import { useSlideshowPlayback } from "./useSlideshowPlayback";
import { pickActiveCaption } from "./captionTiming";
import { tokens as tokenStorage } from "@/lib/tokens";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAttention } from "@/hooks/useAttention";
import { useA11y, type FontSize } from "@/components/student/accessibility/A11yContext";
import { parseCourseTitle } from "@/components/student/v2/CourseTitle";
import OnboardingFlowV2 from "@/components/student/v2/OnboardingFlowV2";
import PlayerSurfaceDark from "./PlayerSurfaceDark";
import AttentionWarningV2 from "./AttentionWarningV2";
import InterstitialQuiz, {
  type QuizAnswerOutcome,
  type QuizQuestion,
} from "./InterstitialQuiz";
import {
  getPlaybackQuizzes,
  submitInterstitialAnswer,
  type PlaybackQuiz,
} from "./quizPlaybackApi";
import styles from "./Player.module.css";

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

/** PlaybackQuiz → InterstitialQuiz 가 쓰는 QuizQuestion 으로 변환 (보기에 A/B/C/D 부여). */
function toQuizQuestion(pb: PlaybackQuiz): QuizQuestion {
  return {
    id: pb.id,
    prompt: pb.content,
    questionType: pb.question_type,
    options: (pb.options ?? []).map((text, i) => ({
      letter: String.fromCharCode(65 + i),
      text,
    })),
  };
}

const letterToIndex = (letter: string): string => String(letter.charCodeAt(0) - 65);
const indexToLetter = (idx: string): string =>
  String.fromCharCode(65 + Math.max(0, parseInt(idx, 10) || 0));

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

  const [lecture, setLecture] = useState<LectureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // 본문은 단일 영상이 아니라 슬라이드쇼(이미지 + 구간 음성 + 타임라인)로 재생한다.
  // 진행 콜백은 ref 로 최신화해 훅(안정 콜백)과 퀴즈/집중도 로직의 순환 의존을 끊는다.
  const stageRef = useRef<HTMLDivElement | null>(null);
  // 전체화면은 영상 영역만이 아니라 플레이어 전체(영상+Q&A 패널)를 대상으로 한다.
  // stageRef(.video)만 전체화면하면 우측 채팅이 사라지고 슬라이드가 레터박스된다.
  const playerRef = useRef<HTMLDivElement | null>(null);
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
  const qaBottomRef = useRef<HTMLDivElement>(null);

  // 인터스티셜 퀴즈 — 백엔드에서 받은 타임스탬프 퀴즈를 재생 중 자동 출제.
  const [playbackQuizzes, setPlaybackQuizzes] = useState<PlaybackQuiz[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<PlaybackQuiz | null>(null);
  const quizzesRef = useRef<PlaybackQuiz[]>([]);
  const shownQuizRef = useRef<Set<string>>(new Set());
  const quizOpenRef = useRef(false);
  // timeupdate 클로저가 최신 값을 읽도록 ref 동기화.
  useEffect(() => {
    quizzesRef.current = playbackQuizzes;
  }, [playbackQuizzes]);
  useEffect(() => {
    quizOpenRef.current = activeQuiz !== null;
  }, [activeQuiz]);

  // 첫 진입 온보딩 (sessionStorage 기준)
  const [showOnboarding, setShowOnboarding] = useState(true);

  // ─── 강의 fetch ───
  useEffect(() => {
    if (!slug) {
      router.replace("/dashboard");
      return;
    }
    (async () => {
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

  // ─── 인터스티셜 퀴즈 목록 fetch (타임스탬프 트리거용, 정답·해설 미포함) ───
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

  // ─── 인터스티셜 퀴즈: 트리거 / 일시정지·재개 / 응답 제출 ───
  const resumeAfterQuiz = () => playPlayer();

  /** 아직 출제되지 않은 다음 퀴즈를 연다. 열었으면 true. */
  const openQuiz = useCallback(
    (quiz: PlaybackQuiz) => {
      shownQuizRef.current.add(quiz.id);
      quizOpenRef.current = true;
      pausePlayer();
      setActiveQuiz(quiz);
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

  // 슬라이드쇼 진행 콜백 — 집중도 진행 + 타임스탬프 퀴즈 자동 출제. ref 로 최신
  // 클로저를 담아 훅의 안정 콜백(handleProgress)이 항상 최신 로직을 부른다.
  useEffect(() => {
    handleProgressRef.current = (sec: number) => {
      attention.setProgress(sec);
      if (!quizOpenRef.current) {
        const due = quizzesRef.current.find(
          (q) =>
            q.timestamp_seconds != null &&
            sec >= q.timestamp_seconds &&
            !shownQuizRef.current.has(q.id),
        );
        if (due) openQuiz(due);
      }
    };
  }, [attention, openQuiz]);

  const handleQuizClose = () => {
    setActiveQuiz(null);
    quizOpenRef.current = false;
    resumeAfterQuiz();
  };

  const handleQuizSubmit = async (answer: string): Promise<QuizAnswerOutcome | null> => {
    const quiz = activeQuiz;
    if (!quiz || !sessionId) return null;
    const isMultiple = quiz.question_type === "multiple_choice";
    const userAnswer = isMultiple ? letterToIndex(answer) : answer;
    try {
      const res = await submitInterstitialAnswer(lecture!.id, {
        sessionId,
        questionId: quiz.id,
        userAnswer,
        videoTimestampSeconds: progressSec,
      });
      return {
        recorded: res.recorded,
        reveal: res.reveal,
        correct: res.is_correct,
        correctLetter:
          res.reveal && isMultiple && res.correct_answer != null
            ? indexToLetter(res.correct_answer)
            : null,
        explanation: res.reveal ? res.explanation : null,
        modelAnswer: res.reveal && !isMultiple ? res.correct_answer : null,
      };
    } catch {
      return null;
    }
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
      el.requestFullscreen?.().catch(() => {});
    }
  };

  // ─── Q&A 전송 ───
  const sendQuestion = async (text?: string) => {
    const question = (text ?? qaInput).trim();
    // 일반 시청은 세션이 필요하고, 미리보기(교수자)는 세션 없이 RAG 답변만 받는다.
    if (!question || (!sessionId && !preview)) return;
    setQaInput("");
    setQaMessages((m) => [...m, { role: "user", text: question }]);
    setQaSending(true);
    try {
      // 미리보기(교수자)는 세션이 없으므로 소유 교수자 전용 /qa/preview 로,
      // 일반 학생 시청은 세션 기반 /qa 로 호출한다.
      const { data } = preview
        ? await api.post(`/api/v1/qa/preview`, {
            lecture_id: lecture?.id,
            question,
          })
        : await api.post(`/api/v1/qa`, {
            session_id: sessionId,
            lecture_id: lecture?.id,
            question,
          });
      setQaMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: data.answer ?? t("student.playerV2.qaGenericFallback"),
          source: data.source ?? t("student.playerV2.qaSourceFallback"),
          // 겹치는 질문이라 사전 렌더된 아바타 클립이 있으면 함께 재생(부가).
          avatarUrl: data.avatar?.video_url ?? null,
          // 투명성(09 §5.2) — 캐시 클립이 맞춰진 원 질문.
          matchedQuestion: data.avatar?.matched_question ?? null,
        },
      ]);
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
        <div className={styles.body}>
          <div className={styles.stage}>
            <div className={styles.video} ref={stageRef}>
              {/* 본문 = 슬라이드쇼: 현재 슬라이드 이미지 + 숨겨진 구간 음성 + 자막. */}
              <audio ref={audioRef} preload="auto" aria-hidden="true" />
              {/* 본문 렌더가 끝났고(bodyReady) 슬라이드 이미지가 있을 때만 재생면을
                  보여준다. 공개됐지만 아직 렌더 중(bodyReady=false)이면 무음으로
                  슬라이드만 넘기는 대신 "준비 중" 안내를 띄운다. */}
              {bodyReady && currentSlide?.image_url ? (
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
              {captionsOn && currentSlide?.image_url &&
                (currentSlide.subtitle_text || currentSlide.text) && (
                  <KaraokeCaption
                    className={styles.caption}
                    text={currentSlide.subtitle_text || currentSlide.text}
                    sourceText={
                      currentSlide.subtitle_text ? currentSlide.text : undefined
                    }
                    elapsed={player.currentSlideElapsed}
                    duration={player.currentSlideDuration}
                    fontSize={a11y.fontSize}
                    highContrast={a11y.highContrast}
                  />
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

          {/* Q&A panel */}
          <aside className={styles.qa} aria-label={t("student.playerV2.qaTitle")}>
            <div className={styles.qaHead}>
              <h3>{t("student.playerV2.qaTitle")}</h3>
            </div>

            <div className={styles.qaBody} aria-live="polite">
              {qaMessages.map((m, i) =>
                m.role === "assistant" ? (
                  <div key={i} className={styles.msg}>
                    <span className={`${styles.msgAv} ${styles.msgAvBot}`}>AI</span>
                    <div>
                      {m.text && <div className={styles.bubble}>{m.text}</div>}
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
                      {m.avatarUrl && (
                        // 캐시 적중 시 부가되는 아바타 답변 클립. 텍스트가 본답이고
                        // 영상은 전달 보조 — 로드 실패해도 텍스트 답변은 그대로 남는다.
                        <video
                          src={m.avatarUrl}
                          autoPlay
                          playsInline
                          controls
                          aria-label="AI 아바타 답변"
                          style={{
                            marginTop: 8,
                            width: "100%",
                            maxWidth: 220,
                            borderRadius: 10,
                            display: "block",
                          }}
                        />
                      )}
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
                  <span className={`${styles.msgAv} ${styles.msgAvBot}`}>AI</span>
                  <div className={styles.bubble}>•••</div>
                </div>
              )}
              <div ref={qaBottomRef} />
            </div>

            {/* 추천 질문 = 교수자가 사전 제작한 예상 질문(클립 보유분). 클릭 시
                실시간 RAG 가 아니라 미리 만든 Q&A 영상을 재생한다. */}
            {seedSuggestions.length > 0 && (
              <div className={styles.suggest}>
                <span className={styles.suggestLabel}>
                  {t("student.playerV2.qaSuggestLabel")}
                </span>
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

            <form
              className={styles.qaInput}
              onSubmit={(e) => {
                e.preventDefault();
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

      {/* Interstitial quiz — 타임스탬프 자동 출제. 정답 공개는 서버(reveal_answer)가 결정. */}
      <InterstitialQuiz
        open={activeQuiz !== null}
        question={activeQuiz ? toQuizQuestion(activeQuiz) : null}
        onClose={handleQuizClose}
        onSubmit={handleQuizSubmit}
        preview={preview}
      />

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

      {/* 첫 진입 4슬라이드 온보딩 (라이트→다크 전환). sessionStorage 가드. */}
      {showOnboarding && (
        <OnboardingFlowV2
          onComplete={() => setShowOnboarding(false)}
          onSkip={() => setShowOnboarding(false)}
        />
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
  elapsed,
  duration,
  fontSize = "normal",
  highContrast = false,
}: {
  className?: string;
  text: string;
  sourceText?: string;
  elapsed: number;
  duration: number;
  /** 접근성 글씨 크기 — 자막 텍스트를 확대한다. */
  fontSize?: FontSize;
  /** 접근성 고대비 — 자막 배경을 불투명 검정 + 굵게로 강화한다. */
  highContrast?: boolean;
}) {
  // 자막은 다크 surface 위 CSS 모듈 고정 크기라 body 클래스(globals)에 안 닿는다.
  // 접근성 토글이 자막에 직접 반영되도록 인라인 style 로 덮어쓴다.
  const scale = fontSize === "x-large" ? 1.5 : fontSize === "large" ? 1.25 : 1;
  const style: React.CSSProperties = {
    fontSize: scale === 1 ? undefined : `calc(1em * ${scale})`,
    ...(highContrast
      ? {
          background: "#000",
          color: "#fff",
          fontWeight: 800,
          padding: "0.4em 0.7em",
          borderRadius: 8,
          outline: "2px solid #fff",
        }
      : null),
  };
  return (
    <div className={className} style={style} aria-live="off">
      {pickActiveCaption(text, sourceText, elapsed, duration)}
    </div>
  );
}
