"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, API_URL } from "@/lib/api";
import { useSlideshowPlayback } from "./useSlideshowPlayback";
import { tokens as tokenStorage } from "@/lib/tokens";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAttention } from "@/hooks/useAttention";
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
}

interface ReactionCount {
  like: number;
  curious: number;
  fun: number;
  aha: number;
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
}

export default function PlayerV2({ slug }: PlayerV2Props) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();

  const [lecture, setLecture] = useState<LectureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // 본문은 단일 영상이 아니라 슬라이드쇼(이미지 + 구간 음성 + 타임라인)로 재생한다.
  // 진행 콜백은 ref 로 최신화해 훅(안정 콜백)과 퀴즈/집중도 로직의 순환 의존을 끊는다.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [captionsOn, setCaptionsOn] = useState(true);
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
  const qaBottomRef = useRef<HTMLDivElement>(null);
  const [reactions, setReactions] = useState<ReactionCount>({
    like: 12,
    curious: 4,
    fun: 7,
    aha: 3,
  });

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
  }, [lecture, user, durationSec]);

  // ─── 인터스티셜 퀴즈 목록 fetch (타임스탬프 트리거용, 정답·해설 미포함) ───
  useEffect(() => {
    if (!lecture?.id) return;
    let cancelled = false;
    (async () => {
      const quizzes = await getPlaybackQuizzes(lecture.id);
      if (!cancelled) setPlaybackQuizzes(quizzes);
    })();
    return () => {
      cancelled = true;
    };
  }, [lecture?.id]);

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
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  };

  // ─── 익명 반응 ───
  const bumpReaction = (key: keyof ReactionCount) => {
    setReactions((r) => ({ ...r, [key]: r[key] + 1 }));
  };

  // ─── Q&A 전송 ───
  const sendQuestion = async (text?: string) => {
    const question = (text ?? qaInput).trim();
    if (!question || !sessionId) return;
    setQaInput("");
    setQaMessages((m) => [...m, { role: "user", text: question }]);
    setQaSending(true);
    try {
      const { data } = await api.post(`/api/v1/qa`, {
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
      <div className={styles.player}>
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

              {/* 자막 — 슬라이드별 텍스트(자막 언어가 다르면 번역본). 토글 가능. */}
              {captionsOn && currentSlide?.image_url &&
                (currentSlide.subtitle_text || currentSlide.text) && (
                  <div className={styles.caption} aria-live="off">
                    {currentSlide.subtitle_text || currentSlide.text}
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
                <div className={styles.reacts} role="group" aria-label="익명 반응">
                  <ReactBtn
                    label={t("student.playerV2.reactionLike")}
                    count={reactions.like}
                    onClick={() => bumpReaction("like")}
                    icon={
                      <svg viewBox="0 0 24 24" fill="url(#ca-grad-electric)" stroke="none">
                        <path d="M7 22V11l5-8a2 2 0 0 1 3 2l-1 6h4a3 3 0 0 1 3 3l-2 7a3 3 0 0 1-3 2h-9z" />
                      </svg>
                    }
                  />
                  <ReactBtn
                    label={t("student.playerV2.reactionCurious")}
                    count={reactions.curious}
                    onClick={() => bumpReaction("curious")}
                    icon={
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="url(#ca-grad-violet)"
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M9.5 9a2.5 2.5 0 1 1 4.5 1.6c-1 .8-1.5 1.2-1.5 2.4" />
                        <circle cx="12" cy="17" r="0.6" fill="currentColor" />
                      </svg>
                    }
                  />
                  <ReactBtn
                    label={t("student.playerV2.reactionFun")}
                    count={reactions.fun}
                    onClick={() => bumpReaction("fun")}
                    icon={
                      <svg viewBox="0 0 24 24" fill="url(#ca-grad-success)" stroke="none">
                        <circle cx="12" cy="12" r="10" />
                        <path
                          d="M8 14q4 4 8 0"
                          stroke="#0A0A0A"
                          strokeWidth={1.8}
                          fill="none"
                          strokeLinecap="round"
                        />
                        <circle cx="9" cy="10" r="1.2" fill="#0A0A0A" />
                        <circle cx="15" cy="10" r="1.2" fill="#0A0A0A" />
                      </svg>
                    }
                  />
                  <ReactBtn
                    label={t("student.playerV2.reactionAha")}
                    count={reactions.aha}
                    onClick={() => bumpReaction("aha")}
                    icon={
                      <svg viewBox="0 0 24 24" fill="none">
                        <path
                          d="M12 3l1.5 4 4 .4-3 2.8.9 4-3.4-2-3.4 2 .9-4-3-2.8 4-.4z"
                          fill="url(#ca-grad-electric)"
                        />
                        <path
                          d="M12 14v6"
                          stroke="url(#ca-grad-electric)"
                          strokeWidth={2.2}
                          strokeLinecap="round"
                        />
                      </svg>
                    }
                  />
                </div>
                <div className={styles.controlsRight}>
                  <button
                    type="button"
                    className={styles.assessTrigger}
                    onClick={() =>
                      router.push(
                        `/lecture/${slug}/assess${sessionId ? `?session_id=${sessionId}` : ""}`,
                      )
                    }
                  >
                    {t("student.playerV2.startAssess")}
                  </button>
                  <button
                    type="button"
                    className={styles.ctrl}
                    onClick={() => setCaptionsOn((v) => !v)}
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
              <span className={styles.askPill}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {t("student.playerV2.qaAskPill")}
              </span>
            </div>
            <div className={styles.qaQuota}>
              <span className={styles.qaQuotaPill}>
                {t("student.playerV2.qaQuotaEpisode", {
                  used: String(Math.max(qaMessages.filter((m) => m.role === "user").length, 0)),
                  limit: "100",
                })}
              </span>
              <span>{t("student.playerV2.qaQuotaDaily", { used: "12", limit: "30" })}</span>
            </div>

            <div className={styles.qaBody} aria-live="polite">
              {qaMessages.map((m, i) =>
                m.role === "assistant" ? (
                  <div key={i} className={styles.msg}>
                    <span className={`${styles.msgAv} ${styles.msgAvBot}`}>AI</span>
                    <div>
                      <div className={styles.bubble}>{m.text}</div>
                      {m.avatarUrl && (
                        // 투명성(09 §5.2) — 캐시 클립은 비슷한 과거 질문에 렌더된 것.
                        // "권위 있는 답"은 위 텍스트(이 학생 질문에 맞춘 RAG)이고 아바타는
                        // 전달 보조임을 명시한다.
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

            <div className={styles.suggest}>
              <span className={styles.suggestLabel}>
                {t("student.playerV2.qaSuggestLabel")}
              </span>
              <button
                type="button"
                className={styles.chip}
                onClick={() => sendQuestion("把자문은 언제 사용하나요?")}
              >
                把자문은 언제 사용하나요?
              </button>
              <button
                type="button"
                className={styles.chip}
                onClick={() => sendQuestion("일반 어순과 어떻게 다른가요?")}
              >
                일반 어순과 어떻게 다른가요?
              </button>
            </div>

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

function ReactBtn({
  label,
  count,
  icon,
  onClick,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.react}
      aria-label={label}
      onClick={onClick}
    >
      {icon}
      <span className={styles.reactCount}>{count}</span>
    </button>
  );
}

function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
