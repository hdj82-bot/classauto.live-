"use client";

import { useFeaturesHubI18n } from "./useFeaturesHubI18n";

/**
 * §3.2 Module-icon 4개 호버 분해 재조립.
 *
 * 실제 4개 part 가 컨테이너 가운데에 quadrant 로 모여있고, 호버/포커스 시
 * `featuresStyles.tsx` 의 `.fhub-module-quad:hover .fhub-module-part--*` 가
 * 각 모서리로 transform 한다. 마우스를 떼면 cubic-bezier(0.34, 1.56, 0.64, 1)
 * 로 살짝 튕기듯 복귀.
 *
 * 4 part 의 의미:
 *   - tl (Content) — PPT/영상/번역
 *   - tr (Assess)  — 평가
 *   - bl (Analytics) — 대시보드
 *   - br (Ops)     — 구독/결제
 *
 * 접근성:
 *   - 컨테이너에 `tabIndex={0}` + `role="group"` + aria-label. 키보드 포커스
 *     시에도 호버와 동일한 분해 효과 (`:focus-within`).
 *   - 시각 hint ("hover to split") 는 시각 라벨로만 노출. 스크린 리더는
 *     altModuleQuad 한 줄로 의미 파악.
 */
export default function ModuleQuad() {
  const { t } = useFeaturesHubI18n();

  const quad = [
    {
      key: "content",
      pos: "tl",
      gradient: "fhub-grad-electric",
      label: t("modules.content.label"),
      desc: t("modules.content.desc"),
    },
    {
      key: "assess",
      pos: "tr",
      gradient: "fhub-grad-violet",
      label: t("modules.assess.label"),
      desc: t("modules.assess.desc"),
    },
    {
      key: "analytics",
      pos: "bl",
      gradient: "fhub-grad-cyan",
      label: t("modules.analytics.label"),
      desc: t("modules.analytics.desc"),
    },
    {
      key: "ops",
      pos: "br",
      gradient: "fhub-grad-pink",
      label: t("modules.ops.label"),
      desc: t("modules.ops.desc"),
    },
  ] as const;

  return (
    <figure
      className="fhub-module-quad relative mx-auto w-full max-w-md sm:max-w-xl"
      data-testid="features-module-quad"
    >
      <div
        role="group"
        tabIndex={0}
        aria-label={t("modules.altModuleQuad")}
        className="grid grid-cols-2 gap-3 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 rounded-2xl"
      >
        {quad.map((part) => (
          <div
            key={part.key}
            data-testid={`features-module-part-${part.key}`}
            data-pos={part.pos}
            className={`fhub-module-part fhub-module-part--${part.pos} rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5`}
          >
            <ModuleIcon gradient={part.gradient} variant={part.pos} />
            <h3 className="mt-3 text-sm font-semibold text-white">
              {part.label}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-white/55">
              {part.desc}
            </p>
          </div>
        ))}
      </div>
      <figcaption
        className="mt-3 text-center text-[11px] uppercase tracking-[0.18em] text-white/40"
        aria-hidden="true"
      >
        {t("modules.hint")}
      </figcaption>
    </figure>
  );
}

/**
 * 4 quadrant 마다 다른 stroke SVG. icons.md §2 의 카테고리 매핑을 반영:
 *   - content  → document
 *   - assess   → clipboard-check
 *   - analytics → chart-bar
 *   - ops      → settings/cog
 */
function ModuleIcon({
  gradient,
  variant,
}: {
  gradient: string;
  variant: "tl" | "tr" | "bl" | "br";
}) {
  const stroke = `url(#${gradient})`;
  const common = {
    fill: "none" as const,
    stroke,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="32"
      height="32"
      aria-hidden="true"
      focusable="false"
    >
      {variant === "tl" && (
        <g {...common}>
          {/* document */}
          <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6 M9 17h6" />
        </g>
      )}
      {variant === "tr" && (
        <g {...common}>
          {/* clipboard check */}
          <rect x="6" y="4" width="12" height="17" rx="2" />
          <path d="M9 4v0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v0" />
          <path d="M9 13l2.5 2.5L16 11" />
        </g>
      )}
      {variant === "bl" && (
        <g {...common}>
          {/* chart bars */}
          <path d="M4 21V5" />
          <path d="M4 21h16" />
          <rect x="7" y="13" width="3" height="6" />
          <rect x="12" y="9" width="3" height="10" />
          <rect x="17" y="6" width="3" height="13" />
        </g>
      )}
      {variant === "br" && (
        <g {...common}>
          {/* cog */}
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6l1.4 1.4 M17 17l1.4 1.4 M5.6 18.4 7 17 M17 7l1.4-1.4" />
        </g>
      )}
    </svg>
  );
}
