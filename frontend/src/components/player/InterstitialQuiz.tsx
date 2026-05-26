"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import styles from "./Player.module.css";

/**
 * InterstitialQuiz — 영상 시청 도중 자동 등장하는 카운트다운 퀴즈.
 *
 * 출처: docs/prototypes/06-student-flow.extracted.html (`.v4-quiz*`)
 *      + docs/planning/06-student-pages.md §8.4 + docs/planning/02-guardrails.md §1.
 *
 * 정답 공개는 **서버 귀속**이다(부정행위 방지): 학생이 답을 고르면 상위(`onSubmit`)가
 * 백엔드에 기록·채점하고, 그 문제의 reveal_answer 에 따라 정답·해설을 돌려준다.
 *  - reveal=true  → 정답/오답 + 정답 보기 + 해설 표시
 *  - reveal=false → 정/오답·정답 모두 숨기고 "기록됨, 수업에서 확인" 만 표시(대면 활용)
 *
 * 컨트롤은 상위에서 `open`/`question`/`onSubmit`/`onClose` props 로 주입.
 */
export interface QuizQuestion {
  id: string;
  prompt: string;
  questionType: "multiple_choice" | "short_answer";
  /** 객관식 보기. 주관식이면 빈 배열. */
  options: { letter: string; text: string }[];
}

/** onSubmit 이 반환하는 채점 결과(공개 모드 포함). */
export interface QuizAnswerOutcome {
  recorded: boolean;
  reveal: boolean;
  correct: boolean | null;
  /** 객관식 정답 보기 letter (reveal=true 일 때만). */
  correctLetter: string | null;
  explanation: string | null;
  /** 주관식 모범답안 (reveal=true 일 때만). */
  modelAnswer: string | null;
}

export interface InterstitialQuizProps {
  open: boolean;
  question: QuizQuestion | null;
  onClose: () => void;
  /** 응답 제출 — 상위가 백엔드 기록 후 채점/공개 결과를 반환. null = 기록 실패. */
  onSubmit?: (answer: string) => Promise<QuizAnswerOutcome | null>;
  /** 카운트다운 초 (기본 10). */
  countdownSeconds?: number;
}

export default function InterstitialQuiz({
  open,
  question,
  onClose,
  onSubmit,
  countdownSeconds = 10,
}: InterstitialQuizProps) {
  const { t } = useI18n();
  const [seconds, setSeconds] = useState(countdownSeconds);
  const [picked, setPicked] = useState<string | null>(null);
  const [shortText, setShortText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<QuizAnswerOutcome | null>(null);
  const tickRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  // 상위에서 매 렌더마다 새 함수가 들어와도 effect 가 재실행되지 않도록 ref 화.
  const onCloseRef = useRef(onClose);
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  const stopTick = () => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  useEffect(() => {
    // react-hooks/set-state-in-effect: effect body 동기 setState 금지 → rAF 비동기화.
    let rafHandle: number | null = null;
    const reset = () => {
      setSeconds(countdownSeconds);
      setPicked(null);
      setShortText("");
      setSubmitting(false);
      setOutcome(null);
    };
    if (!open) {
      stopTick();
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      rafHandle = requestAnimationFrame(reset);
      return () => {
        if (rafHandle !== null) cancelAnimationFrame(rafHandle);
      };
    }
    rafHandle = requestAnimationFrame(reset);
    tickRef.current = window.setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          stopTick();
          // 타임아웃 — 응답 없이 닫는다.
          onCloseRef.current();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      stopTick();
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
    };
  }, [open, countdownSeconds]);

  if (!open || !question) return null;

  const isMultiple = question.questionType === "multiple_choice";
  const locked = submitting || outcome !== null;

  const finishWithOutcome = (result: QuizAnswerOutcome | null) => {
    setOutcome(result);
    setSubmitting(false);
    // reveal 은 읽을 시간을 더 준다. 비공개/오류는 짧게.
    const delay = result?.reveal ? 3600 : 2000;
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current(), delay);
  };

  const submit = async (answer: string) => {
    if (locked) return;
    stopTick();
    setSubmitting(true);
    try {
      const result = (await onSubmitRef.current?.(answer)) ?? null;
      finishWithOutcome(result);
    } catch {
      finishWithOutcome(null);
    }
  };

  const handlePick = (letter: string) => {
    if (locked) return;
    setPicked(letter);
    void submit(letter);
  };

  const handleShortSubmit = () => {
    const text = shortText.trim();
    if (!text || locked) return;
    void submit(text);
  };

  const mascotText = (() => {
    if (submitting) return t("student.playerV2.quiz.submitting");
    if (outcome === null && locked) return t("student.playerV2.quiz.recordError");
    if (outcome) {
      if (!outcome.reveal) return t("student.playerV2.quiz.recordedFeedback");
      if (outcome.correct === true) return t("student.playerV2.quiz.correctFeedback");
      if (outcome.correct === false) return t("student.playerV2.quiz.wrongFeedback");
      // 주관식 reveal: 정/오답 자동판정 없음 → 모범답안 확인 안내.
      return t("student.playerV2.quiz.recordedFeedback");
    }
    return null;
  })();

  const showReveal = outcome?.reveal === true;

  return (
    <div
      className={`${styles.quizScrim} ${styles.show}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("student.playerV2.quiz.badge")}
    >
      <div className={styles.quizCard}>
        <div className={styles.quizTop}>
          <span className={styles.quizBadge}>{t("student.playerV2.quiz.badge")}</span>
          <span className={styles.quizTimer}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 14" />
            </svg>
            {t("student.playerV2.quiz.timer", { sec: String(seconds) })}
          </span>
        </div>

        <h3 className={styles.quizQ}>{question.prompt}</h3>

        {isMultiple ? (
          <div className={styles.quizOpts}>
            {question.options.map((opt) => {
              const cls = !showReveal
                ? ""
                : opt.letter === outcome?.correctLetter
                  ? styles.correct
                  : opt.letter === picked
                    ? styles.wrong
                    : "";
              // 비공개 모드: 정/오답 색은 없지만 고른 보기는 옅게 표시.
              const pickedNeutral =
                !showReveal && locked && opt.letter === picked
                  ? { outline: "2px solid rgba(255,255,255,0.45)", outlineOffset: "-1px" }
                  : undefined;
              return (
                <button
                  key={opt.letter}
                  type="button"
                  className={`${styles.quizOpt} ${cls}`}
                  style={pickedNeutral}
                  onClick={() => handlePick(opt.letter)}
                  disabled={locked}
                >
                  <span className="letter">{opt.letter}</span>
                  <span>{opt.text}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              value={shortText}
              onChange={(e) => setShortText(e.target.value)}
              placeholder={t("student.playerV2.quiz.shortAnswerPlaceholder")}
              rows={3}
              disabled={locked}
              aria-label={question.prompt}
              style={{
                width: "100%",
                resize: "none",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.06)",
                color: "#FFFFFF",
                fontSize: 14,
                fontFamily: "inherit",
                lineHeight: 1.5,
              }}
            />
            {!locked && (
              <button
                type="button"
                onClick={handleShortSubmit}
                disabled={!shortText.trim()}
                style={{
                  alignSelf: "flex-end",
                  padding: "8px 16px",
                  borderRadius: 9,
                  border: "none",
                  background: shortText.trim()
                    ? "linear-gradient(135deg, #FFB627, #E89E0E)"
                    : "rgba(255,255,255,0.15)",
                  color: shortText.trim() ? "#0A0A0A" : "rgba(255,255,255,0.5)",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: shortText.trim() ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                }}
              >
                {submitting
                  ? t("student.playerV2.quiz.submitting")
                  : t("student.playerV2.quiz.submit")}
              </button>
            )}
            {showReveal && outcome?.modelAnswer && (
              <div
                style={{
                  padding: "9px 11px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.07)",
                  fontSize: 13,
                  color: "#FFFFFF",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, marginBottom: 4 }}>
                  {t("student.playerV2.quiz.modelAnswerLabel")}
                </div>
                {outcome.modelAnswer}
              </div>
            )}
          </div>
        )}

        {/* 해설 (공개 모드 + 해설 존재 시) */}
        {showReveal && outcome?.explanation && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.06)",
              fontSize: 13,
              lineHeight: 1.55,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, marginBottom: 4 }}>
              {t("student.playerV2.quiz.explanationLabel")}
            </div>
            {outcome.explanation}
          </div>
        )}

        <div className={styles.quizFoot}>
          <div className={styles.quizMascot}>
            <span className={styles.mascotAv} aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="currentColor">
                <ellipse cx="16" cy="19" rx="9" ry="10" />
                <ellipse cx="16" cy="13" rx="8" ry="7" fill="#A99B7E" />
                <circle cx="12" cy="13" r="2" fill="#FFFFFF" />
                <circle cx="20" cy="13" r="2" fill="#FFFFFF" />
                <circle cx="12" cy="14" r="0.9" fill="#0A0A0A" />
                <circle cx="20" cy="14" r="0.9" fill="#0A0A0A" />
              </svg>
            </span>
            <span className={styles.mascotSays}>
              {mascotText ?? (
                <>
                  {t("student.playerV2.quiz.mascotSay1")}
                  <br />
                  {t("student.playerV2.quiz.mascotSay2")}
                </>
              )}
            </span>
          </div>
          <button type="button" className={styles.quizClose} onClick={onClose}>
            {t("student.playerV2.quiz.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
