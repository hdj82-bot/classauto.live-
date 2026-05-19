"use client";

import { useCallback, useEffect, useRef } from "react";
import { useI18n } from "@/contexts/I18nContext";

interface Props {
  open: boolean;
  onClose?: () => void;
  closable?: boolean;
  /**
   * 배경 클릭·ESC 같은 "실수성 닫힘"을 허용할지. 기본 true (기존 동작 보존).
   * false 면 X 버튼(closable)으로만 명시적으로 닫을 수 있다 — 온보딩처럼
   * 입력 도중 우발적으로 닫혀 단계가 건너뛰어지는 걸 막아야 할 때 사용.
   */
  dismissOnBackdrop?: boolean;
  children: React.ReactNode;
  title?: string;
}

export default function Modal({
  open,
  onClose,
  closable = true,
  dismissOnBackdrop = true,
  children,
  title,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  // body scroll lock
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // ESC key to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && closable && dismissOnBackdrop && onClose) onClose();

      // Focus trap
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
    },
    [closable, dismissOnBackdrop, onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  // Auto-focus panel on open
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby={title ? "modal-title" : undefined}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={closable && dismissOnBackdrop ? onClose : undefined} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto outline-none animate-scale-in"
      >
        {(title || closable) && (
          <div className="flex items-center justify-between px-6 pt-5 pb-2">
            {title && <h3 id="modal-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>}
            {closable && onClose && (
              <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition text-xl leading-none" aria-label={t("common.close")}>&times;</button>
            )}
          </div>
        )}
        <div className="px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}
