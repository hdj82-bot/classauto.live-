"use client";

import type { ReactNode } from "react";

/**
 * 데이터 없음 상태 (모든 차트 공통). 빈 응답이 와도 카드 골격은 유지하고,
 * 친절한 한국어 안내 + 다음 행동 힌트를 노출한다. ARIA `status` 로 보조기기
 * 통보. 카드 outline 은 `border-dashed` 로 "임시" 시그널.
 */
interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  /** 카드 컨테이너를 재사용 시 false */
  bordered?: boolean;
  /** 차트별 SVG 일러스트 placeholder (선택) */
  icon?: ReactNode;
}

export default function EmptyState({
  title,
  description,
  action,
  bordered = true,
  icon,
}: EmptyStateProps) {
  const wrapperCls = bordered
    ? "rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 px-6 py-10 text-center"
    : "py-6 text-center";
  return (
    <div className={wrapperCls} role="status" aria-live="polite">
      {icon && (
        <div
          aria-hidden="true"
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-gray-400 shadow-sm"
        >
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
