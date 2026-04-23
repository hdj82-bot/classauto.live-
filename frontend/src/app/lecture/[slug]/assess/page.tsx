"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/contexts/I18nContext";
import { useToast } from "@/components/ui/Toast";
import Header from "@/components/Header";
import ProtectedRoute from "@/components/ProtectedRoute";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface Question {
  id: string;
  content: string;
  options: string[] | null;
}

export default function AssessmentPage() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id") ?? "";
  const router = useRouter();
  const { t } = useI18n();
  const { toast } = useToast();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: lecture } = await api.get(`/api/lectures/${slug}/public`);
        const { data } = await api.get("/api/v1/questions", {
          params: { lecture_id: lecture.id, session_id: sessionId },
        });
        setQuestions(data.questions ?? data ?? []);
      } catch {
        setError(t("assess.loadError"));
      }
      setLoading(false);
    })();
  }, [slug, sessionId]);

  const currentQuestion = questions[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === questions.length - 1;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.post(`/api/v1/sessions/${sessionId}/complete`);
      setCompleted(true);
    } catch {
      toast(t("assess.submitError"), "error");
    }
    setSubmitting(false);
  };

  if (loading) return <LoadingSpinner fullScreen label={t("assess.loadingQuestions")} />;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-gray-900">{t("assess.title")}</h1>
            <button
              onClick={() => router.back()}
              className="text-sm text-gray-500 hover:text-gray-700 transition"
            >
              {t("common.back")}
            </button>
          </div>

          {/* Error state */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-6 text-center">
              <p className="font-medium">{error}</p>
              <button
                onClick={() => router.back()}
                className="mt-4 text-sm underline hover:no-underline"
              >
                {t("common.back")}
              </button>
            </div>
          )}

          {/* Completion screen */}
          {!error && completed && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-8 text-center">
              <div
                className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-100 flex items-center justify-center"
                aria-hidden="true"
              >
                <svg
                  className="w-8 h-8 text-indigo-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-indigo-700 mb-2">
                {t("assess.complete")}
              </h2>
              <p className="text-indigo-600 text-sm">{t("assess.completeDesc")}</p>
              <button
                onClick={() => router.back()}
                className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-6 py-2.5 text-sm font-medium transition"
              >
                {t("assess.backToLecture")}
              </button>
            </div>
          )}

          {/* No questions */}
          {!error && !completed && questions.length === 0 && (
            <div className="text-center py-20">
              <div
                className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center"
                aria-hidden="true"
              >
                <svg
                  className="w-8 h-8 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
              <p className="text-gray-700 font-medium mb-1">{t("assess.noQuestions")}</p>
              <p className="text-sm text-gray-400">{t("assess.noQuestionsDesc")}</p>
            </div>
          )}

          {/* Question view */}
          {!error && !completed && questions.length > 0 && currentQuestion && (
            <div>
              {/* Progress bar */}
              <div className="flex items-center gap-3 mb-6">
                <span className="text-sm text-gray-500 whitespace-nowrap">
                  {t("assess.questionCount", {
                    current: String(currentIndex + 1),
                    total: String(questions.length),
                  })}
                </span>
                <div
                  className="flex-1 bg-gray-200 rounded-full h-1.5"
                  role="progressbar"
                  aria-valuenow={currentIndex + 1}
                  aria-valuemin={1}
                  aria-valuemax={questions.length}
                >
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Question card */}
              <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
                <p className="text-gray-900 font-medium text-base mb-6 leading-relaxed">
                  {currentQuestion.content}
                </p>

                {/* Multiple choice */}
                {currentQuestion.options && currentQuestion.options.length > 0 ? (
                  <div
                    className="space-y-3"
                    role="radiogroup"
                    aria-label={currentQuestion.content}
                  >
                    {currentQuestion.options.map((opt, idx) => {
                      const selected = answers[currentQuestion.id] === String(idx);
                      return (
                        <label
                          key={idx}
                          className={`flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition ${
                            selected
                              ? "border-indigo-500 bg-indigo-50"
                              : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"
                          }`}
                        >
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
                            className="accent-indigo-600 shrink-0"
                          />
                          <span className="font-semibold text-gray-400 text-sm w-5 shrink-0">
                            {String.fromCharCode(65 + idx)}.
                          </span>
                          <span className="text-sm text-gray-800">{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div>
                    <label htmlFor={`short-${currentQuestion.id}`} className="sr-only">
                      {t("assess.answerPlaceholder")}
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
                      placeholder={t("assess.answerPlaceholder")}
                      rows={4}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                    />
                  </div>
                )}
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setCurrentIndex((i) => i - 1)}
                  disabled={isFirst}
                  className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  {t("common.previous")}
                </button>

                {isLast ? (
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl px-6 py-2.5 text-sm font-semibold transition"
                  >
                    {submitting ? t("common.submitting") : t("common.submit")}
                  </button>
                ) : (
                  <button
                    onClick={() => setCurrentIndex((i) => i + 1)}
                    className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition"
                  >
                    {t("common.next")}
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}
