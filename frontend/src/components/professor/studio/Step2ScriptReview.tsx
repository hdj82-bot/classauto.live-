"use client";

import { useEffect, useMemo, useState } from "react";
import { useStudioI18n } from "./useStudioI18n";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import type { ScriptResponse, ScriptSegment, SlideReviewStatus } from "./studioTypes";

interface Step2Props {
  // null = 아직 스크립트가 생성되지 않음 (pipeline 진행 중). 컴포넌트는 폴링 대기 화면을 보여준다.
  script: ScriptResponse | null;
  // 폴링 중 여부 (스피너 표시용).
  loading: boolean;
  // 슬라이드별 검토 상태.
  reviewByIndex: Record<number, SlideReviewStatus>;
  onReview: (slideIndex: number, status: SlideReviewStatus) => void;
  // 사용자가 직접 편집한 segments (없으면 null — script.segments 그대로 사용).
  editedSegments: ScriptSegment[] | null;
  onEditedChange: (segments: ScriptSegment[]) => void;
  // 저장 / 다음 단계 액션.
  saving: boolean;
  onSave: (segments: ScriptSegment[]) => Promise<void>;
  onResetToAi: () => Promise<void>;
  onNext: () => void;
}

/**
 * Step 2 — 스크립트 검토.
 *
 * 좌측: 슬라이드 리스트 (검토 상태 배지)
 * 중앙: 선택한 슬라이드의 인라인 diff (PPT 노트 vs AI 스크립트) + 직접 편집 textarea.
 *
 * AI 가 정보 부족으로 표시한 슬라이드(경고)는 별도 마크 — 백엔드에서 별도
 * 플래그가 내려오기 전까지는 빈 텍스트(`text.length < 20`) 휴리스틱으로 표시.
 *
 * docs/planning/05-instructor-pages.md §5.3 (1) 인라인 diff 스크립트 편집.
 */
export default function Step2ScriptReview({
  script,
  loading,
  reviewByIndex,
  onReview,
  editedSegments,
  onEditedChange,
  saving,
  onSave,
  onResetToAi,
  onNext,
}: Step2Props) {
  const { t } = useStudioI18n();
  const [activeIdx, setActiveIdx] = useState(0);
  const [dirty, setDirty] = useState(false);

  // 현재 표시되는 segment 배열 — 편집 본이 있으면 그걸, 없으면 백엔드 응답.
  const segments = useMemo<ScriptSegment[]>(
    () => editedSegments ?? script?.segments ?? [],
    [editedSegments, script],
  );

  // segments 가 처음 들어오면 첫 슬라이드를 active 로.
  useEffect(() => {
    if (activeIdx >= segments.length && segments.length > 0) {
      setActiveIdx(0);
    }
  }, [segments.length, activeIdx]);

  if (!script || loading) {
    return (
      <section className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
        <LoadingSpinner label={t("step2.waitingForScript")} />
        <p className="mt-4 text-sm text-gray-500 max-w-md mx-auto">
          {t("step2.waitingForScriptDesc")}
        </p>
      </section>
    );
  }

  if (segments.length === 0) {
    return (
      <section className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
        <p className="text-sm text-gray-500">{t("step2.slidePanelEmpty")}</p>
      </section>
    );
  }

  const current = segments[activeIdx];
  const aiOriginal =
    script.ai_segments?.find((s) => s.slide_index === current.slide_index) ??
    null;
  const reviewStatus: SlideReviewStatus =
    reviewByIndex[current.slide_index] ?? "pending";

  // AI가 정보 부족으로 판단한 슬라이드 — 백엔드 별도 플래그가 없는 동안 휴리스틱.
  // BACKEND_ASKS.STUDIO #1 참조.
  const looksInsufficient = current.text.trim().length < 20;

  const updateActiveText = (text: string) => {
    const next = segments.map((s, i) =>
      i === activeIdx ? { ...s, text } : s,
    );
    onEditedChange(next);
    setDirty(true);
    onReview(current.slide_index, "edited");
  };

  const handleAccept = () => onReview(current.slide_index, "accepted");
  const handleReject = () => onReview(current.slide_index, "rejected");
  const handleEditMode = () => {
    // 직접 편집 모드 — 단순히 review 상태만 표기, textarea 는 항상 노출.
    onReview(current.slide_index, "edited");
  };

  const handleSave = async () => {
    await onSave(segments);
    setDirty(false);
  };

  const handleReset = async () => {
    await onResetToAi();
    setDirty(false);
  };

  // 다음 단계 활성화 조건: 모든 슬라이드가 accepted/rejected/edited 중 하나.
  const allReviewed = segments.every((s) => {
    const r = reviewByIndex[s.slide_index];
    return r === "accepted" || r === "rejected" || r === "edited";
  });

  return (
    <section
      aria-labelledby="step2-title"
      className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4"
    >
      {/* 좌측 슬라이드 패널 */}
      <aside className="bg-white border border-gray-200 rounded-2xl p-3 space-y-1 max-h-[600px] overflow-y-auto">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 py-1">
          {t("step2.slidePanelTitle")}
        </h3>
        {segments.map((seg, i) => {
          const r = reviewByIndex[seg.slide_index] ?? "pending";
          const dotClass =
            r === "accepted"
              ? "bg-emerald-500"
              : r === "rejected"
                ? "bg-gray-400"
                : r === "edited"
                  ? "bg-indigo-500"
                  : seg.text.trim().length < 20
                    ? "bg-amber-500"
                    : "bg-gray-200";
          return (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIdx(i)}
              aria-current={i === activeIdx ? "true" : undefined}
              className={`w-full flex items-center gap-2 text-left px-2 py-2 rounded-lg text-xs transition ${
                i === activeIdx
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`}
                aria-hidden="true"
              />
              <span className="flex-1 truncate">
                Slide {seg.slide_index + 1}
              </span>
              <span className="text-[10px] text-gray-400 tabular-nums">
                {seg.text.length}
              </span>
            </button>
          );
        })}
      </aside>

      {/* 중앙 작업 영역 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h2 id="step2-title" className="text-lg font-bold text-gray-900">
              {t("step2.title")}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Slide {current.slide_index + 1} ·{" "}
              <span className="tabular-nums">
                {current.start_seconds}s – {current.end_seconds}s
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleReset}
              className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition"
            >
              {t("step2.actions.resetToAi")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="text-xs bg-gray-900 text-white rounded-lg px-3 py-1.5 hover:bg-gray-800 disabled:opacity-40 transition"
            >
              {saving ? t("step2.saving") : t("step2.save")}
            </button>
          </div>
        </header>

        {looksInsufficient && (
          <div
            role="status"
            className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 mb-4 flex items-start gap-2"
          >
            <svg
              viewBox="0 0 16 16"
              className="w-3.5 h-3.5 mt-px flex-shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M8 2v6m0 3v.01" strokeLinecap="round" />
              <circle cx="8" cy="8" r="7" />
            </svg>
            <span>{t("step2.warningInsufficient")}</span>
          </div>
        )}

        {/* 인라인 diff: 원본 PPT 노트 vs AI 스크립트 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
              {t("step2.originalNotesTitle")}
            </h4>
            <p className="text-xs text-gray-700 whitespace-pre-line min-h-[80px]">
              {aiOriginal?.text || t("step2.originalNotesEmpty")}
            </p>
          </div>
          <div className="bg-indigo-50/40 border border-indigo-100 rounded-lg p-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600 mb-1.5">
              {t("step2.aiScriptTitle")}
            </h4>
            <textarea
              value={current.text}
              onChange={(e) => updateActiveText(e.target.value)}
              rows={5}
              className="w-full bg-transparent text-xs text-gray-900 outline-none resize-none"
              aria-label={t("step2.aiScriptTitle")}
            />
            <p
              className="text-[10px] text-gray-400 text-right mt-1 tabular-nums"
              aria-live="polite"
            >
              {t("step2.aiScriptCharCount", { count: current.text.length })}
            </p>
          </div>
        </div>

        {/* 슬라이드별 액션 */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleAccept}
            aria-pressed={reviewStatus === "accepted"}
            className={`text-xs rounded-lg px-3 py-1.5 font-medium transition ${
              reviewStatus === "accepted"
                ? "bg-emerald-600 text-white"
                : "border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            }`}
          >
            {t("step2.actions.accept")}
          </button>
          <button
            type="button"
            onClick={handleReject}
            aria-pressed={reviewStatus === "rejected"}
            className={`text-xs rounded-lg px-3 py-1.5 font-medium transition ${
              reviewStatus === "rejected"
                ? "bg-gray-700 text-white"
                : "border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t("step2.actions.reject")}
          </button>
          <button
            type="button"
            onClick={handleEditMode}
            aria-pressed={reviewStatus === "edited"}
            className={`text-xs rounded-lg px-3 py-1.5 font-medium transition ${
              reviewStatus === "edited"
                ? "bg-indigo-600 text-white"
                : "border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            }`}
          >
            {t("step2.actions.edit")}
          </button>
        </div>

        {dirty && (
          <p className="mt-3 text-[11px] text-amber-600 font-medium">
            {t("step2.unsavedNotice")}
          </p>
        )}

        {/* 슬라이드 네비게이션 + 다음 단계 */}
        <footer className="mt-6 flex items-center justify-between">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setActiveIdx(Math.max(0, activeIdx - 1))}
              disabled={activeIdx === 0}
              aria-label="이전 슬라이드"
              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-30 transition"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() =>
                setActiveIdx(Math.min(segments.length - 1, activeIdx + 1))
              }
              disabled={activeIdx === segments.length - 1}
              aria-label="다음 슬라이드"
              className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-30 transition"
            >
              ›
            </button>
          </div>
          <button
            type="button"
            onClick={onNext}
            disabled={!allReviewed}
            className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-5 py-2.5 font-semibold transition"
          >
            {t("step2.next")}
          </button>
        </footer>
      </div>
    </section>
  );
}
