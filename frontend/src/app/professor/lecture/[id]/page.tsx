"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/contexts/I18nContext";
import Modal from "@/components/ui/Modal";
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
  const { toast } = useToast();
  const { t } = useI18n();

  const [script, setScript] = useState<ScriptData | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approving, setApproving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/videos/${id}/script`);
        setScript(data);
        setSegments(data.segments || []);
      } catch { /* script not generated */ }
      setLoading(false);
    })();
  }, [id]);

  const handleSegmentChange = (idx: number, field: keyof Segment, value: string | number | null) => {
    setSegments((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!script) return;
    setSaving(true);
    try {
      await api.patch(`/api/videos/${script.video_id}/script`, { segments });
      setDirty(false);
      toast(t("script.saveSuccess"), "success");
    } catch {
      toast(t("script.saveError"), "error");
    }
    setSaving(false);
  };

  const handleApprove = async () => {
    if (!script) return;
    setApproving(true);
    try {
      if (dirty) {
        await api.patch(`/api/videos/${script.video_id}/script`, { segments });
        setDirty(false);
      }
      await api.post(`/api/videos/${script.video_id}/approve`);
      toast(t("script.approveSuccess"), "success");
      router.push("/professor/dashboard");
    } catch {
      toast(t("script.approveError"), "error");
    }
    setApproving(false);
    setShowApproveModal(false);
  };

  const handleReset = async () => {
    if (!script) return;
    try {
      const { data } = await api.post(`/api/videos/${script.video_id}/script/reset`);
      setSegments(data.segments || []);
      setDirty(true);
      toast(t("script.resetSuccess"), "info");
    } catch {
      toast(t("script.resetError"), "error");
    }
  };

  if (loading) return <LoadingSpinner fullScreen label={t("script.loadingScript")} />;

  if (!script || segments.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center" aria-hidden="true">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <p className="text-gray-700 font-medium mb-1">{t("script.noScript")}</p>
        <p className="text-sm text-gray-400">{t("script.noScriptDesc")}</p>
      </div>
    );
  }

  const current = segments[activeSlide];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t("script.title")}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {t("script.slideCount", { count: segments.length })} {dirty && <span className="text-amber-500 font-medium">- {t("script.unsaved")}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleReset} className="text-sm border border-gray-300 rounded-xl px-4 py-2 hover:bg-gray-50 transition">
            {t("script.resetAI")}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="text-sm bg-gray-900 text-white rounded-xl px-4 py-2 hover:bg-gray-800 disabled:opacity-50 transition">
            {saving ? t("common.saving") : t("common.save")}
          </button>
          <button onClick={() => setShowApproveModal(true)}
            className="text-sm bg-indigo-600 text-white rounded-xl px-4 py-2 hover:bg-indigo-700 transition">
            {t("script.approve")}
          </button>
        </div>
      </div>

      {/* Slide timeline */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-2" role="tablist" aria-label={t("script.title")}>
        {segments.map((seg, i) => (
          <button key={i} onClick={() => setActiveSlide(i)}
            role="tab"
            aria-selected={i === activeSlide}
            aria-label={t("script.slideLabel", { n: seg.slide_index + 1 })}
            className={`flex-shrink-0 w-20 h-14 rounded-lg border text-xs font-medium transition ${
              i === activeSlide ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 hover:border-gray-300 text-gray-500"
            }`}>
            <div>{t("script.slideLabel", { n: seg.slide_index + 1 })}</div>
            {seg.question_pin_seconds !== null && <div className="text-indigo-400 text-[10px]">{t("script.qaPin")}</div>}
          </button>
        ))}
      </div>

      {/* Current slide editor */}
      {current && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4" role="tabpanel">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">{t("script.slideLabel", { n: current.slide_index + 1 })}</h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{current.start_seconds}s ~ {current.end_seconds}s</span>
              <div className="flex gap-1">
                <button onClick={() => setActiveSlide(Math.max(0, activeSlide - 1))} disabled={activeSlide === 0}
                  aria-label={t("common.previous")}
                  className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-30 transition">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <button onClick={() => setActiveSlide(Math.min(segments.length - 1, activeSlide + 1))} disabled={activeSlide === segments.length - 1}
                  aria-label={t("common.next")}
                  className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-30 transition">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="speech-text" className="block text-sm font-medium text-gray-700 mb-1">{t("script.speechText")}</label>
            <textarea id="speech-text" value={current.text} onChange={(e) => handleSegmentChange(activeSlide, "text", e.target.value)}
              rows={5} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none" />
            <p className="text-xs text-gray-400 mt-1 text-right" aria-live="polite">{t("script.charCount", { count: current.text.length })}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="tone-select" className="block text-sm font-medium text-gray-700 mb-1">{t("script.tone")}</label>
              <select id="tone-select" value={current.tone} onChange={(e) => handleSegmentChange(activeSlide, "tone", e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500">
                <option value="normal">{t("script.toneNormal")}</option>
                <option value="emphasis">{t("script.toneEmphasis")}</option>
                <option value="soft">{t("script.toneSoft")}</option>
                <option value="fast">{t("script.toneFast")}</option>
              </select>
            </div>
            <div>
              <label htmlFor="start-sec" className="block text-sm font-medium text-gray-700 mb-1">{t("script.startSec")}</label>
              <input id="start-sec" type="number" value={current.start_seconds}
                onChange={(e) => handleSegmentChange(activeSlide, "start_seconds", parseInt(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label htmlFor="end-sec" className="block text-sm font-medium text-gray-700 mb-1">{t("script.endSec")}</label>
              <input id="end-sec" type="number" value={current.end_seconds}
                onChange={(e) => handleSegmentChange(activeSlide, "end_seconds", parseInt(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            </div>
          </div>

          <div>
            <label htmlFor="qa-pin" className="block text-sm font-medium text-gray-700 mb-1">{t("script.qaPinTiming")}</label>
            <input id="qa-pin" type="number" value={current.question_pin_seconds ?? ""}
              onChange={(e) => handleSegmentChange(activeSlide, "question_pin_seconds", e.target.value ? parseInt(e.target.value) : null)}
              className="w-40 border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500"
              placeholder={t("script.qaPinPlaceholder")} />
          </div>
        </div>
      )}

      {/* Approve modal */}
      <Modal open={showApproveModal} onClose={() => setShowApproveModal(false)} title={t("script.approveTitle")}>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-gray-600">{t("script.approveDesc")}</p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-sm text-amber-700">{t("script.approveWarning")}</p>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setShowApproveModal(false)}
              className="text-sm border border-gray-300 rounded-xl px-4 py-2 hover:bg-gray-50 transition">
              {t("common.cancel")}
            </button>
            <button onClick={handleApprove} disabled={approving}
              className="text-sm bg-indigo-600 text-white rounded-xl px-4 py-2 hover:bg-indigo-700 disabled:opacity-50 transition">
              {approving ? t("script.approving") : t("script.approveBtn")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
