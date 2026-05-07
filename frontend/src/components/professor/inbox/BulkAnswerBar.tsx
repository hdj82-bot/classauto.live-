"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useInboxI18n } from "./useInboxI18n";
import type { InboxBulkConfirmResult, InboxItem } from "./inboxTypes";

interface Props {
  selectedItems: InboxItem[];
  onConfirm: () => Promise<InboxBulkConfirmResult>;
  onMarkReviewed: () => Promise<InboxBulkConfirmResult>;
  onClear: () => void;
}

/**
 * 인박스 하단 sticky 바 — 일괄 처리.
 *
 * 기획상 핵심 일괄 행위는 "선택한 RAG 초안 모두 확정 + 학생에게 전송".
 * out-of-scope 항목은 RAG 초안이 없으므로 백엔드/클라이언트 모두에서 자동
 * skip 처리됨. 본 바는 활성 시에만 렌더되어 시야를 가리지 않는다.
 */
export default function BulkAnswerBar({
  selectedItems,
  onConfirm,
  onMarkReviewed,
  onClear,
}: Props) {
  const { t } = useInboxI18n();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState<"confirm" | "review" | null>(
    null,
  );

  if (selectedItems.length === 0) return null;

  const eligibleCount = selectedItems.filter((it) => it.aiDraft && it.inScope)
    .length;

  const announceResult = (
    res: InboxBulkConfirmResult,
    successCount: number,
  ) => {
    if (res.deferred) {
      toast(t("bulk.bulkDeferred", { count: successCount }), "info");
      return;
    }
    if (res.failedIds.length === 0) {
      toast(t("bulk.bulkSuccess", { count: res.successIds.length }), "success");
    } else {
      toast(
        t("bulk.bulkPartial", {
          success: res.successIds.length,
          failed: res.failedIds.length,
        }),
        "warning",
      );
    }
  };

  const handleConfirm = async () => {
    setSubmitting("confirm");
    setConfirmOpen(false);
    try {
      const res = await onConfirm();
      announceResult(res, eligibleCount);
    } catch {
      toast(t("composer.errorBackend"), "error");
    } finally {
      setSubmitting(null);
    }
  };

  const handleMarkReviewed = async () => {
    setSubmitting("review");
    try {
      const res = await onMarkReviewed();
      announceResult(res, selectedItems.length);
    } catch {
      toast(t("composer.errorBackend"), "error");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <>
      <div
        data-testid="inbox-bulk-bar"
        role="region"
        aria-label={t("bulk.barLabel")}
        className="sticky bottom-4 z-10 mt-4 mx-auto bg-white shadow-lg border border-gray-200 rounded-2xl px-4 py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3"
      >
        <span
          className="text-sm font-semibold text-gray-900 sm:flex-none"
          data-testid="inbox-bulk-count"
        >
          {t("bulk.selected", { count: selectedItems.length })}
        </span>
        <span className="hidden sm:inline-block w-px h-5 bg-gray-200" aria-hidden="true" />
        <p
          className="text-xs text-gray-500 sm:flex-1 leading-snug"
          data-testid="inbox-bulk-hint"
        >
          {t("bulk.confirmAllAiHint")}
        </p>
        <div className="flex items-center gap-2 sm:flex-none">
          <button
            type="button"
            onClick={onClear}
            data-testid="inbox-bulk-clear"
            className="text-xs font-medium text-gray-500 hover:text-gray-800 transition motion-reduce:transition-none px-2 py-1.5"
          >
            {t("bulk.cancelSelection")}
          </button>
          <button
            type="button"
            data-testid="inbox-bulk-mark-reviewed"
            disabled={submitting !== null}
            onClick={handleMarkReviewed}
            className="text-xs font-medium rounded-lg px-3 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 transition motion-reduce:transition-none"
          >
            {submitting === "review"
              ? t("bulk.bulkSubmitting")
              : t("bulk.markReviewed")}
          </button>
          <button
            type="button"
            data-testid="inbox-bulk-confirm"
            disabled={submitting !== null || eligibleCount === 0}
            onClick={() => setConfirmOpen(true)}
            className="text-xs font-semibold rounded-lg px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white shadow-sm transition motion-reduce:transition-none"
          >
            {submitting === "confirm"
              ? t("bulk.bulkSubmitting")
              : t("bulk.confirmAllAi")}
          </button>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("bulk.confirmTitle")}
        closable
      >
        <div data-testid="inbox-bulk-confirm-modal" className="space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            {t("bulk.confirmDesc")}
          </p>
          <ul className="text-xs text-gray-500 list-disc pl-5 space-y-0.5 max-h-40 overflow-y-auto">
            {selectedItems.slice(0, 6).map((it) => (
              <li key={it.id} className="truncate">
                {it.question}
              </li>
            ))}
            {selectedItems.length > 6 && (
              <li className="text-gray-400">…</li>
            )}
          </ul>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="flex-1 rounded-xl border border-gray-200 hover:bg-gray-50 text-sm font-medium text-gray-700 px-4 py-2.5 transition motion-reduce:transition-none"
            >
              {t("bulk.confirmNo")}
            </button>
            <button
              type="button"
              data-testid="inbox-bulk-confirm-yes"
              onClick={handleConfirm}
              className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2.5 shadow-sm transition motion-reduce:transition-none"
            >
              {t("bulk.confirmYes")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
