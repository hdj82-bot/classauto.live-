"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { useInboxI18n } from "./useInboxI18n";
import { inboxApi } from "./inboxApi";

interface Props {
  /** "all" 또는 현재 활성 강의의 courseId. */
  courseId: string;
  /** 활성 강의 제목 — courseId === "all" 이면 무시. */
  courseTitle?: string;
}

/**
 * "전체 리포트 다운로드" 카드 — 강의 단위/전체 단위 CSV 다운로드.
 *
 * 백엔드는 `GET /api/v1/qa/export?format=csv[&course_id=...]` 를 제공.
 * 다운로드 실패 시 토스트로만 알리고 페이지 상태는 그대로 둡니다.
 */
export default function ReportDownloadCard({ courseId, courseTitle }: Props) {
  const { t } = useInboxI18n();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const scopeAll = courseId === "all";
  const hint = scopeAll
    ? t("report.scopeHintAll")
    : t("report.scopeHintCurrent", { course: courseTitle ?? "" });

  const handleDownload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await inboxApi.downloadReport(scopeAll ? "all" : { courseId });
      toast(t("report.successToast"), "success");
    } catch {
      toast(t("report.errorToast"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      data-testid="inbox-report-card"
      aria-label={t("report.title")}
      className="bg-white border border-amber-200 rounded-2xl p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">
            {t("report.title")}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            {t("report.description")}
          </p>
          <p
            data-testid="inbox-report-scope-hint"
            className="text-[11px] text-amber-800 mt-1.5 leading-relaxed"
          >
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 ring-1 ring-amber-200 px-2 py-0.5 mr-1 font-medium">
              {scopeAll ? t("report.scopeAll") : t("report.scopeCurrent")}
            </span>
            {hint}
          </p>
        </div>
        <button
          type="button"
          data-testid="inbox-report-download"
          onClick={handleDownload}
          disabled={busy}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 shadow-sm transition motion-reduce:transition-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
          {busy ? t("report.downloading") : t("report.downloadCsv")}
        </button>
      </div>
    </section>
  );
}
