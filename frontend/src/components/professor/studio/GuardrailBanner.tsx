"use client";

import Link from "next/link";
import { useStudioI18n } from "./useStudioI18n";
import type { PlanUsage } from "./studioTypes";

interface GuardrailBannerProps {
  variant: "warn" | "block" | "noPipeline" | "uploadOversize" | "uploadInvalidType" | "approveBlocked";
  // block 변형에 한해 사용량 정보 표시.
  usage?: PlanUsage;
  // uploadOversize 변형에 사용.
  fileSizeMB?: number;
  // 닫기·재시도 액션이 필요한 경우.
  onDismiss?: () => void;
}

/**
 * 가드레일 위반 안내 배너. 학생측 화면이 아닌 교수자 영역이라
 * 의미적 컬러(빨강·황색)는 색상 시스템 정책상 허용된다 (colors.md §5).
 *
 * 색상 단독에 의존하지 않고 아이콘 + 텍스트도 함께 노출한다 (색맹 친화).
 */
export default function GuardrailBanner({
  variant,
  usage,
  fileSizeMB,
  onDismiss,
}: GuardrailBannerProps) {
  const { t } = useStudioI18n();

  const isBlock =
    variant === "block" ||
    variant === "approveBlocked" ||
    variant === "uploadOversize" ||
    variant === "uploadInvalidType";

  const iconShape = isBlock ? (
    // X 아이콘 — block
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M6 18L18 6M6 6l12 12"
    />
  ) : variant === "warn" ? (
    // ! 아이콘 — warn
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  ) : (
    // info 아이콘 — noPipeline
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13 16h-1v-4h-1m1-4h.01M12 21a9 9 0 110-18 9 9 0 010 18z"
    />
  );

  const tone = isBlock
    ? "border-red-200 bg-red-50 text-red-800"
    : variant === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-blue-200 bg-blue-50 text-blue-800";

  const title =
    variant === "block"
      ? t("guardrail.planLimit")
      : variant === "approveBlocked"
        ? t("guardrail.scriptApproveBlocked")
        : variant === "uploadOversize"
          ? t("guardrail.uploadOversize", { size: fileSizeMB ?? 0 })
          : variant === "uploadInvalidType"
            ? t("guardrail.uploadInvalidType")
            : variant === "noPipeline"
              ? t("guardrail.noPipelineYet")
              : "";

  const detail =
    isBlock && usage && usage.monthlyVideoLimit
      ? t("guardrail.planLimitDetail", {
          used: String(usage.monthlyVideoCount ?? 0),
          limit: String(usage.monthlyVideoLimit),
        })
      : null;

  return (
    <div
      role="alert"
      className={`border ${tone} rounded-xl px-4 py-3 flex items-start gap-3`}
    >
      <span
        className="mt-0.5 inline-flex items-center justify-center w-5 h-5 flex-shrink-0"
        aria-hidden="true"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {iconShape}
        </svg>
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {detail && <p className="text-xs mt-1 opacity-80">{detail}</p>}
        {variant === "block" && (
          <Link
            href="/professor/subscription"
            className="inline-flex items-center mt-2 text-xs font-semibold underline underline-offset-2 hover:no-underline"
          >
            {t("guardrail.planUpgradeCta")}
          </Link>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("common.cancel")}
          className="text-xs opacity-70 hover:opacity-100 transition"
        >
          ×
        </button>
      )}
    </div>
  );
}
