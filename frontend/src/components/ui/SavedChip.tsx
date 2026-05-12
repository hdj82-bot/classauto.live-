/**
 * SavedChip — 자동저장 인디케이터 (05 prototype §topbar)
 *
 *   .saved pill: bg-subtle + 6px green dot (success) + 텍스트.
 *   교수자 studio 마법사·인라인 편집기에서 "저장됨" 표시에 사용.
 *
 * 상태:
 *   - "saved" (기본) — green dot + "저장됨"
 *   - "saving"        — pulsing dot + "저장 중…"
 *   - "error"         — red dot + 사용자 정의 메시지
 */

interface SavedChipProps {
  state?: "saved" | "saving" | "error";
  label?: string;
  className?: string;
}

export default function SavedChip({
  state = "saved",
  label,
  className = "",
}: SavedChipProps) {
  const dotColor =
    state === "error"
      ? "var(--warning)"
      : "var(--success)";

  const text = label ?? (state === "saving" ? "저장 중…" : state === "error" ? "저장 실패" : "저장됨");

  const dotPulse = state === "saving" ? "animate-pulse" : "";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-subtle)] px-2.5 py-1 text-xs text-[var(--text-subtle)] ${className}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block w-1.5 h-1.5 rounded-full ${dotPulse}`}
        style={{
          background: dotColor,
          boxShadow: `0 0 0 3px ${state === "error" ? "rgba(239,68,68,0.18)" : "rgba(16,185,129,0.18)"}`,
        }}
      />
      <span>{text}</span>
    </span>
  );
}
