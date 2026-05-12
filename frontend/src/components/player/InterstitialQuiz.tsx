"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import styles from "./Player.module.css";

/**
 * InterstitialQuiz — 영상 시청 도중 자동 등장하는 10초 카운트다운 퀴즈.
 *
 * 출처: docs/prototypes/06-student-flow.extracted.html (`.v4-quiz*`)
 *      + docs/planning/06-student-pages.md §8.4 +
 *        docs/planning/02-guardrails.md §1 (인터스티셜 퀴즈는 부정행위 방지
 *        4중 가드레일의 한 축).
 *
 * 컨트롤은 상위에서 `open`/`onClose`/`question` props 로 주입. 본 컴포넌트는
 * 카운트다운·정답 피드백·자동 닫힘만 책임진다.
 */
export interface QuizQuestion {
  id: string;
  prompt: string;
  options: { letter: string; text: string }[];
  correctLetter: string;
}

export interface InterstitialQuizProps {
  open: boolean;
  question: QuizQuestion | null;
  onClose: () => void;
  /** 정답/오답 결과 콜백 — 상위가 백엔드 기록을 처리. */
  onAnswer?: (correct: boolean, picked: string) => void;
  /** 카운트다운 초 (기본 10). */
  countdownSeconds?: number;
}

export default function InterstitialQuiz({
  open,
  question,
  onClose,
  onAnswer,
  countdownSeconds = 10,
}: InterstitialQuizProps) {
  const { t } = useI18n();
  const [seconds, setSeconds] = useState(countdownSeconds);
  const [picked, setPicked] = useState<string | null>(null);
  const tickRef = useRef<number | null>(null);
  // 상위에서 매 렌더마다 새 함수가 들어와도 effect 가 재실행되지 않도록 ref 화.
  // (PlayerV2 는 video timeupdate 시 매 프레임 재렌더한다.)
  const onCloseRef = useRef(onClose);
  const onAnswerRef = useRef(onAnswer);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    onAnswerRef.current = onAnswer;
  }, [onAnswer]);

  useEffect(() => {
    if (!open) {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
      setSeconds(countdownSeconds);
      setPicked(null);
      return;
    }
    setSeconds(countdownSeconds);
    setPicked(null);
    tickRef.current = window.setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          if (tickRef.current) window.clearInterval(tickRef.current);
          tickRef.current = null;
          // 타임아웃 — 닫는다 (학생이 응답 안 함).
          onCloseRef.current();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [open, countdownSeconds]);

  if (!open || !question) return null;

  const isAnswered = picked !== null;
  const correct = picked === question.correctLetter;

  const handlePick = (letter: string) => {
    if (isAnswered) return;
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setPicked(letter);
    onAnswerRef.current?.(letter === question.correctLetter, letter);
    window.setTimeout(() => onCloseRef.current(), 1800);
  };

  return (
    <div
      className={`${styles.quizScrim} ${styles.show}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("student.playerV2.quiz.badge")}
    >
      <div className={styles.quizCard}>
        <div className={styles.quizTop}>
          <span className={styles.quizBadge}>
            {t("student.playerV2.quiz.badge")}
          </span>
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

        <div className={styles.quizOpts}>
          {question.options.map((opt) => {
            const cls = !isAnswered
              ? ""
              : opt.letter === question.correctLetter
                ? styles.correct
                : opt.letter === picked
                  ? styles.wrong
                  : "";
            return (
              <button
                key={opt.letter}
                type="button"
                className={`${styles.quizOpt} ${cls}`}
                onClick={() => handlePick(opt.letter)}
                disabled={isAnswered}
              >
                <span className="letter">{opt.letter}</span>
                <span>{opt.text}</span>
              </button>
            );
          })}
        </div>

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
              {isAnswered
                ? correct
                  ? t("student.playerV2.quiz.correctFeedback")
                  : t("student.playerV2.quiz.wrongFeedback")
                : (
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
