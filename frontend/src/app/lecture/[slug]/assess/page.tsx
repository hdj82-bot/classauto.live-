"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useI18n } from "@/contexts/I18nContext";
import { useToast } from "@/components/ui/Toast";
import ProtectedRoute from "@/components/ProtectedRoute";
import StudentSurfaceLight from "@/components/student/v2/StudentSurfaceLight";
import tokensCss from "@/components/student/v2/tokens-v2.module.css";
import styles from "@/components/student/v2/Assess.module.css";

/**
 * /lecture/[slug]/assess — 형성평가 (v2 라이트 톤).
 *
 * 영상이 없는 인터페이스이므로 라이트 (colors.md §1). 진행도 바 · 객관식 칩 ·
 * 단답형 textarea 가 06 prototype 의 카드/칩 스타일을 따른다. 라우팅·API
 * 호출은 v1 의 흐름을 그대로 유지 — POST /api/responses + 학습 세션 complete.
 */
interface Question {
  id: string;
  content: string;
  options: string[] | null;
  timestamp_seconds?: number | null;
}

interface SubmittedResult {
  question_id: string;
  is_correct: boolean | null;
}

interface ScoreResult {
  total: number;
  correct: number;
  pending: number;
}

export default function AssessmentPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const searchParams = useSearchParams();
  const learningSessionId = searchParams.get("session_id") ?? "";
  const router = useRouter();
  const { t } = useI18n();
  const { toast } = useToast();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assessmentSessionId, setAssessmentSessionId] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data: lecture } = await api.get(`/api/lectures/${slug}/public`);
        const { data } = await api.get(`/api/questions/${lecture.id}`, {
          params: { assessment_type: "formative" },
        });
        setQuestions(data.questions ?? []);
        setAssessmentSessionId(data.session_id ?? "");
      } catch {
        setError(t("student.assessV2.loadError"));
      }
      setLoading(false);
    })();
  }, [slug, t]);

  const currentQuestion = questions[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === questions.length - 1;
  const progressPct =
    questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  const handleSubmit = async () => {
    // 빈 응답 가드: 답을 하나도 입력/선택하지 않았으면 제출 자체를 막는다.
    // (종전엔 빈 응답이어도 setCompleted(true) 가 실행돼 "완료" 가 떴다.)
    const responses = Object.entries(answers)
      .filter(([, user_answer]) => user_answer.trim() !== "")
      .map(([question_id, user_answer]) => ({
        question_id,
        user_answer,
        video_timestamp_seconds: 0,
      }));

    if (responses.length === 0 || !assessmentSessionId) {
      toast(t("student.assessV2.submitError"), "error");
      return;
    }

    setSubmitting(true);
    try {
      const { data: submitted } = await api.post("/api/responses", {
        session_id: assessmentSessionId,
        responses,
      });
      // 서버가 배열이 아닌/빈 응답을 돌려주면 채점 실패로 간주 — 완료 처리하지 않는다.
      const results = Array.isArray(submitted) ? (submitted as SubmittedResult[]) : [];
      if (results.length === 0) {
        throw new Error("empty submission result");
      }
      const total = results.length;
      const correct = results.filter((r) => r.is_correct === true).length;
      const pending = results.filter((r) => r.is_correct === null).length;
      setScoreResult({ total, correct, pending });

      // 학습 세션 완료 표시(있을 때만). 채점 응답이 유효한 뒤에만 호출한다.
      if (learningSessionId) {
        await api.post(`/api/v1/sessions/${learningSessionId}/complete`);
      }

      // 실제 채점 성공 시에만 완료 화면으로 전환.
      setCompleted(true);
    } catch {
      toast(t("student.assessV2.submitError"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <StudentSurfaceLight bare>
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            color: "rgba(10,10,10,0.55)",
            fontSize: 14,
          }}
        >
          <p role="status">{t("student.assessV2.loadingQuestions")}</p>
        </div>
      </StudentSurfaceLight>
    );
  }

  return (
    <ProtectedRoute>
      <StudentSurfaceLight>
        <div className={`${styles.wrap} ${tokensCss.fadeIn}`}>
          <span className={styles.kicker}>{t("student.assessV2.kicker")}</span>
          <div className={styles.header}>
            <h1 className={styles.title}>{t("student.assessV2.title")}</h1>
            <p className={styles.subtitle}>{t("student.assessV2.subtitle")}</p>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                background: "rgba(239,68,68,0.06)",
                border: "1px solid rgba(239,68,68,0.30)",
                color: "#b91c1c",
                borderRadius: 12,
                padding: "12px 16px",
                fontSize: 13.5,
              }}
            >
              {error}
            </div>
          )}

          {!error && completed && (
            <CompletionCard
              score={scoreResult}
              onBack={() => router.push(`/lecture/${slug}`)}
            />
          )}

          {!error && !completed && questions.length === 0 && (
            <div className={styles.emptyCard}>
              <svg
                width="56"
                height="56"
                viewBox="0 0 24 24"
                fill="none"
                stroke="url(#ca-grad-violet)"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" />
              </svg>
              <h2>{t("student.assessV2.noQuestionsTitle")}</h2>
              <p>{t("student.assessV2.noQuestionsDesc")}</p>
            </div>
          )}

          {!error && !completed && currentQuestion && (
            <>
              <div className={styles.progress}>
                <div
                  className={styles.progressBar}
                  role="progressbar"
                  aria-valuemin={1}
                  aria-valuemax={questions.length}
                  aria-valuenow={currentIndex + 1}
                >
                  <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
                </div>
                <span className={styles.progressLabel}>
                  {t("student.assessV2.progress", {
                    current: String(currentIndex + 1),
                    total: String(questions.length),
                  })}
                </span>
              </div>

              <div className={styles.card}>
                <div className={styles.qNumber}>
                  {t("student.assessV2.questionLabel", { n: String(currentIndex + 1) })}
                </div>
                <div className={styles.qText}>{currentQuestion.content}</div>

                {currentQuestion.options && currentQuestion.options.length > 0 ? (
                  <div
                    className={styles.options}
                    role="radiogroup"
                    aria-label={currentQuestion.content}
                  >
                    {currentQuestion.options.map((opt, idx) => {
                      const selected = answers[currentQuestion.id] === String(idx);
                      return (
                        <label key={idx} className={styles.option}>
                          <input
                            type="radio"
                            name={`q-${currentQuestion.id}`}
                            value={String(idx)}
                            checked={selected}
                            onChange={() =>
                              setAnswers((prev) => ({
                                ...prev,
                                [currentQuestion.id]: String(idx),
                              }))
                            }
                          />
                          <span className={styles.optionLetter}>
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.shortAnswer}>
                    <label htmlFor={`short-${currentQuestion.id}`} style={{ display: "none" }}>
                      {t("student.assessV2.answerPlaceholder")}
                    </label>
                    <textarea
                      id={`short-${currentQuestion.id}`}
                      value={answers[currentQuestion.id] ?? ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [currentQuestion.id]: e.target.value,
                        }))
                      }
                      placeholder={t("student.assessV2.answerPlaceholder")}
                      rows={4}
                    />
                  </div>
                )}
              </div>

              <div className={styles.nav}>
                <button
                  type="button"
                  className={styles.navPrev}
                  disabled={isFirst}
                  onClick={() => setCurrentIndex((i) => i - 1)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M15 19l-7-7 7-7" />
                  </svg>
                  {t("student.assessV2.previous")}
                </button>

                {isLast ? (
                  <button
                    type="button"
                    className={`${tokensCss.btn} ${tokensCss.btnGold}`}
                    style={{ width: "auto", padding: "0 28px", height: 48 }}
                    disabled={submitting}
                    onClick={handleSubmit}
                  >
                    {submitting
                      ? t("student.assessV2.submitting")
                      : t("student.assessV2.submit")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${tokensCss.btn} ${tokensCss.btnOutlineLight}`}
                    style={{ width: "auto", padding: "0 22px", height: 48 }}
                    onClick={() => setCurrentIndex((i) => i + 1)}
                  >
                    {t("student.assessV2.next")}
                    <svg
                      className={tokensCss.btnArrow}
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="13 6 19 12 13 18" />
                    </svg>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </StudentSurfaceLight>
    </ProtectedRoute>
  );
}

function CompletionCard({
  score,
  onBack,
}: {
  score: ScoreResult | null;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const pct =
    score && score.total > 0 ? Math.round((score.correct / score.total) * 100) : null;
  return (
    <div className={styles.completeCard}>
      <div className={styles.completeIllust} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" fill="url(#ca-grad-success)" opacity="0.18" />
          <circle cx="12" cy="12" r="6.5" fill="url(#ca-grad-success)" />
          <path
            d="M9 12l2.4 2.4L15.5 10"
            stroke="#0A0A0A"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
      <h2 className={styles.completeTitle}>{t("student.assessV2.complete")}</h2>
      {pct !== null && (
        <>
          <div className={styles.completeScore}>{`${pct}%`}</div>
          {score && (
            <div className={styles.completeDetail}>
              {t("student.assessV2.scoreDetail", {
                correct: String(score.correct),
                total: String(score.total),
              })}
            </div>
          )}
        </>
      )}
      <p className={styles.completeDesc}>{t("student.assessV2.completeDesc")}</p>
      <button
        type="button"
        className={`${tokensCss.btn} ${tokensCss.btnGold}`}
        style={{ width: "auto", padding: "0 28px", height: 50, marginTop: 12 }}
        onClick={onBack}
      >
        {t("student.assessV2.backToPlayer")}
      </button>
    </div>
  );
}
