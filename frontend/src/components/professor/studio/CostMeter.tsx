"use client";

import { useState } from "react";
import { useStudioI18n } from "./useStudioI18n";
import type { CostBreakdown, PlanUsage, TtsProvider } from "./studioTypes";
import { evaluatePlanUsage } from "./guardrails";
import { TTS_RATES, HEYGEN_PER_SECOND_USD } from "./costEstimator";

interface CostMeterProps {
  estimate: CostBreakdown;
  usage: PlanUsage;
  ttsProvider: TtsProvider;
}

/**
 * 비용 미터 — Step3 우측 패널.
 *
 * docs/design-system/animations.md §4.6 의 그라데이션 진행 바 + 80% 펄스 경고.
 * docs/planning/05-instructor-pages.md §5.3 (2) 의 실시간 비용 미터.
 *
 * `prefers-reduced-motion` 시 펄스·트랜지션 자동 비활성 (글로벌 CSS 가 처리).
 */
export default function CostMeter({
  estimate,
  usage,
  ttsProvider,
}: CostMeterProps) {
  const { t } = useStudioI18n();
  const [open, setOpen] = useState(false);

  const decision = evaluatePlanUsage(usage, estimate);

  // 무제한 (limit=0) 인 경우 진행 바 자체를 숨기고 비용 합계만 표시.
  const unlimited = !usage.limit || usage.limit <= 0;
  const displayRatio = unlimited
    ? 0
    : Math.min(1, decision.ratioWithEstimate ?? decision.ratio);

  return (
    <section
      aria-labelledby="cost-meter-title"
      className="bg-white border border-gray-200 rounded-2xl p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <h3
          id="cost-meter-title"
          className="text-sm font-semibold text-gray-900"
        >
          {t("costMeter.title")}
        </h3>
        <span
          aria-hidden="true"
          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-50"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4"
            fill="none"
            stroke="url(#grad-electric-cost)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <defs>
              <linearGradient id="grad-electric-cost" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#FFB627" />
                <stop offset="100%" stopColor="#F59E0B" />
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
      </div>

      <ul className="text-sm space-y-2 tabular-nums">
        <li className="flex items-center justify-between text-gray-600">
          <span>{t("costMeter.ttsLabel")}</span>
          <span>${estimate.ttsCost.toFixed(2)}</span>
        </li>
        <li className="flex items-center justify-between text-gray-600">
          <span>{t("costMeter.avatarLabel")}</span>
          <span>${estimate.avatarCost.toFixed(2)}</span>
        </li>
        <li className="flex items-center justify-between pt-2 mt-1 border-t border-gray-100 font-semibold text-gray-900">
          <span>{t("costMeter.totalLabel")}</span>
          <span>${estimate.total.toFixed(2)}</span>
        </li>
      </ul>

      {!unlimited && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5 tabular-nums">
            <span>
              {t("costMeter.ofLimit", {
                used: usage.used.toFixed(2),
                limit: usage.limit.toFixed(0),
              })}
            </span>
            <span aria-hidden="true">{Math.round(displayRatio * 100)}%</span>
          </div>
          <div
            className="h-2 rounded-full bg-gray-100 overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(displayRatio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("costMeter.title")}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                decision.block
                  ? "bg-gradient-to-r from-red-500 to-red-600 motion-safe:animate-pulse"
                  : decision.warn
                    ? "bg-gradient-to-r from-amber-400 to-orange-500 motion-safe:animate-pulse"
                    : "bg-gradient-to-r from-emerald-400 to-amber-400"
              }`}
              style={{ width: `${displayRatio * 100}%` }}
            />
          </div>

          {decision.block && (
            <p
              role="alert"
              className="mt-2 text-xs font-medium text-red-700 flex items-start gap-1.5"
            >
              <svg
                className="w-3.5 h-3.5 mt-px flex-shrink-0"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="8" cy="8" r="7" />
                <path d="M8 5v3.5M8 11v.01" strokeLinecap="round" />
              </svg>
              {t("costMeter.warningExceeded")}
            </p>
          )}
          {!decision.block && decision.warn && (
            <p className="mt-2 text-xs font-medium text-amber-700">
              {t("costMeter.warningHigh")}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-4 text-xs text-indigo-600 hover:text-indigo-700 font-medium transition"
      >
        {open ? t("costMeter.detailsClose") : t("costMeter.details")}
      </button>

      {open && (
        <dl className="mt-3 text-xs text-gray-500 space-y-1 tabular-nums">
          <div className="flex justify-between">
            <dt>{t("costMeter.ttsChars", { count: estimate.ttsChars })}</dt>
            <dd>
              {t("costMeter.perChar", {
                rate: TTS_RATES[ttsProvider]?.toFixed(5) ?? "0",
              })}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>
              {t("costMeter.avatarSeconds", { seconds: estimate.avatarSeconds })}
            </dt>
            <dd>
              {t("costMeter.perSecond", {
                rate: HEYGEN_PER_SECOND_USD.toFixed(3),
              })}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
