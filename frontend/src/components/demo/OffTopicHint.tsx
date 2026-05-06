"use client";

import { useEffect, useState } from "react";
import { useDemoI18n } from "./useDemoI18n";

interface Props {
  /** 체험 시작 시점 (mount 시점) — 1분 뒤 자동 등장 */
  startAt: number;
  /** 이미 강의 외 질문을 시도했는지 — 도전 과제 완료 표시 */
  challengeDone?: boolean;
  /** 사용자가 "지금 시도" 클릭 시 — 입력창 포커스 등 */
  onTryNow?: () => void;
}

/**
 * 강의 외 질문 시도 권유 토스트 + 도전 과제 배지.
 *
 * docs/planning/04-demo-page.md Section 8.1 참조.
 * - 체험 시작 60초 후 자동 등장
 * - 8초 후 자동 사라짐 → 우상단 트로피 배지로 축소
 * - 배지 클릭 시 토스트 다시 표시
 * - 시도 완료 시 ✓ 표시 + 글로우
 */
export default function OffTopicHint({
  startAt,
  challengeDone = false,
  onTryNow,
}: Props) {
  const { t } = useDemoI18n();
  const [phase, setPhase] = useState<"hidden" | "toast" | "badge">("hidden");

  useEffect(() => {
    const elapsed = Date.now() - startAt;
    const showAt = Math.max(0, 60_000 - elapsed);
    const hideAt = showAt + 8_000;

    const showTimer = window.setTimeout(() => setPhase("toast"), showAt);
    const hideTimer = window.setTimeout(() => setPhase("badge"), hideAt);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [startAt]);

  if (phase === "hidden") return null;

  if (phase === "badge") {
    return (
      <button
        type="button"
        onClick={() => setPhase("toast")}
        data-testid="demo-challenge-badge"
        className={[
          "fixed top-20 right-4 z-30",
          "rounded-full px-3 py-1.5 text-[11px] font-medium",
          "border transition",
          challengeDone
            ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.25)]"
            : "bg-[#141414]/80 border-white/15 text-white/70 hover:bg-white/10",
        ].join(" ")}
      >
        {challengeDone ? t("toast.challengeDone") : t("toast.challengeBadge")}
      </button>
    );
  }

  return (
    <div
      role="status"
      data-testid="demo-offtopic-toast"
      className={[
        "fixed top-20 right-4 z-30 max-w-xs",
        "bg-[#141414] border border-[#FFB627]/40 rounded-2xl",
        "p-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)]",
        "animate-scale-in",
      ].join(" ")}
    >
      <p className="text-sm font-semibold text-white mb-1.5">
        {t("toast.offTopicTitle")}
      </p>
      <p className="text-xs text-white/65 leading-relaxed mb-3">
        {t("toast.offTopicBody")}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            onTryNow?.();
            setPhase("badge");
          }}
          className="px-3 py-1.5 rounded-full bg-[#FFB627] text-[#0A0A0A] text-xs font-semibold"
        >
          {t("toast.offTopicCta")}
        </button>
        <button
          type="button"
          aria-label={t("a11y.closeToast")}
          onClick={() => setPhase("badge")}
          className="px-3 py-1.5 rounded-full border border-white/10 text-white/65 text-xs hover:bg-white/5 transition"
        >
          ×
        </button>
      </div>
    </div>
  );
}
