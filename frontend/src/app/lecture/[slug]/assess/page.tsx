"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/contexts/I18nContext";
import Modal from "@/components/ui/Modal";
import Header from "@/components/Header";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface Question {
  id: string;
  assessment_type: string;
  question_type: string;
  difficulty: string;
  content: string;
  options: string[] | null;
  timestamp_seconds: number | null;
}

interface ResponseResult {
  question_id: string;
  is_correct: boolean | null;
  user_answer: string;
}

export default function AssessmentPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useI18n();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ResponseResult[] | null>(null);
  const [score, setScore] = useState<{ total: number; correct: number } | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [lectureId, setLectureId] = useState("");
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const answeredCount = questions.filter((q) => answers[q.id]?.trim()).length;

  useEffect(() => {
    (async () => {
      try {
        const { data: lecture } = await api.get(`/api/lectures/${slug}/public`);
        setLectureId(lecture.id);

        const { data: session } = await api.post("/api/v1/sessions", null, {
          params: { lecture_id: lecture.id, total_sec: 1800 },
        });
        setSessionId(session.id);

        const { data } = await api.get(`/api/questions/${lecture.id}`, {
          params: { assessment_type: "summative", session_id: session.id },
        });
        setQuestions(data.questions || []);
      } catch {
        toast(t("assess.loadError"), "error");
      }
      setLoading(false);
    })();
  }, [slug]);

  const handleSubmit = async () => {
    if (!sessionId) return;
    setSubmitting(true);
    setShowSubmitModal(false);
    try {
      const responses = questions.map((q) => ({
        question_id: q.id,
        user_answer: answers[q.id] || "",
        video_timestamp_seconds: 0,
      }));
      const { data } = await api.post("/api/responses", { session_id: sessionId, responses });
      setResults(data.responses || []);
      setScore(data.score || null);
      toast(t("assess.submitSuccess"), "success");
    } catch {
      toast(t("assess.submitError"), "error");
    }
    setSubmitting(false);
  };

  if (loading) return <LoadingSpinner fullScreen label={t("assess.loadingQuestions")} />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t("assess.title")}</h1>
            {questions.length > 0 && !results && (
              <p className="text-xs text-gray-400 mt-0.5" aria-live="polite">
                {t("assess.answered", { count: answeredCount, total: questions.length })}
              </p>
            )}
          </div>
          <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700 transition">
            {t("common.back")}
          </button>
        </div>

        {/* Progress bar */}
        {questions.length > 0 && !results && (
          <div className="bg-gray-200 rounded-full h-1.5 mb-6" role="progressbar" aria-valuenow={answeredCount} aria-valuemin={0} aria-valuemax={questions.length} aria-label={t("assess.answered", { count: answeredCount, total: questions.length })}>
            <div
              className="bg-indigo-500 h-1.5 rounded-full transition-all"
              style={{ width: `${(answeredCount / questions.length) * 100}%` }}
            />
          </div>
        )}

        {/* Score result */}
        {score && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6 mb-6 text-center" role="status">
            <p className="text-3xl font-bold text-indigo-700">{score.correct} / {score.total}</p>
            <p className="text-sm text-indigo-600 mt-1">
              {t("assess.accuracy", { pct: score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0 })}
            </p>
            <button onClick={() => router.back()}
              className="mt-4 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5 py-2 transition">
              {t("assess.backToLecture")}
            </button>
          </div>
        )}

        {/* Questions */}
        {questions.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center" aria-hidden="true">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-gray-700 font-medium mb-1">{t("assess.noQuestions")}</p>
            <p className="text-sm text-gray-400">{t("assess.noQuestionsDesc")}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {questions.map((q, idx) => (
              <fieldset key={q.id} className="bg-white border border-gray-200 rounded-2xl p-6">
                <div className="flex items-start gap-3 mb-4">
                  <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    results
                      ? results.find((r) => r.question_id === q.id)?.is_correct
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                      : answers[q.id]?.trim()
                        ? "bg-indigo-600 text-white"
                        : "bg-indigo-100 text-indigo-700"
                  }`} aria-hidden="true">
                    {idx + 1}
                  </span>
                  <div>
                    <legend className="text-sm font-medium text-gray-900">{q.content}</legend>
                    <span className="text-xs text-gray-400 mt-1 inline-block">
                      {q.question_type === "multiple_choice" ? t("assess.multipleChoice") : q.question_type === "true_false" ? t("assess.trueFalse") : t("assess.shortAnswer")} · {q.difficulty}
                    </span>
                  </div>
                </div>

                {/* Multiple choice */}
                {q.options && q.options.length > 0 ? (
                  <div className="space-y-2 ml-0 sm:ml-10" role="radiogroup" aria-label={q.content}>
                    {q.options.map((opt, oi) => {
                      const selected = answers[q.id] === String(oi);
                      const resultItem = results?.find((r) => r.question_id === q.id);
                      let optClass = "border-gray-200 hover:border-indigo-300";
                      if (results) {
                        if (selected && resultItem?.is_correct) optClass = "border-green-500 bg-green-50";
                        else if (selected && !resultItem?.is_correct) optClass = "border-red-500 bg-red-50";
                      } else if (selected) {
                        optClass = "border-indigo-500 bg-indigo-50";
                      }

                      return (
                        <button
                          key={oi}
                          onClick={() => !results && setAnswers((prev) => ({ ...prev, [q.id]: String(oi) }))}
                          disabled={!!results}
                          role="radio"
                          aria-checked={selected}
                          className={`w-full text-left border rounded-xl px-4 py-2.5 text-sm transition ${optClass}`}
                        >
                          <span className="font-medium text-gray-500 mr-2">{String.fromCharCode(65 + oi)}.</span>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="ml-0 sm:ml-10">
                    <label htmlFor={`answer-${q.id}`} className="sr-only">{t("assess.answerPlaceholder")}</label>
                    <input
                      id={`answer-${q.id}`}
                      type="text"
                      value={answers[q.id] || ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      disabled={!!results}
                      placeholder={t("assess.answerPlaceholder")}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                )}
              </fieldset>
            ))}

            {!results && (
              <button
                onClick={() => setShowSubmitModal(true)}
                disabled={submitting}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl py-3 text-sm font-semibold transition"
              >
                {submitting ? t("common.submitting") : t("common.submit")}
              </button>
            )}
          </div>
        )}
      </main>

      {/* Submit confirmation modal */}
      <Modal open={showSubmitModal} onClose={() => setShowSubmitModal(false)} title={t("assess.submitTitle")}>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-gray-600">
            {answeredCount < questions.length
              ? t("assess.unanswered", { count: questions.length - answeredCount })
              : t("assess.allAnswered")}
          </p>
          <p className="text-xs text-gray-400">{t("assess.submitWarning")}</p>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setShowSubmitModal(false)}
              className="text-sm border border-gray-300 rounded-xl px-4 py-2 hover:bg-gray-50 transition">
              {t("common.cancel")}
            </button>
            <button onClick={handleSubmit} disabled={submitting}
              className="text-sm bg-indigo-600 text-white rounded-xl px-4 py-2 hover:bg-indigo-700 disabled:opacity-50 transition">
              {submitting ? t("common.submitting") : t("common.submit")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
