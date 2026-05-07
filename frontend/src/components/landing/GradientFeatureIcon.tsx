"use client";

export type FeatureGradient = "violet" | "electric" | "cyan" | "pink";

interface GradientFeatureIconProps {
  // SVG path d 속성
  path: string;
  gradient: FeatureGradient;
  size?: number;
  // viewBox 기본 24 — feature 카드의 SVG 가 24×24 path 사용 중이라 동일 유지.
  viewBoxSize?: number;
  // 호버 회전 효과 활성. 카드 hover 시 wrapper 가 .group:hover 으로 전달.
  hoverRotate?: boolean;
}

/**
 * 그라데이션 stroke 아이콘 — docs/design-system/animations.md §2.3.
 *
 * - 기본: 그라데이션 stroke
 * - 호버: scale + rotate-(-8deg) + drop-shadow(gold-glow-medium)
 *
 * `IconDefs` 가 페이지에 마운트되어 있어야 url(#grad-violet) 등이 resolve.
 *
 * 호출자가 `<div className="group">...<GradientFeatureIcon hoverRotate /></div>`
 * 로 감싸면 자동으로 hover 트리거. `prefers-reduced-motion` 일 때 transition
 * 자동 비활성 (Tailwind motion-safe 유틸리티).
 */
export default function GradientFeatureIcon({
  path,
  gradient,
  size = 24,
  viewBoxSize = 24,
  hoverRotate = true,
}: GradientFeatureIconProps) {
  return (
    <svg
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={
        hoverRotate
          ? "transition-[transform,filter] duration-300 ease-out motion-safe:group-hover:-rotate-[8deg] motion-safe:group-hover:scale-110 motion-safe:group-hover:[filter:drop-shadow(0_0_12px_rgba(255,182,39,0.40))]"
          : "transition-[transform,filter] duration-300 ease-out"
      }
    >
      <path
        d={path}
        stroke={`url(#grad-${gradient})`}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
