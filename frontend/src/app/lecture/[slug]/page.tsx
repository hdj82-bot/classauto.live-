"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useAttention } from "@/hooks/useAttention";
import Header from "@/components/Header";
import AttentionPauseOverlay from "@/components/AttentionPauseOverlay";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface LectureData {
  id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  slug: string;
  is_expired?: boolean;
}

interface QAMessage {
  role: "user" | "assistant";
  text: string;
}

export default function LectureViewerPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [lecture, setLecture] = useState<LectureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Q&A
  const [qaMessages, setQaMessages] = useState<QAMessage[]>([]);
  const [qaInput, setQaInput] = useState("");
  const [qaLoading, setQaLoading] = useState(false);
  const qaEndRef = useRef<HTMLDivElement>(null);

  // Video
  const videoRef = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState(0);

  // 강의 로드
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/lectures/${slug}/public`);
        if (data.is_expired) { router.replace("/expired"); return; }
        setLecture(data);
      } catch { router.replace("/dashboard"); }
      setLoading(false);
    })();
  }, [slug, router]);

  // 세션 시작
  useEffect(() => {
    if (!lecture || !user) return;
    (async () => {
      try {
        const { data } = await api.post("/api/v1/sessions", null, {
          params: { lecture_id: lecture.id, total_sec: 1800 },
        });
        setSessionId(data.id);
        await api.post("/api/v1/attention/start", {
          session_id: data.id, user_id: user.id, lecture_id: lecture.id,
        });
      } catch { /* ignore */ }
    })();
  }, [lecture, user]);

  // 집중도 추적
  const attention = useAttention({ sessionId: sessionId || "", heartbeatInterval: 10_000, noResponseTimeout: 30_000 });

  // 비디오 진행
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const sec = Math.floor(videoRef.current.currentTime);
    setProgress(sec);
    attention.setProgress(sec);
  };

  // Q&A 전송
  const handleQASend = async () => {
    if (!qaInput.trim() || !sessionId) return;
    const question = qaInput.trim();
    setQaInput("");
    setQaMessages((prev) => [...prev, { role: "user", text: question }]);
    setQaLoading(true);

    try {
      const { data } = await api.post(`/api/v1/qa`, {
        session_id: sessionId, task_id: lecture?.id, question,
      });
      setQaMessages((prev) => [...prev, { role: "assistant", text: data.answer }]);
    } catch {
      setQaMessages((prev) => [...prev, { role: "assistant", text: "오류가 발생했습니다. 다시 시도해주세요." }]);
    }
    setQaLoading(false);
    setTimeout(() => qaEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  if (loading) return <LoadingSpinner fullScreen label="강의 불러오는 중..." />;
  if (!lecture) return null;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Header />

      {/* 집중도 경고 오버레이 */}
      {attention.isPaused && (
        <AttentionPauseOverlay warningLevel={attention.warningLevel} onResume={attention.resume} />
      )}

      <div className="max-w-7xl mx-auto px-4 py-4">
        <h1 className="text-xl font-bold mb-4">{lecture.title}</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 비디오 영역 */}
          <div className="lg:col-span-2">
            <div className="aspect-video bg-black rounded-xl overflow-hidden">
              {lecture.video_url ? (
                <video
                  ref={videoRef}
                  src={lecture.video_url}
                  controls
                  onTimeUpdate={handleTimeUpdate}
                  className="w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500">
                  영상이 아직 준비되지 않았습니다
                </div>
              )}
            </div>

            {/* 진행 바 */}
            <div className="mt-2 bg-gray-700 rounded-full h-1.5">
              <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min((progress / 1800) * 100, 100)}%` }} />
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={() => router.push(`/lecture/${slug}/assess`)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5 py-2.5 text-sm font-medium transition"
              >
                평가 시작
              </button>
              {lecture.description && (
                <p className="text-sm text-gray-400 flex-1">{lecture.description}</p>
              )}
            </div>
          </div>

          {/* Q&A 패널 */}
          <div className="bg-gray-800 rounded-xl flex flex-col h-[400px] lg:h-[600px]">
            <div className="px-4 py-3 border-b border-gray-700 text-sm font-semibold">Q&A</div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {qaMessages.length === 0 && (
                <p className="text-gray-500 text-sm text-center mt-10">강의 내용에 대해 질문해보세요</p>
              )}
              {qaMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    msg.role === "user" ? "bg-indigo-600 text-white" : "bg-gray-700 text-gray-200"
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {qaLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-700 rounded-xl px-3 py-2 text-sm text-gray-400">답변 생성 중...</div>
                </div>
              )}
              <div ref={qaEndRef} />
            </div>
            <div className="p-3 border-t border-gray-700">
              <div className="flex gap-2">
                <input
                  value={qaInput}
                  onChange={(e) => setQaInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleQASend()}
                  placeholder="질문을 입력하세요..."
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-400 outline-none focus:border-indigo-500"
                />
                <button
                  onClick={handleQASend}
                  disabled={qaLoading || !qaInput.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl px-4 py-2 text-sm font-medium transition"
                >
                  전송
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
