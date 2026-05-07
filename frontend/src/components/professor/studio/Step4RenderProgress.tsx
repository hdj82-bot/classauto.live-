"use client";

import { useStudioI18n } from "./useStudioI18n";
import Modal from "@/components/ui/Modal";
import type { RenderStatus } from "./studioTypes";

interface Step4Props {
  // 승인 여부 — 아직 승인 전이면 모달로 확인.
  approved: boolean;
  approving: boolean;
  approveModalOpen: boolean;
  onOpenApproveModal: () => void;
  onCloseApproveModal: () => void;
  onConfirmApprove: () => Promise<void>;
  estimateMinutes: number; // 예상 소요 분
  // 진행 중 폴링 결과.
  renderStatus: RenderStatus | null;
  emailNotify: boolean;
  onChangeEmailNotify: (on: boolean) => void;
  onComplete: () => void;
  // 일부 슬라이드만 실패 시 재시도 액션.
  onRetryFailed?: () => Promise<void>;
}

/**
 * Step 4 — 승인 + 렌더 진행.
 *
 * 4단계 페이즈:
 *   1. 스크립트 검토 완료 (즉시)
 *   2. TTS 음성 생성
 *   3. AI 아바타 영상 합성
 *   4. 최종 인코딩
 *
 * 실제 백엔드 폴링은 슬라이드별 status 만 내려주므로(`pending → queued →
 * rendering → ready/failed`), 페이즈는 진행률·실패 여부 기반 휴리스틱.
 */
export default function Step4RenderProgress({
  approved,
  approving,
  approveModalOpen,
  onOpenApproveModal,
  onCloseApproveModal,
  onConfirmApprove,
  estimateMinutes,
  renderStatus,
  emailNotify,
  onChangeEmailNotify,
  onComplete,
  onRetryFailed,
}: Step4Props) {
  const { t } = useStudioI18n();

  // 진행 단계 추정.
  // - 승인 전: phase 1 (스크립트 검토 완료) 만 표시
  // - 승인 후 렌더 시작 전: phase 2 시작
  // - 일부 ready: phase 3
  // - 모두 ready: phase 4
  const total = renderStatus?.total ?? 0;
  const completed = renderStatus?.completed ?? 0;
  const failed = renderStatus?.failed ?? 0;
  const allDone = total > 0 && completed + failed === total;
  const anyReady = completed > 0;

  const currentPhase: 1 | 2 | 3 | 4 = !approved
    ? 1
    : !renderStatus
      ? 2
      : anyReady && !allDone
        ? 3
        : allDone
          ? 4
          : 2;

  return (
    <section
      aria-labelledby="step4-title"
      className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8"
    >
      <header className="mb-6">
        <h2 id="step4-title" className="text-lg font-bold text-gray-900">
          {t("step4.title")}
        </h2>
        <p className="mt-1 text-sm text-gray-500">{t("step4.subtitle")}</p>
      </header>

      {!approved && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={onOpenApproveModal}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 text-sm font-semibold transition"
          >
            {t("step4.approveTitle")}
          </button>
        </div>
      )}

      {approved && (
        <div className="space-y-5">
          <h3 className="text-sm font-semibold text-gray-900">
            {t("step4.progressTitle")}
          </h3>

          <ol className="space-y-3">
            {[1, 2, 3, 4].map((phase) => {
              const isCurrent = phase === currentPhase;
              const isDone = phase < currentPhase || (phase === 4 && allDone);
              return (
                <li
                  key={phase}
                  className={`flex items-start gap-3 px-3 py-2 rounded-xl ${
                    isCurrent ? "bg-indigo-50" : ""
                  }`}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold ${
                      isDone
                        ? "bg-emerald-500 text-white"
                        : isCurrent
                          ? "bg-indigo-600 text-white motion-safe:animate-pulse"
                          : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {isDone ? "✓" : phase}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm ${
                        isCurrent
                          ? "font-semibold text-indigo-700"
                          : "text-gray-700"
                      }`}
                    >
                      {t(`step4.phase${phase}`)}
                    </p>
                    {isCurrent && phase >= 2 && total > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5 tabular-nums">
                        {t("step4.phaseProgress", {
                          current: completed,
                          total,
                        })}
                      </p>
                    )}
                    {isCurrent && phase >= 2 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t("step4.phaseEta", { minutes: estimateMinutes })}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {/* 진행 바 — 전체 슬라이드 중 ready 비율 */}
          {total > 0 && (
            <div
              role="progressbar"
              aria-valuenow={Math.round((completed / total) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2 rounded-full bg-gray-100 overflow-hidden"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600 transition-[width] duration-500 ease-out"
                style={{ width: `${(completed / total) * 100}%` }}
              />
            </div>
          )}

          {/* 이메일 알림 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={emailNotify}
              onChange={(e) => onChangeEmailNotify(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">
              {t("step4.emailNotifyToggle")}
            </span>
          </label>
          <p className="text-xs text-gray-400 -mt-3">
            {t("step4.progressBackgroundHint")}
          </p>

          {/* 일부 실패 시 재시도 */}
          {failed > 0 && (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 rounded-xl px-4 py-3"
            >
              <p className="text-sm font-medium text-red-800">
                {t("step4.errorTitle")}
              </p>
              <p className="text-xs text-red-700 mt-1 tabular-nums">
                {t("step4.errorBody")} ({failed} / {total})
              </p>
              {onRetryFailed && (
                <button
                  type="button"
                  onClick={onRetryFailed}
                  className="mt-2 text-xs font-semibold text-red-800 underline underline-offset-2 hover:no-underline"
                >
                  {t("step4.retryFailed")}
                </button>
              )}
            </div>
          )}

          {/* 모든 슬라이드 ready → 다음 단계 */}
          {allDone && failed === 0 && (
            <button
              type="button"
              onClick={onComplete}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 text-sm font-semibold transition"
            >
              {t("step4.viewResult")}
            </button>
          )}
        </div>
      )}

      {/* 승인 확인 모달 */}
      <Modal
        open={approveModalOpen}
        onClose={onCloseApproveModal}
        title={t("step4.approveTitle")}
      >
        <div className="space-y-4 pt-2">
          <p className="text-sm text-gray-600">
            {t("step4.approveBody", { minutes: estimateMinutes })}
          </p>
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onCloseApproveModal}
              className="text-sm border border-gray-300 rounded-xl px-4 py-2 hover:bg-gray-50 transition"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={onConfirmApprove}
              disabled={approving}
              className="text-sm bg-indigo-600 text-white rounded-xl px-4 py-2 hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {approving ? t("step4.approving") : t("step4.approveConfirm")}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
