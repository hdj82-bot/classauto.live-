"use client";

import Link from "next/link";
import { useI18n, type Locale } from "@/contexts/I18nContext";
import { useMarketingI18n } from "./useMarketingI18n";

/**
 * Shared dark-base marketing chrome — minimal top bar (logo + locale toggle)
 * + page content + footer. Used across /use-cases, /trust, /security,
 * /beta-apply, /contact.
 *
 * Header.tsx (the in-app header with auth menu) is intentionally NOT used:
 * marketing surfaces are public, do not render auth state, and follow the
 * dark-base + gold accent design from docs/design-system/colors.md §1.
 */
export default function MarketingShell({
  children,
  /** Optional secondary CTA in the top-right (e.g. "Apply for beta"). */
  topCta,
}: {
  children: React.ReactNode;
  topCta?: { href: string; label: string };
}) {
  const { t } = useMarketingI18n();
  const { locale, setLocale } = useI18n();

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white antialiased">
      {/* Aurora background — purely decorative, prefers-reduced-motion safe */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at 20% 20%, rgba(167,139,250,0.10), transparent 50%)," +
            "radial-gradient(ellipse at 80% 70%, rgba(255,182,39,0.08), transparent 50%)," +
            "radial-gradient(ellipse at 50% 50%, rgba(34,211,238,0.06), transparent 60%)",
        }}
      />

      <header className="sticky top-0 z-30 backdrop-blur-md bg-black/40 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2"
            aria-label="ClassAuto home"
          >
            <span
              className="w-8 h-8 rounded-lg bg-amber-400 text-black flex items-center justify-center text-xs font-bold tracking-wider"
              aria-hidden="true"
            >
              CA
            </span>
            <span className="text-sm font-semibold tracking-wide hidden sm:inline">
              ClassAuto
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <label htmlFor="marketing-lang" className="sr-only">
              Language
            </label>
            <select
              id="marketing-lang"
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              className="text-xs bg-transparent border border-white/10 rounded-lg px-2 py-1 text-white/70 outline-none focus:border-amber-400"
            >
              <option value="ko" className="bg-gray-900">
                한국어
              </option>
              <option value="en" className="bg-gray-900">
                English
              </option>
            </select>

            {topCta && (
              <Link
                href={topCta.href}
                className="hidden sm:inline-flex text-xs font-semibold rounded-lg bg-amber-400 text-black px-3 py-1.5 hover:bg-amber-300 transition"
              >
                {topCta.label}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-white/5 mt-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-white/40">
          <p>{t("common.footerCopyright")}</p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/use-cases" className="hover:text-white/80">
              Use cases
            </Link>
            <Link href="/trust" className="hover:text-white/80">
              Trust
            </Link>
            <Link href="/security" className="hover:text-white/80">
              Security
            </Link>
            <Link href="/beta-apply" className="hover:text-white/80">
              Beta
            </Link>
            <Link href="/contact" className="hover:text-white/80">
              Contact
            </Link>
            <Link href="/privacy" className="hover:text-white/80">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-white/80">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
