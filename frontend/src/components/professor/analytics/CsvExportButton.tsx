"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { useAnalyticsI18n } from "./useAnalyticsI18n";

/**
 * 학습자 진도 CSV 내보내기 버튼.
 *
 * 호출 endpoint: GET /api/v1/dashboard/{lecture_id}/export/csv
 * (responseType: blob — 백엔드는 utf-8-sig + Excel BOM 으로 한글 호환).
 *
 * - 다운로드 후 ObjectURL 즉시 revoke (메모리 누수 방지).
 * - 실패 시 toast + 버튼 활성 복귀.
 * - aria-busy + 로딩 텍스트로 보조기기 통보.
 */
interface CsvExportButtonProps {
  lectureId: string;
  filename?: string;
  className?: string;
}

export default function CsvExportButton({
  lectureId,
  filename,
  className,
}: CsvExportButtonProps) {
  const { t } = useAnalyticsI18n();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleExport = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(
        `/api/v1/dashboard/${lectureId}/export/csv`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        filename ?? `lecture_${lectureId}_progress.csv`,
      );
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
  }, [lectureId, filename, toast, t]);

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={loading}
      aria-busy={loading || undefined}
      aria-label={t("export.ariaLabel")}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        aria-hidden="true"
      >
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
