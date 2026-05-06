"use client";

/**
 * Eyebrow + title + (optional) subtitle. Used at the top of every marketing
 * page and as a divider for sub-sections within them.
 *
 * `align="center"` is the page-hero variant; `align="left"` is for in-page
 * sections.
 */
export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "center",
  badge,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  badge?: string;
}) {
  const alignClass = align === "center" ? "text-center mx-auto" : "text-left";
  return (
    <header className={`max-w-3xl ${alignClass}`}>
      {eyebrow && (
        <p className="text-xs font-semibold tracking-[0.18em] text-amber-400 mb-3 uppercase">
          {eyebrow}
        </p>
      )}
      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-4 text-base sm:text-lg text-white/60 leading-relaxed">
          {subtitle}
        </p>
      )}
      {badge && (
        <span className="mt-5 inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
          {badge}
        </span>
      )}
    </header>
  );
}
