"use client";

import { type DemoField } from "./demoTypes";
import { useDemoI18n } from "./useDemoI18n";

interface Props {
  field: DemoField;
  onSelect: (field: DemoField) => void;
}

/**
 * 분야 선택 카드 (사회과학 / 자연과학·공학).
 *
 * docs/planning/04-demo-page.md Section 5 참조.
 * - 선택 시 onSelect 콜백을 통해 부모(데모 페이지)에 분야 전달
 * - 카드 자체가 버튼 — 키보드 접근성 보장
 */
export default function FieldSelectCard({ field, onSelect }: Props) {
  const { t } = useDemoI18n();
  const meta = field === "social"
    ? {
        emoji: "🌏",
        labelKey: "fieldSelect.social.label",
        titleKey: "fieldSelect.social.title",
        durationKey: "fieldSelect.social.duration",
        tagKey: "fieldSelect.social.tag",
        startKey: "fieldSelect.social.start",
        a11yKey: "a11y.fieldCardSocial",
        accent: "from-violet-500/20 to-indigo-500/10",
      }
    : {
        emoji: "📐",
        labelKey: "fieldSelect.natural.label",
        titleKey: "fieldSelect.natural.title",
        durationKey: "fieldSelect.natural.duration",
        tagKey: "fieldSelect.natural.tag",
        startKey: "fieldSelect.natural.start",
        a11yKey: "a11y.fieldCardNatural",
        accent: "from-cyan-500/20 to-sky-500/10",
      };

  return (
    <button
      type="button"
      onClick={() => onSelect(field)}
      aria-label={t(meta.a11yKey)}
      data-testid={`demo-field-${field}`}
      className={[
        "group relative w-full text-left",
        "rounded-3xl border border-white/10 bg-[#141414]",
        "p-6 sm:p-8",
        "transition-all duration-300",
        "hover:border-[#FFB627] hover:shadow-[0_0_24px_rgba(255,182,39,0.15)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB627]",
      ].join(" ")}
    >
      <div
        aria-hidden="true"
        className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${meta.accent} opacity-40 group-hover:opacity-70 transition-opacity`}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-6">
          <span className="text-4xl" aria-hidden="true">{meta.emoji}</span>
          <span className="text-[11px] uppercase tracking-[0.16em] text-white/55">
            {t(meta.labelKey)}
          </span>
        </div>

        <h3 className="text-xl sm:text-2xl font-bold text-white leading-snug mb-2">
          {t(meta.titleKey)}
        </h3>
        <p className="text-sm text-white/55 mb-6">
          {t(meta.tagKey)} · {t(meta.durationKey)}
        </p>

        <span
          className={[
            "inline-flex items-center gap-2 px-5 py-2.5 rounded-full",
            "bg-[#FFB627] text-[#0A0A0A] font-semibold text-sm",
            "transition-transform duration-200",
            "group-hover:translate-x-1",
          ].join(" ")}
        >
          {t(meta.startKey)}
        </span>
      </div>
    </button>
  );
}
