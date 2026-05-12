"use client";

import { type DemoField } from "./demoTypes";
import { useDemoI18n } from "./useDemoI18n";

interface Props {
  field: DemoField;
  onSelect: (field: DemoField) => void;
}

/**
 * 분야 선택 카드 (인문계열 / 자연계열) v2.
 *
 * docs/planning/04-demo-page.md §5.1 도식대로:
 *   인문계열                          자연계열
 *   A · LIBERAL ARTS                 B · NATURAL SCIENCE
 *   [한자/잎사귀 그라데이션 SVG]     [잎사귀 SVG]
 *   인문계열 · 5분 클립               자연계열 · 5분 클립
 *   중국어문법의 이해                  광합성의 원리
 *   [부제 §5.3]                       [부제 §5.3]
 *   8 슬라이드 · 2 추천 질문 · 1 퀴즈  8 슬라이드 · 2 추천 질문 · 1 퀴즈
 *   [시작하기 →]                     [시작하기 →]
 *
 * 시연 주제 변경 (2026-05-06):
 *   - 현대중국사회의이해 → 중국어문법의 이해 (把자문)
 *   - 특수상대성이론 → 광합성의 원리
 *
 * 옵션 C 정책 (icons.md): 이모지 폐기. 분야 아이콘은 인라인 SVG 로 통일.
 * 한자 강조(HanCharBadge)는 사용자 결정에 따라 랜딩 히어로 한정, 본 카드에서는
 * 미사용 — 외국 사용자도 한 번에 분야를 식별할 수 있도록 도형 + 라벨 우선.
 */
export default function FieldSelectCard({ field, onSelect }: Props) {
  const { t } = useDemoI18n();
  const meta = field === "social"
    ? {
        labelKey: "fieldSelectV2.social.label",
        taglineKey: "fieldSelectV2.social.tagline",
        titleKey: "fieldSelectV2.social.title",
        subtitleKey: "fieldSelectV2.social.subtitle",
        elementsKey: "fieldSelectV2.social.elements",
        startKey: "fieldSelectV2.social.start",
        a11yKey: "a11y.fieldCardSocial",
        accent: "from-[rgba(167,139,250,0.18)] to-[rgba(99,102,241,0.05)]",
        gradId: "demoFieldGradSocial",
        gradStops: ["#A78BFA", "#6366F1"] as const,
      }
    : {
        labelKey: "fieldSelectV2.natural.label",
        taglineKey: "fieldSelectV2.natural.tagline",
        titleKey: "fieldSelectV2.natural.title",
        subtitleKey: "fieldSelectV2.natural.subtitle",
        elementsKey: "fieldSelectV2.natural.elements",
        startKey: "fieldSelectV2.natural.start",
        a11yKey: "a11y.fieldCardNatural",
        accent: "from-[rgba(34,211,238,0.18)] to-[rgba(14,165,233,0.05)]",
        gradId: "demoFieldGradNatural",
        gradStops: ["#22D3EE", "#0EA5E9"] as const,
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
        "transition-all duration-300 motion-reduce:transition-none",
        "hover:border-[#FFB627] hover:shadow-[0_0_32px_rgba(255,182,39,0.18)] hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB627]",
      ].join(" ")}
    >
      <div
        aria-hidden="true"
        className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${meta.accent} opacity-50 group-hover:opacity-90 transition-opacity motion-reduce:transition-none`}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-6">
          <FieldGlyph variant={field} gradId={meta.gradId} stops={meta.gradStops} />
          <div className="text-right">
            <p className="text-[10px] tracking-[0.20em] uppercase text-[#FFB627] font-semibold">
              {t(meta.taglineKey)}
            </p>
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/55 mt-0.5">
              {t(meta.labelKey)}
            </p>
          </div>
        </div>

        <h3
          className="text-xl sm:text-2xl font-bold text-white leading-snug mb-2"
          style={{
            fontFamily:
              "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
            letterSpacing: "-0.02em",
          }}
        >
          {t(meta.titleKey)}
        </h3>
        <p className="text-sm text-white/65 mb-4 leading-relaxed">
          {t(meta.subtitleKey)}
        </p>
        <p className="text-xs text-white/45 mb-6 tabular-nums">
          {t(meta.elementsKey)}
        </p>

        <span
          className={[
            "inline-flex items-center gap-2 px-5 py-2.5 rounded-full",
            "bg-[#FFB627] text-[#1A1A1A] font-semibold text-sm",
            "transition-transform duration-200 motion-reduce:transition-none",
            "group-hover:translate-x-1",
          ].join(" ")}
        >
          {t(meta.startKey)}
          <span aria-hidden="true">→</span>
        </span>
      </div>
    </button>
  );
}

/**
 * 분야 글리프 — 옵션 C (icons.md) 정책에 따른 그라데이션 SVG.
 *
 * - social (인문) : 도서 + 점선 (텍스트의 메타) 형상
 * - natural (자연): 잎사귀 (광합성 직결)
 *
 * 한자 강조(HanCharBadge)는 사용자 결정에 따라 랜딩 히어로에만 사용 — 본 카드는
 * 분야 식별을 명확히 하기 위해 도형 SVG 사용.
 */
function FieldGlyph({
  variant,
  gradId,
  stops,
}: {
  variant: DemoField;
  gradId: string;
  stops: readonly [string, string];
}) {
  const stroke = `url(#${gradId})`;
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={stops[0]} />
          <stop offset="100%" stopColor={stops[1]} />
        </linearGradient>
      </defs>
      {variant === "social" ? (
        <g
          stroke={stroke}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* book + dotted underline */}
          <path d="M10 8h20a3 3 0 013 3v26a3 3 0 01-3 3H13a3 3 0 01-3-3V8z" />
          <path d="M14 14h14M14 20h14M14 26h10" />
          <line
            x1="10"
            y1="42"
            x2="38"
            y2="42"
            strokeDasharray="2 4"
          />
        </g>
      ) : (
        <g
          stroke={stroke}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* leaf — 광합성 직결 형상 */}
          <path d="M10 38c0-14 12-26 28-28-2 16-14 28-28 28z" />
          <path d="M10 38c8-2 16-10 20-22" />
        </g>
      )}
    </svg>
  );
}
