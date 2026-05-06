"use client";

import {
  ONBOARDING_STEPS,
  type OnboardingProgress,
  type OnboardingStepId,
} from "./onboardingSteps";
import { useProfessorI18n } from "./useProfessorI18n";

interface Props {
  progress: OnboardingProgress;
  /** 단계 CTA 클릭 — 부모(EmptyDashboard 등) 가 라우팅/모달 열기 처리 */
  onStepAction: (stepId: OnboardingStepId) => void;
  /** 모든 단계 완료 시 노출되는 "분석 리포트 보기" CTA */
  onAllComplete?: () => void;
}

/**
 * 5단계 가이드 체크리스트.
 *
 * 기획: docs/planning/05-instructor-pages.md §3.3.
 * 디자인: 교수자 화면 라이트 베이스 + 골드 포인트, 의미적 컬러(녹색=완료) 허용.
 */
export default function OnboardingChecklist({
  progress,
  onStepAction,
  onAllComplete,
}: Props) {
  const { t } = useProfessorI18n();
  const { done, nextStep, doneCount, totalCount } = progress;
  const allDone = nextStep === null;
  const percent = Math.round((doneCount / totalCount) * 100);

  return (
    <section
      data-testid="professor-onboarding-checklist"
      aria-labelledby="professor-checklist-heading"
      className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h2
            id="professor-checklist-heading"
            className="text-lg font-semibold text-gray-900"
          >
            {t("checklistTitle")}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {t("checklistSubtitle")}
          </p>
        </div>
        <span
          className="shrink-0 text-xs font-medium text-gray-600 tabular-nums"
          data-testid="professor-checklist-progress"
        >
          {t("progressLabel", { done: doneCount, total: totalCount })}
        </span>
      </div>

      {/* 진행도 바 — Pretendard tabular-nums + 골드 채움 (animation.md §4.3 progress shimmer 톤) */}
      <div
        className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mb-6"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("progressLabel", { done: doneCount, total: totalCount })}
      >
        <div
          className="h-full bg-gradient-to-r from-amber-400 to-amber-500 transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="space-y-3">
        {ONBOARDING_STEPS.map((step, idx) => {
          const isDone = done[step.id];
          const isActive = nextStep === step.id;
          const titleKey = `${step.i18nKeyPrefix}.title`;
          const descKey = `${step.i18nKeyPrefix}.desc`;
          const ctaKey = `${step.i18nKeyPrefix}.cta`;
          return (
            <li
              key={step.id}
              data-testid={`professor-onboarding-step-${step.id}`}
              data-status={isDone ? "done" : isActive ? "active" : "pending"}
              className={[
                "flex items-start gap-4 rounded-xl border p-4 transition-colors",
                isDone
                  ? "border-emerald-200 bg-emerald-50/60"
                  : isActive
                    ? "border-amber-300 bg-amber-50/70 shadow-sm"
                    : "border-gray-200 bg-white",
              ].join(" ")}
            >
              <div
                aria-hidden="true"
                className={[
                  "shrink-0 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold tabular-nums",
                  isDone
                    ? "bg-emerald-500 text-white"
                    : isActive
                      ? "bg-amber-500 text-white"
                      : "bg-gray-100 text-gray-500",
                ].join(" ")}
              >
                {isDone ? "✓" : idx + 1}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3
                    className={[
                      "text-sm font-semibold",
                      isDone ? "text-gray-500 line-through" : "text-gray-900",
                    ].join(" ")}
                  >
                    {t(titleKey)}
                  </h3>
                  {isDone ? (
                    <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-emerald-700">
                      {t("stepStatusDone")}
                    </span>
                  ) : isActive ? (
                    <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-amber-700">
                      {t("stepStatusActive")}
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-[0.14em] font-medium text-gray-400">
                      {t("stepStatusPending")}
                    </span>
                  )}
                </div>
                {!isDone && (
                  <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                    {t(descKey)}
                  </p>
                )}
              </div>

              {!isDone && (
                <button
                  type="button"
                  onClick={() => onStepAction(step.id)}
                  data-testid={`professor-onboarding-cta-${step.id}`}
                  className={[
                    "shrink-0 self-center text-xs font-medium rounded-lg px-3 py-2 transition",
                    isActive
                      ? "bg-amber-500 hover:bg-amber-600 text-white shadow-sm"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-700",
                  ].join(" ")}
                >
                  {t(ctaKey)}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {allDone && (
        <div
          data-testid="professor-onboarding-complete"
          className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 flex items-center justify-between gap-4"
        >
          <p className="text-sm text-emerald-800">{t("checklistComplete")}</p>
          {onAllComplete && (
            <button
              type="button"
              onClick={onAllComplete}
              className="shrink-0 text-xs font-medium rounded-lg px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white transition"
            >
              {t("checklistCompleteCta")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
