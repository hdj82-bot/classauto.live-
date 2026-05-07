"use client";

import { useChangelogHubI18n } from "./useChangelogHubI18n";
import {
  CHANGELOG_CATEGORIES,
  type ChangelogCategory,
} from "./types";

/**
 * 변경 로그 카테고리 칩 필터 — 4종 카테고리 + 전체.
 *
 * 색약자 친화: 컬러 dot 외에 글리프(▲ ✓ ✗ !) 를 함께 노출. aria-pressed 로
 * 활성/비활성 보조기기 통보. 다중 선택은 허용하지 않음 — 단일 선택 + "전체"
 * 가 가장 단순하고 사용성이 좋다.
 */
interface CategoryFilterProps {
  /** null 이면 "전체" 선택 상태. */
  active: ChangelogCategory | null;
  onChange: (category: ChangelogCategory | null) => void;
  /** 카테고리별 항목 수 — 칩 옆에 작은 카운트로 노출. */
  counts: Record<ChangelogCategory | "all", number>;
}

const GLYPHS: Record<ChangelogCategory, string> = {
  feature: "▲",
  improvement: "✓",
  fix: "✗",
  breaking: "!",
};

const DOT_COLORS: Record<ChangelogCategory, string> = {
  feature: "rgba(255, 182, 39, 0.85)",
  improvement: "rgba(34, 211, 238, 0.85)",
  fix: "rgba(16, 185, 129, 0.85)",
  breaking: "rgba(239, 68, 68, 0.85)",
};

export default function CategoryFilter({
  active,
  onChange,
  counts,
}: CategoryFilterProps) {
  const { t } = useChangelogHubI18n();

  return (
    <ul
      role="group"
      aria-label={t("filters.all")}
      className="flex flex-wrap items-center gap-2"
    >
      <li>
        <Chip
          isActive={active === null}
          onClick={() => onChange(null)}
          label={t("filters.all")}
          count={counts.all}
          glyph="●"
          color="rgba(255,255,255,0.55)"
        />
      </li>
      {CHANGELOG_CATEGORIES.map((c) => (
        <li key={c}>
          <Chip
            isActive={active === c}
            onClick={() => onChange(c)}
            label={t(`filters.${c}`)}
            count={counts[c]}
            glyph={GLYPHS[c]}
            color={DOT_COLORS[c]}
          />
        </li>
      ))}
    </ul>
  );
}

function Chip({
  isActive,
  onClick,
  label,
  count,
  glyph,
  color,
}: {
  isActive: boolean;
  onClick: () => void;
  label: string;
  count: number;
  glyph: string;
  color: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition motion-reduce:transition-none ${
        isActive
          ? "border-amber-400/60 bg-amber-400/10 text-white"
          : "border-white/10 bg-white/[0.02] text-white/65 hover:border-white/20 hover:text-white"
      }`}
    >
      <span aria-hidden="true" className="text-sm leading-none" style={{ color }}>
        {glyph}
      </span>
      <span>{label}</span>
      <span
        className="rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[10px] tabular-nums text-white/55"
        aria-hidden="true"
      >
        {count}
      </span>
    </button>
  );
}
