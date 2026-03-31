"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface Segment {
  slide_index: number;
  text: string;
  start_seconds: number;
  end_seconds: number;
  tone: string;
  question_pin_seconds: number | null;
}

interface ScriptData {
  video_id: string;
  status: string;
  segments: Segment[];
  ai_segments: Segment[] | null;
  approved_at: string | null;
}

export default function ScriptEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [script, setScript] = useState<ScriptData | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // 영상 ID로 스크립트 조회 — 실제로는 lecture -> video -> script 체인
        const { data } = await api.get(`/api/videos/${id}/script`);
        setScript(data);
        setSegments(data.segments || []);
      } catch { /* 스크립트 미생성 상태 */ }
      setLoading(false);
    })();
  }, [id]);

  const handleSegmentChange = (idx: number, field: keyof Segment, value: string | number | null) => {
    setSegments((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    if (!script) return;
    setSaving(true);
    try {
      await api.patch(`/api/videos/${script.video_id}/script`, { segments });
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleApprove = async () => {
    if (!script) return;
    try {
      await api.post(`/api/videos/${script.video_id}/approve`);
      router.push("/professor/dashboard");
    } catch { /* ignore */ }
  };

  const handleReset = async () => {
    if (!script) return;
    try {
      const { data } = await api.post(`/api/videos/${script.video_id}/script/reset`);
      setSegments(data.segments || []);
    } catch { /* ignore */ }
  };

  if (loading) return <LoadingSpinner fullScreen label="스크립트 불러오는 중..." />;

  if (!script || segments.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400 mb-4">아직 스크립트가 생성되지 않았습니다</p>
        <p className="text-sm text-gray-400">PPT를 업로드하면 AI가 자동으로 스크립트를 생성합니다</p>
      </div>
    );
  }

  const current = segments[activeSlide];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">스크립트 에디터</h1>
        <div className="flex gap-2">
          <button onClick={handleReset} className="text-sm border border-gray-300 rounded-xl px-4 py-2 hover:bg-gray-50 transition">
            AI 원본 복원
          </button>
          <button onClick={handleSave} disabled={saving}
            className="text-sm bg-gray-900 text-white rounded-xl px-4 py-2 hover:bg-gray-800 disabled:opacity-50 transition">
            {saving ? "저장 중..." : "저장"}
          </button>
          <button onClick={handleApprove}
            className="text-sm bg-indigo-600 text-white rounded-xl px-4 py-2 hover:bg-indigo-700 transition">
            승인 (렌더링 시작)
          </button>
        </div>
      </div>

      {/* 슬라이드 타임라인 */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-2">
        {segments.map((seg, i) => (
          <button key={i} onClick={() => setActiveSlide(i)}
            className={`flex-shrink-0 w-20 h-14 rounded-lg border text-xs font-medium transition ${
              i === activeSlide ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 hover:border-gray-300 text-gray-500"
            }`}>
            <div>슬라이드 {seg.slide_index + 1}</div>
            {seg.question_pin_seconds !== null && <div className="text-indigo-400 text-[10px]">Q&A 핀</div>}
          </button>
        ))}
      </div>

      {/* 현재 슬라이드 편집 */}
      {current && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">슬라이드 {current.slide_index + 1}</h3>
            <span className="text-xs text-gray-400">{current.start_seconds}s ~ {current.end_seconds}s</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">발화 텍스트</label>
            <textarea value={current.text} onChange={(e) => handleSegmentChange(activeSlide, "text", e.target.value)}
              rows={5} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 resize-none" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">톤</label>
              <select value={current.tone} onChange={(e) => handleSegmentChange(activeSlide, "tone", e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500">
                <option value="normal">기본</option>
                <option value="emphasis">강조</option>
                <option value="soft">부드럽게</option>
                <option value="fast">빠르게</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">시작(초)</label>
              <input type="number" value={current.start_seconds}
                onChange={(e) => handleSegmentChange(activeSlide, "start_seconds", parseInt(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">종료(초)</label>
              <input type="number" value={current.end_seconds}
                onChange={(e) => handleSegmentChange(activeSlide, "end_seconds", parseInt(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Q&A 핀 타이밍 (초, 비워두면 없음)</label>
            <input type="number" value={current.question_pin_seconds ?? ""}
              onChange={(e) => handleSegmentChange(activeSlide, "question_pin_seconds", e.target.value ? parseInt(e.target.value) : null)}
              className="w-40 border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500"
              placeholder="없음" />
          </div>
        </div>
      )}
    </div>
  );
}
