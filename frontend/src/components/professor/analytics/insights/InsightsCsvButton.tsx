"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { useInsightsI18n } from "./useInsightsI18n";

/**
 * 보고서 CSV 내보내기 — GET /api/v1/insights/{lecture_id}/report.csv
 * (responseType: blob, 백엔드 utf-8-sig + BOM). CsvExportButton 과 동일 패턴.
 */
export default function InsightsCsvButton({ lectureId }: { lectureId: string }) {
  const { t } = useInsightsI18n();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleExport = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/api/v1/insights/${lectureId}/report.csv`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `insights_report_${lectureId}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast(t("export.success"), "success");
    } catch {
      toast(t("export.error"), "error");
    } finally {
      setLoading(false);
    }
  }, [lectureId, toast, t]);

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={loading}
      aria-busy={loading || undefined}
      aria-label={t("export.ariaLabel")}
      className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
        />
      </svg>
      {loading ? t("export.loading") : t("export.label")}
    </button>
  );
}
