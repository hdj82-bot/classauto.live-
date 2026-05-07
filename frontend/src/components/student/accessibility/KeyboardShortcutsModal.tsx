"use client";

import { useEffect, useRef } from "react";
import { useProfileHubI18n } from "@/components/student/profile/useProfileHubI18n";

interface ShortcutRow {
  keys: string[];
  desc: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * 키보드 단축키 안내 모달.
 *
 * - ESC 닫기, 배경 클릭 닫기
 * - 마운트 직후 닫기 버튼에 포커스 (focus trap 단순화)
 * - prefers-reduced-motion / a11y 토글 시 등장 애니메이션 즉시
 */
export default function KeyboardShortcutsModal({ open, onClose }: Props) {
  const { t, tValue } = useProfileHubI18n();
  const closeBtn = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) closeBtn.current?.focus();
  }, [open]);

  if (!open) return null;

  const rows = tValue<ShortcutRow[]>("accessibilityHub.shortcutsModal.rows") ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="a11y-shortcuts-title"
      data-testid="a11y-shortcuts-modal"
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-8"
    >
      <button
        type="button"
        aria-label={t("accessibilityHub.shortcutsModal.closeLabel")}
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        data-testid="a11y-shortcuts-modal-backdrop"
      />

      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-6 sm:p-7 text-white shadow-xl">
        <header className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 id="a11y-shortcuts-title" className="text-lg font-semibold">
              {t("accessibilityHub.shortcutsModal.title")}
            </h2>
            <p className="text-xs text-white/50 mt-1">
              {t("accessibilityHub.shortcutsModal.subtitle")}
            </p>
          </div>
          <button
            ref={closeBtn}
            type="button"
            onClick={onClose}
            data-testid="a11y-shortcuts-modal-close"
            aria-label={t("accessibilityHub.shortcutsModal.closeLabel")}
            className="text-white/60 hover:text-white w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </header>

        <ul className="divide-y divide-white/5">
          {rows.map((r, i) => (
            <li
              key={i}
              data-testid={`a11y-shortcut-row-${i}`}
              className="flex items-center justify-between py-2.5 gap-4"
            >
              <span className="text-sm text-white/80">{r.desc}</span>
              <span className="flex items-center gap-1.5">
                {r.keys.map((k, j) => (
                  <kbd
                    key={j}
                    className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white tracking-wide tabular-nums"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-xs text-white/40 mt-4 leading-relaxed">
          {t("accessibilityHub.shortcutsModal.footerNote")}
        </p>
      </div>
    </div>
  );
}
