"use client";

import { useLearnersI18n } from "./useLearnersI18n";

interface Props {
  selectedCount: number;
  /** 선택 항목 CSV 다운로드 (프론트단에서 즉시 가능) */
  onExportSelected: () => void;
  /** 백엔드 endpoint 미흡 — 클릭 시 toast/inline 안내. */
  onSendNudge: () => void;
  onSendEncouragement: () => void;
}

/**
 * 선택된 학습자에 대한 일괄 작업 패널.
 *
 * - **일괄 메일·푸시 발송** 은 BACKEND_ASKS.LEARNERS.md §3 (`POST
 *   /api/v1/learners/notify`) 가 머지되기 전까지 비활성화 상태로 노출 —
 *   기획서 (docs/planning/05-instructor-pages.md §8.3 "알림 발송") 에서 약속한
 *   액션이라 UI 슬롯은 미리 잡아두지만, 동작은 toast 로 안내한다.
 * - **CSV 내보내기** 는 backend 호출 없이 프론트에서 즉시 가능 → 활성.
 *
 * 정책 — 광고/외부 공유 UI 는 **여기서도 절대 만들지 않는다**. 일괄 발송도
 * 학습 활동(시청 독려/격려)에 한정된다.
 */
export default function BulkActions({
  selectedCount,
  onExportSelected,
  onSendNudge,
  onSendEncouragement,
}: Props) {
  const { t } = useLearnersI18n();
  const disabled = selectedCount === 0;
  return (
    <section
      data-testid="learners-bulk-actions"
      data-selected-count={selectedCount}
      className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"
      aria-labelledby="learners-bulk-heading"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <div>
          <h3
            id="learners-bulk-heading"
            className="text-sm font-semibold text-gray-900"
          >
            {t("bulkTitle")}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {disabled ? t("bulkPickPrompt") : `${selectedCount} ${t("selectionLabel")}`}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="learners-bulk-nudge"
          disabled={disabled}
          onClick={onSendNudge}
          className="inline-flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition"
        >
          {t("bulkSendNudge")}
          <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-600">
            {t("bulkBackendPendingShort")}
          </span>
        </button>
        <button
          type="button"
          data-testid="learners-bulk-encourage"
          disabled={disabled}
          onClick={onSendEncouragement}
          className="inline-flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition"
        >
          {t("bulkSendEncouragement")}
          <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-600">
            {t("bulkBackendPendingShort")}
          </span>
        </button>
        <button
          type="button"
          data-testid="learners-bulk-export"
          disabled={disabled}
          onClick={onExportSelected}
          className="inline-flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed transition"
        >
          {t("bulkExportSelected")}
        </button>
      </div>
    </section>
  );
}
