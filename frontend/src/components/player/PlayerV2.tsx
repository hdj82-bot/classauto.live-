"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
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
import { askQuestion, fetchPlayTimeline } from "./playbackApi";
import type { PlaySegment, PlayTimeline } from "./playbackTypes";
import styles from "./Player.module.css";

/**
 * PlayerV2 — /lecture/[slug] 영상 시청 페이지의 다크 톤 UI.
 *
 * [확정 결정] 본문은 단일 mp4 가 아니라 "슬라이드 PNG + 구간 TTS 오디오 +
 * 타임라인" 을 클라이언트가 동기 재생하는 슬라이드쇼다. HeyGen 아바타는
 * Q&A 캐시 답변(부가)에만 쓰인다.
 *
 * 출처: docs/prototypes/06-student-flow.extracted.html SCREEN 4
 *      + docs/planning/06-student-pages.md §6-8.
 *
 * 기능:
 *  1. 상단바: 강의 제목(한자 강조) + 학생 정보 + 설정 아이콘
 *  2. 슬라이드 stage(60%): 현재 슬라이드 이미지 + 구간 오디오 동기 재생,
 *     재생/일시정지·이전/다음 슬라이드·진행바·자막·풀스크린
 *  3. Q&A 사이드 패널(40%): 답변 텍스트 즉시 표시 + 아바타 클립(있을 때) 부가
 *  4. 인터스티셜 퀴즈 오버레이 (타임라인 타임스탬프 자동 출제)
 *  5. 집중 경고 3단계 오버레이 (useAttention 훅 통합)
 *  6. 첫 진입 온보딩 4슬라이드 (sessionStorage 1탭 1회)
 *
 * 데이터 레이어(./playbackApi)는 실서버 ↔ 로컬 mock 을 투명하게 분리한다 —
 * 본 컴포넌트는 항상 fetchPlayTimeline / askQuestion 만 호출한다.
 */

interface QAMessage {
  role: "user" | "assistant";
  text: string;
  /** 환영 메시지 등 문자열 출처(폴백). */
  source?: string | null;
  /** RAG 인용 슬라이드 번호들. */
  sourceSlides?: number[];
  /** in_scope=false 이면 범위 밖 배지 표시. */
  inScope?: boolean;
  /** HeyGen 아바타 클립 URL (있을 때만). */
  avatarUrl?: string | null;
}

interface ReactionCount {
  like: number;
  curious: number;
  fun: number;
  aha: number;
}

/** 세션 생성 실패/미로그인 시 Q&A·퀴즈가 단독 구동되도록 하는 로컬 세션 id. */
const LOCAL_SESSION_ID = "local-session";
/** 타임라인 클록 틱 (ms). */
const TICK_MS = 100;

/** PlaybackQuiz → InterstitialQuiz 가 쓰는 QuizQuestion 으로 변환. */
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

/** 출처 슬라이드 칩 텍스트: 연속이면 "1–3", 아니면 "1, 3". */
function formatSlides(slides: number[]): string {
  if (!slides.length) return "";
  const sorted = [...slides].sort((a, b) => a - b);
  const contiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  return contiguous && sorted.length > 1
    ? `${sorted[0]}–${sorted[sorted.length - 1]}`
    : sorted.join(", ");
}

export interface PlayerV2Props {
  slug: string;
}

export default function PlayerV2({ slug }: PlayerV2Props) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useI18n();

  const [timeline, setTimeline] = useState<PlayTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // ─── 슬라이드쇼 재생 상태 ───
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [segmentTime, setSegmentTime] = useState(0); // 현재 구간 경과(초)
  const [showCaptions, setShowCaptions] = useState(true);

  // Q&A
  const [qaMessages, setQaMessages] = useState<QAMessage[]>([
    { role: "assistant", text: "" }, // placeholder welcome (t() 로드 후 교체)
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

  // 인터스티셜 퀴즈 — 타임스탬프 도달 시 자동 출제.
  const [playbackQuizzes, setPlaybackQuizzes] = useState<PlaybackQuiz[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<PlaybackQuiz | null>(null);
  const quizzesRef = useRef<PlaybackQuiz[]>([]);
  const shownQuizRef = useRef<Set<string>>(new Set());
  const quizOpenRef = useRef(false);
  useEffect(() => {
    quizzesRef.current = playbackQuizzes;
  }, [playbackQuizzes]);
  useEffect(() => {
    quizOpenRef.current = activeQuiz !== null;
  }, [activeQuiz]);

  // 첫 진입 온보딩 (sessionStorage 기준은 OnboardingFlowV2 내부)
  const [showOnboarding, setShowOnboarding] = useState(true);

  const segments = useMemo<PlaySegment[]>(() => timeline?.segments ?? [], [timeline]);

  // 세그먼트 시작 누적 오프셋 + 전체 길이.
  const { offsets, totalDuration } = useMemo(() => {
    const offs: number[] = [];
    let acc = 0;
    for (const s of segments) {
      offs.push(acc);
      acc += s.duration_seconds;
    }
    return { offsets: offs, totalDuration: acc };
  }, [segments]);

  const current = segments[currentIndex] ?? null;
  const overallElapsed =
    current != null
      ? (offsets[currentIndex] ?? 0) + Math.min(segmentTime, current.duration_seconds)
      : 0;

  const attention = useAttention({ sessionId: sessionId || "" });

  // 재생 가동 조건 — 오버레이(퀴즈·집중경고·온보딩)가 뜨면 정지.
  const running =
    isPlaying &&
    activeQuiz === null &&
    !attention.isPaused &&
    !showOnboarding &&
    segments.length > 0 &&
    currentIndex < segments.length;
  const runningRef = useRef(running);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  // ─── 타임라인 fetch (계약 A) ───
  useEffect(() => {
    if (!slug) {
      router.replace("/dashboard");
      return;
    }
    let cancelled = false;
    (async () => {
      const data = await fetchPlayTimeline(slug);
      if (cancelled) return;
      if (data.is_expired) {
        router.replace("/expired");
        return;
      }
      setTimeline(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, router]);

  // ─── 세션 생성 + attention 시작 ───
  useEffect(() => {
    if (!timeline || !user || !totalDuration) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.post("/api/v1/sessions", null, {
          params: { lecture_id: timeline.lecture_id, total_sec: Math.ceil(totalDuration) },
        });
        if (cancelled) return;
        setSessionId(data.id);
        await api.post("/api/v1/attention/start", {
          session_id: data.id,
          user_id: user.id,
          lecture_id: timeline.lecture_id,
        });
      } catch {
        // 백엔드 미연결(단독 구동) — 로컬 세션 id 로 Q&A·퀴즈 진행.
        if (!cancelled) setSessionId(LOCAL_SESSION_ID);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [timeline, user, totalDuration]);

  // ─── 인터스티셜 퀴즈 목록 fetch ───
  useEffect(() => {
    if (!timeline?.lecture_id) return;
    let cancelled = false;
    (async () => {
      const quizzes = await getPlaybackQuizzes(timeline.lecture_id);
      if (!cancelled) setPlaybackQuizzes(quizzes);
    })();
    return () => {
      cancelled = true;
    };
  }, [timeline?.lecture_id]);

  // 환영 메시지를 i18n 로드 후 1회 세팅 (placeholder → 실제 텍스트).
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
    if (!sessionId || sessionId === LOCAL_SESSION_ID) return;
    const pause = () => {
      const url = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const tok = tokenStorage.getAccess();
      fetch(`${url}/api/v1/sessions/${sessionId}?status=paused`, {
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

  // 클록/오디오 콜백이 최신 값을 읽도록 ref 동기화.
  const indexRef = useRef(0);
  const segTimeRef = useRef(0);
  const segmentsRef = useRef<PlaySegment[]>(segments);
  useEffect(() => {
    indexRef.current = currentIndex;
  }, [currentIndex]);
  useEffect(() => {
    segTimeRef.current = segmentTime;
  }, [segmentTime]);
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  // ─── 인터스티셜 퀴즈: 일시정지·재개·제출 ───
  // (progress 이펙트가 openQuiz 를 참조하므로 그 위에 선언한다)
  const openQuiz = (quiz: PlaybackQuiz) => {
    shownQuizRef.current.add(quiz.id);
    quizOpenRef.current = true;
    setIsPlaying(false); // running=false → 클록·오디오 정지
    setActiveQuiz(quiz);
  };
  const triggerNextQuiz = (): boolean => {
    if (quizOpenRef.current) return false;
    const next = quizzesRef.current.find((q) => !shownQuizRef.current.has(q.id));
    if (!next) return false;
    openQuiz(next);
    return true;
  };
  const handleQuizClose = () => {
    setActiveQuiz(null);
    quizOpenRef.current = false;
    setIsPlaying(true); // 재개
  };
  const handleQuizSubmit = async (answer: string): Promise<QuizAnswerOutcome | null> => {
    const quiz = activeQuiz;
    if (!quiz || !timeline) return null;
    const sid = sessionId ?? LOCAL_SESSION_ID;
    const isMultiple = quiz.question_type === "multiple_choice";
    const userAnswer = isMultiple ? letterToIndex(answer) : answer;
    try {
      const res = await submitInterstitialAnswer(timeline.lecture_id, {
        sessionId: sid,
        questionId: quiz.id,
        userAnswer,
        videoTimestampSeconds: Math.floor(overallElapsed),
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

  // ─── 타임라인 클록: running 동안 segmentTime 누적 + 구간 자동 진행 ───
  // 진행/종료 setState 는 타이머 콜백(이펙트 본문이 아님)에서 호출한다.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const idx = indexRef.current;
      const segs = segmentsRef.current;
      const seg = segs[idx];
      if (!seg) return;
      const next = segTimeRef.current + TICK_MS / 1000;
      if (next < seg.duration_seconds) {
        setSegmentTime(next);
      } else if (idx < segs.length - 1) {
        setCurrentIndex(idx + 1);
        setSegmentTime(0);
      } else {
        setIsPlaying(false);
        setSegmentTime(seg.duration_seconds);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  // ─── 구간별 오디오 로드/동기 ───
  useEffect(() => {
    const a = audioRef.current;
    const seg = segments[currentIndex];
    if (!a || !seg) return;
    if (seg.audio_url) {
      if (a.src !== seg.audio_url) a.src = seg.audio_url;
      a.currentTime = 0;
      if (runningRef.current) a.play().catch(() => {});
    } else {
      a.removeAttribute("src");
      a.load?.();
    }
  }, [currentIndex, segments]);

  // ─── 재생/일시정지에 오디오 동기 ───
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (running) {
      if (a.getAttribute("src")) a.play().catch(() => {});
    } else {
      a.pause();
    }
  }, [running]);

  // ─── 진행 부수효과: 집중도 progress + 퀴즈 자동 출제 ───
  const lastSecRef = useRef(-1);
  useEffect(() => {
    const sec = Math.floor(overallElapsed);
    if (sec === lastSecRef.current) return;
    lastSecRef.current = sec;
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
    // attention.setProgress·openQuiz 는 안정 참조 — 의도적으로 deps 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overallElapsed]);

  // ─── 슬라이드쇼 컨트롤 ───
  const togglePlay = () => {
    // 마지막 슬라이드 끝에서 다시 누르면 처음부터.
    if (
      !isPlaying &&
      currentIndex === segments.length - 1 &&
      current &&
      segmentTime >= current.duration_seconds
    ) {
      setCurrentIndex(0);
      setSegmentTime(0);
    }
    setIsPlaying((p) => !p);
  };
  const goToSegment = (index: number) => {
    const clamped = Math.max(0, Math.min(segments.length - 1, index));
    setCurrentIndex(clamped);
    setSegmentTime(0);
  };
  const goPrev = () => goToSegment(currentIndex - 1);
  const goNext = () => goToSegment(currentIndex + 1);

  const seekToOverall = (target: number) => {
    let acc = 0;
    for (let i = 0; i < segments.length; i++) {
      const d = segments[i].duration_seconds;
      if (target < acc + d || i === segments.length - 1) {
        setCurrentIndex(i);
        setSegmentTime(Math.max(0, Math.min(d, target - acc)));
        return;
      }
      acc += d;
    }
  };

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

  // ─── Q&A 전송 (계약 B) ───
  const sendQuestion = async (text?: string) => {
    const question = (text ?? qaInput).trim();
    if (!question) return;
    const sid = sessionId ?? LOCAL_SESSION_ID;
    setQaInput("");
    setQaMessages((m) => [...m, { role: "user", text: question }]);
    setQaSending(true);
    setIsPlaying(false); // Q&A 등장 시 일시정지 (06 §7.1)
    try {
      const res = await askQuestion(timeline?.lecture_id ?? slug, {
        question,
        session_id: sid,
      });
      setQaMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: res.answer || t("student.playerV2.qaGenericFallback"),
          sourceSlides: res.source_slides ?? [],
          inScope: res.in_scope,
          avatarUrl: res.avatar?.video_url ?? null,
        },
      ]);
    } catch {
      setQaMessages((m) => [
        ...m,
        { role: "assistant", text: t("student.playerV2.qaErrorAnswer"), source: null },
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
  if (!timeline) return null;

  const titleSegments = parseCourseTitle(timeline.title);
  const userInitial = (user?.name ?? user?.email ?? "?").trim().charAt(0).toUpperCase();
  const userSchoolDept = (() => {
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
              {t("student.entry.lessonNumberFallback")}
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
          <div className={styles.stage} ref={stageRef}>
            <div className={styles.video}>
              {/* 슬라이드 이미지 (없으면 fallback placeholder) */}
              {current?.image_url ? (
                // 슬라이드 이미지는 임의 원격 URL/ data URI 이고 매 구간 교체되어
                // next/image 최적화 이점이 없다 → plain img 사용.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={currentIndex}
                  className={styles.slideImg}
                  src={current.image_url}
                  alt={current.caption ?? timeline.title}
                />
              ) : (
                <div className={styles.placeholder}>
                  <div className={styles.playOrb}>
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M7 4.5v15a1 1 0 0 0 1.55.83l11-7.5a1 1 0 0 0 0-1.66l-11-7.5A1 1 0 0 0 7 4.5z" />
                    </svg>
                  </div>
                  <span className={styles.placeholderLabel}>
                    {t("student.playerV2.videoNotReady")}
                  </span>
                </div>
              )}

              {/* 구간 오디오 (화면 비표시) */}
              <audio ref={audioRef} preload="auto" aria-hidden="true" />

              {/* 슬라이드 카운터 */}
              <span className={styles.slideCounter} aria-hidden="true">
                {currentIndex + 1} / {segments.length}
              </span>

              {/* 자막 */}
              {showCaptions && current?.caption && (
                <div className={styles.caption}>{current.caption}</div>
              )}
            </div>

            {/* Bottom controls */}
            <div className={styles.controls}>
              <div
                className={styles.progress}
                role="progressbar"
                aria-valuenow={Math.floor(overallElapsed)}
                aria-valuemin={0}
                aria-valuemax={Math.ceil(totalDuration) || 100}
                onClick={(e) => {
                  if (!totalDuration) return;
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  seekToOverall((x / rect.width) * totalDuration);
                }}
              >
                <div
                  className={styles.progressFill}
                  style={{
                    width: `${totalDuration > 0 ? (overallElapsed / totalDuration) * 100 : 0}%`,
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
                    onClick={goPrev}
                    disabled={currentIndex <= 0}
                    aria-label={t("student.playerV2.controlPrevSlide")}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 6l-8 6 8 6" />
                      <line x1="6" y1="5" x2="6" y2="19" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={styles.ctrl}
                    onClick={goNext}
                    disabled={currentIndex >= segments.length - 1}
                    aria-label={t("student.playerV2.controlNextSlide")}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 6l8 6-8 6" />
                      <line x1="18" y1="5" x2="18" y2="19" />
                    </svg>
                  </button>
                  <span className={styles.timeLabel}>
                    {formatClock(overallElapsed)} / {formatClock(totalDuration)}
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
                    onClick={() => setShowCaptions((v) => !v)}
                    aria-pressed={showCaptions}
                    aria-label={t("student.playerV2.controlCaptions")}
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
                        <AvatarClip url={m.avatarUrl} label={t("student.playerV2.qaAvatarLabel")} />
                      )}
                      {m.inScope === false && (
                        <span className={styles.outScopeBadge}>
                          {t("student.playerV2.qaOutOfScopeBadge")}
                        </span>
                      )}
                      {(m.sourceSlides?.length || m.source) && (
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
                          {m.sourceSlides?.length
                            ? t("student.playerV2.qaSourceSlides", {
                                slides: formatSlides(m.sourceSlides),
                              })
                            : m.source}
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

      {/* Interstitial quiz — 타임스탬프 자동 출제. 정답 공개는 서버가 결정. */}
      <InterstitialQuiz
        open={activeQuiz !== null}
        question={activeQuiz ? toQuizQuestion(activeQuiz) : null}
        onClose={handleQuizClose}
        onSubmit={handleQuizSubmit}
      />

      {/* Attention warning */}
      {attention.isPaused && attention.warningLevel >= 1 && attention.warningLevel <= 3 && (
        <AttentionWarningV2
          level={attention.warningLevel as 1 | 2 | 3}
          onResume={attention.resume}
          onTakeQuiz={() => {
            attention.resume();
            triggerNextQuiz();
          }}
          onRestart={() => {
            goToSegment(0);
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

/** Q&A 답변에 부가되는 HeyGen 아바타 클립. 로드 실패 시 포스터로 폴백. */
function AvatarClip({ url, label }: { url: string; label: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={styles.avatarPoster} aria-label={label}>
        <span className={styles.avatarPosterOrb}>AI</span>
        <span>{label}</span>
      </div>
    );
  }
  return (
    <video
      className={styles.avatarClip}
      src={url}
      autoPlay
      muted={false}
      playsInline
      controls
      aria-label={label}
      onError={() => setFailed(true)}
    />
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
    <button type="button" className={styles.react} aria-label={label} onClick={onClick}>
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
