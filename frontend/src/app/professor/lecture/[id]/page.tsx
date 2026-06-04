"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/contexts/I18nContext";
import Modal from "@/components/ui/Modal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  PageContainer,
  PageHeader,
  Card,
  PrimaryButton,
  tabularStyle,
  hanStyle,
} from "@/components/professor/shell";

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

/**
 * /professor/lecture/[id] — 스크립트 편집기 (v2 디자인).
 *
 * 단일 슬라이드 편집 (text + tone + 시작/종료초 + Q&A pin). 본 페이지는
 * studio 3단 wizard 와 별개로 빠른 편집 진입로 — dashboard 의 "강의 편집"
 * CTA, 강의 카드의 편집 버튼이 진입한다.
 *
 * v2 재디자인:
 * - PageContainer + PageHeader + Card 구조
 * - 인디고/amber → 골드/warning 토큰
 * - 슬라이드 타임라인은 칩 형태 (활성 = gold-soft + gold-bright border)
 * - 비용·$ 표시 없음
 */
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
        const { data: videoData } = await api.get(`/api/lectures/${id}/video`);
        const { data } = await api.get(`/api/videos/${videoData.id}/script`);
        setScript(data);
        setSegments(data.segments || []);
      } catch {
        /* script not generated */
      }
      setLoading(false);
    })();
  }, [id]);

  const handleSegmentChange = (
    idx: number,
    field: keyof Segment,
    value: string | number | null,
  ) => {
    setSegments((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
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
      <PageContainer width="narrow">
        <Card padding={40} radius={18}>
          <div className="text-center">
            <div
              className="inline-grid place-items-center"
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: "var(--bg-subtle)",
                margin: "0 auto 18px",
              }}
              aria-hidden="true"
            >
              <svg
                width="32"
                height="32"
                fill="none"
                stroke="var(--text-faint)"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
              </svg>
            </div>
            <p style={{ margin: 0, color: "var(--text)", fontWeight: 600 }}>
              {t("script.noScript")}
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-subtle)" }}>
              {t("script.noScriptDesc")}
            </p>
          </div>
        </Card>
      </PageContainer>
    );
  }

  const current = segments[activeSlide];

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    border: "1px solid var(--line-strong)",
    borderRadius: 10,
    fontSize: 13.5,
    background: "var(--bg-card)",
    color: "var(--text)",
    outline: "none",
    transition: "border-color 140ms var(--ease-out)",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    marginBottom: 6,
  };

  return (
    <PageContainer>
      <PageHeader
        eyebrow="강의 편집"
        title={t("script.title")}
        subtitle={
          <>
            {t("script.slideCount", { count: segments.length })}
            {dirty && (
              <>
                {" · "}
                <span style={{ color: "var(--warning)", fontWeight: 600 }}>
                  {t("script.unsaved")}
                </span>
              </>
            )}
          </>
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => router.push(`/professor/lecture/${id}/share`)}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                color: "#fff",
                background: "var(--gold-on-light, #B88308)",
                border: "none",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              공유 · 게시
            </button>
            <button
              type="button"
              onClick={handleReset}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-muted)",
                background: "var(--bg-card)",
                border: "1px solid var(--line-strong)",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              {t("script.resetAI")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                color: "#FFFFFF",
                background: "#0A0A0A",
                border: "none",
                borderRadius: 10,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
            <PrimaryButton
              type="button"
              variant="primary"
              size="md"
              onClick={() => setShowApproveModal(true)}
            >
              {t("script.approve")}
            </PrimaryButton>
          </>
        }
      />

      {/* Slide timeline */}
      <div
        className="overflow-x-auto pb-2"
        role="tablist"
        aria-label={t("script.title")}
        style={{ display: "flex", gap: 6, marginBottom: 24 }}
      >
        {segments.map((seg, i) => {
          const isActive = i === activeSlide;
          const hasPin = seg.question_pin_seconds !== null;
          return (
            <button
              key={i}
              onClick={() => setActiveSlide(i)}
              role="tab"
              aria-selected={isActive}
              aria-label={t("script.slideLabel", { n: seg.slide_index + 1 })}
              style={{
                flexShrink: 0,
                width: 80,
                height: 56,
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 600,
                color: isActive ? "var(--gold)" : "var(--text-subtle)",
                background: isActive ? "var(--gold-soft)" : "var(--bg-card)",
                border: `1px solid ${isActive ? "var(--gold-bright)" : "var(--line)"}`,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 140ms var(--ease-out)",
                ...tabularStyle,
              }}
            >
              <div>{t("script.slideLabel", { n: seg.slide_index + 1 })}</div>
              {hasPin && (
                <div style={{ fontSize: 10, color: "var(--gold)" }}>
                  {t("script.qaPin")}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Current slide editor */}
      {current && (
        <Card padding={24} radius={16}>
          <div
            className="flex items-center justify-between"
            style={{ marginBottom: 18 }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 700,
                color: "var(--text)",
              }}
            >
              {t("script.slideLabel", { n: current.slide_index + 1 })}
            </h3>
            <div className="flex items-center gap-3">
              <span
                style={{
                  ...tabularStyle,
                  fontSize: 11.5,
                  color: "var(--text-subtle)",
                }}
              >
                {current.start_seconds}s ~ {current.end_seconds}s
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setActiveSlide(Math.max(0, activeSlide - 1))}
                  disabled={activeSlide === 0}
                  aria-label={t("common.previous")}
                  style={navIconBtn(activeSlide === 0)}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSlide(Math.min(segments.length - 1, activeSlide + 1))}
                  disabled={activeSlide === segments.length - 1}
                  aria-label={t("common.next")}
                  style={navIconBtn(activeSlide === segments.length - 1)}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="speech-text" style={labelStyle}>
                {t("script.speechText")}
              </label>
              <textarea
                id="speech-text"
                value={current.text}
                onChange={(e) => handleSegmentChange(activeSlide, "text", e.target.value)}
                rows={5}
                style={{ ...inputStyle, resize: "vertical", minHeight: 120 }}
              />
              <p
                aria-live="polite"
                style={{
                  ...tabularStyle,
                  margin: "4px 0 0",
                  fontSize: 11,
                  color: "var(--text-subtle)",
                  textAlign: "right",
                }}
              >
                {t("script.charCount", { count: current.text.length })}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="tone-select" style={labelStyle}>
                  {t("script.tone")}
                </label>
                <select
                  id="tone-select"
                  value={current.tone}
                  onChange={(e) => handleSegmentChange(activeSlide, "tone", e.target.value)}
                  style={inputStyle}
                >
                  <option value="normal">{t("script.toneNormal")}</option>
                  <option value="emphasis">{t("script.toneEmphasis")}</option>
                  <option value="soft">{t("script.toneSoft")}</option>
                  <option value="fast">{t("script.toneFast")}</option>
                </select>
              </div>
              <div>
                <label htmlFor="start-sec" style={labelStyle}>
                  {t("script.startSec")}
                </label>
                <input
                  id="start-sec"
                  type="number"
                  value={current.start_seconds}
                  min={0}
                  step={1}
                  onChange={(e) => {
                    const n = e.target.valueAsNumber;
                    handleSegmentChange(
                      activeSlide,
                      "start_seconds",
                      Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0,
                    );
                  }}
                  style={{ ...inputStyle, ...tabularStyle }}
                />
              </div>
              <div>
                <label htmlFor="end-sec" style={labelStyle}>
                  {t("script.endSec")}
                </label>
                <input
                  id="end-sec"
                  type="number"
                  value={current.end_seconds}
                  min={0}
                  step={1}
                  onChange={(e) => {
                    const n = e.target.valueAsNumber;
                    handleSegmentChange(
                      activeSlide,
                      "end_seconds",
                      Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0,
                    );
                  }}
                  style={{ ...inputStyle, ...tabularStyle }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="qa-pin" style={labelStyle}>
                {t("script.qaPinTiming")}
              </label>
              <input
                id="qa-pin"
                type="number"
                value={current.question_pin_seconds ?? ""}
                min={0}
                step={1}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (!raw) {
                    handleSegmentChange(activeSlide, "question_pin_seconds", null);
                    return;
                  }
                  const n = e.target.valueAsNumber;
                  handleSegmentChange(
                    activeSlide,
                    "question_pin_seconds",
                    Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null,
                  );
                }}
                placeholder={t("script.qaPinPlaceholder")}
                style={{ ...inputStyle, width: 160, ...tabularStyle }}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Approve modal */}
      <Modal
        open={showApproveModal}
        onClose={() => setShowApproveModal(false)}
        title={t("script.approveTitle")}
      >
        <div className="space-y-4" style={{ paddingTop: 8 }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {t("script.approveDesc")}
          </p>
          <div
            style={{
              background: "rgba(255, 182, 39, 0.06)",
              border: "1px solid rgba(255, 182, 39, 0.30)",
              borderRadius: 10,
              padding: "12px 14px",
            }}
          >
            <p style={{ margin: 0, fontSize: 13, color: "var(--gold)" }}>
              {t("script.approveWarning")}
            </p>
          </div>
          <div className="flex gap-3 justify-end" style={{ paddingTop: 8 }}>
            <button
              type="button"
              onClick={() => setShowApproveModal(false)}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text)",
                background: "var(--bg-card)",
                border: "1px solid var(--line-strong)",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              {t("common.cancel")}
            </button>
            <PrimaryButton
              type="button"
              variant="primary"
              size="md"
              onClick={handleApprove}
              disabled={approving}
            >
              {approving ? t("script.approving") : t("script.approveBtn")}
            </PrimaryButton>
          </div>
        </div>
      </Modal>

      {/* 한자 강조 SVG style 보장 — Han 단어가 페이지에 등장할 수 있다 */}
      <span aria-hidden="true" style={{ ...hanStyle, display: "none" }}>把</span>
    </PageContainer>
  );
}

function navIconBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: "1px solid var(--line)",
    background: "var(--bg-card)",
    color: disabled ? "var(--text-faint)" : "var(--text-muted)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.3 : 1,
    transition: "color 140ms var(--ease-out)",
  };
}
