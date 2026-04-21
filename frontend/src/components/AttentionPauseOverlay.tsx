"use client";

import { useCallback, useEffect } from "react";
import { useI18n } from "@/contexts/I18nContext";

interface Props {
  warningLevel: number;
  onResume: () => void;
}

export default function AttentionPauseOverlay({ warningLevel, onResume }: Props) {
  const { t } = useI18n();
  const level = Math.min(warningLevel, 3);

  const bgs = ["", "from-amber-500/90 to-amber-600/90", "from-orange-500/90 to-orange-600/90", "from-red-500/90 to-red-600/90"];
  const bg = bgs[level] || bgs[3];
  const message = t(`attention.level${level}` as "attention.level1");
  const description = t(`attention.level${level}Desc` as "attention.level1Desc");

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onResume();
      }
    },
    [onResume],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br ${bg}`}
      role="alertdialog"
      aria-modal="true"
      aria-label={message}
    >
      <div className="text-center text-white space-y-6 max-w-sm px-4">
        <div className="w-20 h-20 mx-auto rounded-full bg-white/20 flex items-center justify-center" aria-hidden="true">
          {level === 1 ? (
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
          ) : level === 2 ? (
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          ) : (
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
          )}
        </div>
        <h2 className="text-2xl font-bold">{message}</h2>
        <p className="text-white/80 text-sm">{description}</p>

        <div className="flex gap-2 justify-center" aria-label={t("attention.warningLevel", { level: String(level) })}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={`w-3 h-3 rounded-full transition ${i <= level ? "bg-white" : "bg-white/30"}`} aria-hidden="true" />
          ))}
        </div>

        <button
          onClick={onResume}
          autoFocus
          className="mt-4 bg-white text-gray-900 font-semibold rounded-xl px-8 py-3 shadow-lg hover:bg-gray-100 transition active:scale-95"
        >
          {t("attention.resume")}
        </button>
        <p className="text-white/50 text-xs">{t("attention.resumeHint")}</p>
      </div>
    </div>
  );
}
