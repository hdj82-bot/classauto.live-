"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
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

  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ResponseResult[] | null>(null);
  const [score, setScore] = useState<{ total: number; correct: number } | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [lectureId, setLectureId] = useState("");

  useEffect(() => {
    (async () => {
      try {
        // 강의 정보 조회
        const { data: lecture } = await api.get(`/api/lectures/${slug}/public`);
        setLectureId(lecture.id);

        // 세션 ID 가져오기 (간단히 새 세션 생성)
        const { data: session } = await api.post("/api/v1/sessions", null, {
          params: { lecture_id: lecture.id, total_sec: 1800 },
        });
        setSessionId(session.id);

        // 문제 조회
        const { data } = await api.get(`/api/questions/${lecture.id}`, {
          params: { assessment_type: "summative", session_id: session.id },
        });
        setQuestions(data.questions || []);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [slug]);

  const handleSubmit = async () => {
    if (!sessionId) return;
    setSubmitting(true);
    try {
      const responses = questions.map((q) => ({
        question_id: q.id,
        user_answer: answers[q.id] || "",
        video_timestamp_seconds: 0,
      }));
      const { data } = await api.post("/api/responses", { session_id: sessionId, responses });
      setResults(data.responses || []);
      setScore(data.score || null);
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  if (loading) return <LoadingSpinner fullScreen label="평가 문제 불러오는 중..." />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">평가</h1>
          <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700">
            돌아가기
          </button>
        </div>

        {/* 결과 표시 */}
        {score && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6 mb-6 text-center">
            <p className="text-3xl font-bold text-indigo-700">{score.correct} / {score.total}</p>
            <p className="text-sm text-indigo-600 mt-1">
              정답률 {score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0}%
            </p>
          </div>
        )}

        {/* 문제 목록 */}
        {questions.length === 0 ? (
          <p className="text-center text-gray-400 py-20">아직 준비된 문제가 없습니다</p>
        ) : (
          <div className="space-y-6">
            {questions.map((q, idx) => (
              <div key={q.id} className="bg-white border border-gray-200 rounded-2xl p-6">
                <div className="flex items-start gap-3 mb-4">
                  <span className="flex-shrink-0 w-7 h-7 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xs font-bold">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{q.content}</p>
                    <span className="text-xs text-gray-400 mt-1 inline-block">
                      {q.question_type === "multiple_choice" ? "객관식" : q.question_type === "true_false" ? "O/X" : "주관식"} · {q.difficulty}
                    </span>
                  </div>
                </div>

                {/* 객관식 */}
                {q.options && q.options.length > 0 ? (
                  <div className="space-y-2 ml-0 sm:ml-10">
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
                    <input
                      type="text"
                      value={answers[q.id] || ""}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      disabled={!!results}
                      placeholder="답을 입력하세요"
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
                    />
                  </div>
                )}
              </div>
            ))}

            {!results && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl py-3 text-sm font-semibold transition"
              >
                {submitting ? "채점 중..." : "제출하기"}
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
