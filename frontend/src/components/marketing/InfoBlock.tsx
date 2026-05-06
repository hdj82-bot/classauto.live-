"use client";

/**
 * Plain titled list — used on /trust ("어떤 데이터를 수집하나요?" etc.) and
 * /security (each numbered section). Two columns at sm+, single column
 * mobile. Items accept either string (rendered as ✓ bullet) or a {label,
 * value} pair (used for the infrastructure table).
 */
export type InfoBlockItem = string | { label: string; value: string };

export default function InfoBlock({
  title,
  items,
  tone = "default",
}: {
  title: string;
  items: InfoBlockItem[];
  tone?: "default" | "highlight";
}) {
  return (
    <section
      className={`rounded-2xl border p-6 sm:p-8 ${
        tone === "highlight"
          ? "border-amber-400/30 bg-amber-400/[0.04]"
          : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
      <ul className="space-y-2.5">
        {items.map((item, idx) => {
          if (typeof item === "string") {
            return (
              <li
                key={`${title}-${idx}`}
                className="flex items-start gap-2.5 text-sm text-white/70 leading-relaxed"
              >
                <span aria-hidden="true" className="mt-1 text-amber-400 shrink-0">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            );
          }
          return (
            <li
              key={`${title}-${idx}`}
              className="flex items-baseline justify-between gap-3 text-sm border-b border-white/5 pb-2 last:border-0 last:pb-0"
            >
              <span className="text-white/80 font-medium">{item.label}</span>
              <span className="text-white/50 text-right">{item.value}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
