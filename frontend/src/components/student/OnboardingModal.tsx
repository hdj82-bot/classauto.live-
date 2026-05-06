"use client";

import { useEffect, useId, useState } from "react";
import { useI18n, type Locale } from "@/contexts/I18nContext";

const ONBOARDED_KEY = "ifl_student_onboarded";

/**
 * One-shot welcome modal called for in
 * docs/planning/06-student-pages.md §5 ("학생 첫 사용 온보딩").
 *
 * - Skippable (the user task wording explicitly allows skip).
 * - Persists `ifl_student_onboarded=true` in localStorage so a returning
 *   student is never prompted again, regardless of save vs skip.
 * - SSR-safe: localStorage is only touched once we've mounted in the
 *   browser; the initial render returns null so hydration matches.
 */
export default function OnboardingModal({
  initialName = "",
  onSaved,
}: {
  initialName?: string;
  /** Fired with the captured values after either Save or Skip. */
  onSaved?: (data: { name: string; locale: Locale; skipped: boolean }) => void;
}) {
  const { t, locale, setLocale } = useI18n();
  const headingId = useId();

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [pickedLocale, setPickedLocale] = useState<Locale>(locale);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = window.localStorage.getItem(ONBOARDED_KEY);
      if (stored !== "true") setOpen(true);
    } catch {
      // localStorage may be unavailable (e.g. iOS private mode). In that case
      // we just don't show the modal rather than throwing.
    }
  }, []);

  // Keep the picker in sync if locale changes elsewhere while modal is open.
  useEffect(() => {
    setPickedLocale(locale);
  }, [locale]);

  const persistOnboarded = () => {
    try {
      window.localStorage.setItem(ONBOARDED_KEY, "true");
    } catch {
      /* see useEffect above */
    }
  };

  const handleSave = () => {
    if (pickedLocale !== locale) setLocale(pickedLocale);
    persistOnboarded();
    setOpen(false);
    onSaved?.({ name: name.trim(), locale: pickedLocale, skipped: false });
  };

  const handleSkip = () => {
    persistOnboarded();
    setOpen(false);
    onSaved?.({ name: name.trim(), locale: pickedLocale, skipped: true });
  };

  if (!mounted || !open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 sm:p-8 shadow-2xl">
        <h2 id={headingId} className="text-lg font-semibold text-white">
          {t("student.onboarding.title")}
        </h2>
        <p className="mt-2 text-sm text-gray-400">
          {t("student.onboarding.description")}
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="onb-name"
              className="block text-xs font-medium text-gray-300 mb-1.5"
            >
              {t("student.onboarding.nameLabel")}
            </label>
            <input
              id="onb-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("student.onboarding.namePlaceholder")}
              className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-amber-500"
              autoComplete="name"
            />
          </div>

          <div>
            <label
              htmlFor="onb-lang"
              className="block text-xs font-medium text-gray-300 mb-1.5"
            >
              {t("student.onboarding.languageLabel")}
            </label>
            <select
              id="onb-lang"
              value={pickedLocale}
              onChange={(e) => setPickedLocale(e.target.value as Locale)}
              className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-white outline-none focus:border-amber-500"
            >
              <option value="ko">{t("language.ko")}</option>
              <option value="en">{t("language.en")}</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={handleSkip}
            className="rounded-xl border border-gray-700 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 transition"
          >
            {t("student.onboarding.skipButton")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 transition"
          >
            {t("student.onboarding.saveButton")}
          </button>
        </div>
      </div>
    </div>
  );
}

// Exposed for tests so they can clear the persisted flag between cases.
export const ONBOARDING_STORAGE_KEY = ONBOARDED_KEY;
