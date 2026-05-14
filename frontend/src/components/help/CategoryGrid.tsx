"use client";

import { useHelpHubI18n } from "./useHelpHubI18n";
import { HELP_CATEGORY_IDS, type HelpCategoryId } from "./types";

/**
 * 도움말 카테고리 6개 카드 그리드 — sitemap §5단계에 명시된 분류와 일치.
 *
 * 색약자 친화: 카테고리 글리프(이모지 대체 SVG) 색상이 각 카드별로 다르되,
 * 글리프 모양 자체로 1차 구분 가능 — 색상 단독 의존하지 않는다.
 */
interface CategoryGridProps {
  itemCounts: Record<HelpCategoryId, number>;
  onSelect: (id: HelpCategoryId) => void;
  active?: HelpCategoryId | null;
}

const GLYPHS: Record<HelpCategoryId, string> = {
  "getting-started": "M5 13l4 4L19 7",
  "video-creation":
    "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M4 6h11a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z",
  students:
    "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-3.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z",
  billing:
    "M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z",
  security:
    "M12 11c.667 0 1.5-.5 1.5-1.5S12.667 8 12 8s-1.5.5-1.5 1.5S11.333 11 12 11zM4 6l8-3 8 3v6c0 4.5-3 8.5-8 9-5-.5-8-4.5-8-9V6z",
  troubleshooting:
    "M12 9v3m0 4h.01M5 12a7 7 0 1014 0 7 7 0 00-14 0z",
};

const TINTS: Record<HelpCategoryId, string> = {
  "getting-started": "rgba(167, 139, 250, 0.85)",
  "video-creation": "rgba(255, 182, 39, 0.85)",
  students: "rgba(34, 211, 238, 0.85)",
  billing: "rgba(244, 114, 182, 0.85)",
  security: "rgba(16, 185, 129, 0.85)",
  troubleshooting: "rgba(239, 68, 68, 0.80)",
};

export default function CategoryGrid({
  itemCounts,
  onSelect,
  active = null,
}: CategoryGridProps) {
  const { t } = useHelpHubI18n();

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
      {HELP_CATEGORY_IDS.map((id) => {
        const isActive = active === id;
        const count = itemCounts[id] ?? 0;
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => onSelect(id)}
              aria-pressed={isActive}
              className={`group relative flex h-full w-full flex-col rounded-2xl border bg-white p-6 text-left transition motion-reduce:transition-none hover:shadow-[0_8px_28px_rgba(255,182,39,0.10)] hover:-translate-y-0.5 ${
                isActive
                  ? "border-[#B88308] shadow-[0_4px_16px_rgba(255,182,39,0.18)]"
                  : "border-[rgba(10,10,10,0.08)] hover:border-[rgba(184,131,8,0.30)]"
              }`}
            >
              <span
                aria-hidden="true"
                className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl"
                style={{
                  background: "#FAFAF7",
                  color: TINTS[id],
                  boxShadow: "inset 0 0 0 1px rgba(10,10,10,0.04)",
                }}
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d={GLYPHS[id]}
                  />
                </svg>
              </span>
              <h3 className="text-base font-semibold text-[#0A0A0A] tracking-tight">
                {t(`categories.${id}.title`)}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-[rgba(10,10,10,0.55)]">
                {t(`categories.${id}.description`)}
              </p>
              <span className="mt-4 inline-flex items-center gap-2 text-[11px] font-medium text-[rgba(10,10,10,0.50)]">
                <span
                  aria-hidden="true"
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: TINTS[id] }}
                />
                {t("categoryView.count", { count })}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
