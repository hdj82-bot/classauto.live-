"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/contexts/I18nContext";
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
  const { t } = useI18n();

  const [lecture, setLecture] = useState<LectureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Q&A
  const [qaMessages, setQaMessages] = useState<QAMessage[]>([]);
  const [qaInput, setQaInput] = useState("");
  const [qaLoading, setQaLoading] = useState(false);
  const qaEndRef = useRef<HTMLDivElement>(null);

  // Video
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

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

  useEffect(() => {
    if (!lecture || !user || !duration) return;
    (async () => {
      try {
        const { data } = await api.post("/api/v1/sessions", null, {
          params: { lecture_id: lecture.id, total_sec: Math.ceil(duration) },
        });
        setSessionId(data.id);
        await api.post("/api/v1/attention/start", {
          session_id: data.id, user_id: user.id, lecture_id: lecture.id,
        });
      } catch { /* ignore */ }
    })();
  }, [lecture, user, duration]);

  // 페이지 언마운트 또는 언로드 시 세션을 paused로 정리.
  // sendBeacon은 POST만 지원하므로 keepalive fetch(PATCH)를 사용한다.
  useEffect(() => {
    if (!sessionId) return;

    const pauseSession = () => {
      // completed 상태는 서버가 전이 거부하므로 안전하게 호출 가능
      fetch(`/api/v1/sessions/${sessionId}?status=paused`, {
        method: "PATCH",
        keepalive: true,
      }).catch(() => {/* 언로드 중 에러는 무시 */});
    };

    window.addEventListener("beforeunload", pauseSession);
    return () => {
      window.removeEventListener("beforeunload", pauseSession);
      pauseSession(); // 라우터 이동(언마운트) 시에도 호출
    };
  }, [sessionId]);

  const attention = useAttention({ sessionId: sessionId || "" });

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const sec = Math.floor(videoRef.current.currentTime);
    setProgress(sec);
    attention.setProgress(sec);
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) setDuration(videoRef.current.duration);
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

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
      setQaMessages((prev) => [...prev, { role: "assistant", text: t("lecture.qaError") }]);
    }
    setQaLoading(false);
    setTimeout(() => qaEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  if (loading) return <LoadingSpinner fullScreen label={t("lecture.loadingLecture")} />;
  if (!lecture) return null;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Header />

      {attention.isPaused && (
        <AttentionPauseOverlay warningLevel={attention.warningLevel} onResume={attention.resume} />
      )}

      <main className="max-w-7xl mx-auto px-4 py-4">
        <h1 className="text-xl font-bold mb-4">{lecture.title}</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Video area */}
          <div className="lg:col-span-2">
            <div className="aspect-video bg-black rounded-xl overflow-hidden">
              {lecture.video_url ? (
                <video
                  ref={videoRef}
                  src={lecture.video_url}
                  controls
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  className="w-full h-full"
                  aria-label={lecture.title}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <svg className="w-12 h-12 mx-auto mb-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <p>{t("lecture.videoNotReady")}</p>
                    <p className="text-sm text-gray-600 mt-1">{t("lecture.videoNotReadyDesc")}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div className="mt-2 flex items-center gap-2" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={duration || 100} aria-label="Video progress">
              <span className="text-xs text-gray-400 tabular-nums w-10">{formatTime(progress)}</span>
              <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: duration > 0 ? `${Math.min((progress / duration) * 100, 100)}%` : "0%" }} />
              </div>
              <span className="text-xs text-gray-400 tabular-nums w-10 text-right">{duration > 0 ? formatTime(duration) : "--:--"}</span>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={() => router.push(`/lecture/${slug}/assess${sessionId ? `?session_id=${sessionId}` : ""}`)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-5 py-2.5 text-sm font-medium transition"
              >
                {t("lecture.startAssess")}
              </button>
              {lecture.description && (
                <p className="text-sm text-gray-400 flex-1">{lecture.description}</p>
              )}
            </div>
          </div>

          {/* Q&A panel */}
          <section className="bg-gray-800 rounded-xl flex flex-col h-[400px] lg:h-[600px]" aria-label={t("lecture.qa")}>
            <div className="px-4 py-3 border-b border-gray-700 text-sm font-semibold">{t("lecture.qa")}</div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3" aria-live="polite">
              {qaMessages.length === 0 && (
                <p className="text-gray-500 text-sm text-center mt-10">{t("lecture.qaEmpty")}</p>
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
                  <div className="bg-gray-700 rounded-xl px-3 py-2 text-sm text-gray-400">{t("lecture.qaGenerating")}</div>
                </div>
              )}
              <div ref={qaEndRef} />
            </div>
            <div className="p-3 border-t border-gray-700">
              <div className="flex gap-2">
                <label htmlFor="qa-input" className="sr-only">{t("lecture.qaPlaceholder")}</label>
                <input
                  id="qa-input"
                  value={qaInput}
                  onChange={(e) => setQaInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleQASend()}
                  placeholder={t("lecture.qaPlaceholder")}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-400 outline-none focus:border-indigo-500"
                />
                <button
                  onClick={handleQASend}
                  disabled={qaLoading || !qaInput.trim()}
                  aria-label={t("lecture.qaSend")}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl px-4 py-2 text-sm font-medium transition"
                >
                  {t("lecture.qaSend")}
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
