"use client";

import { useId, useMemo } from "react";
import { HUB_PALETTE } from "./palette";

/**
 * 미니 sparkline (지난 7일 추이) — animations.md §4.1 의 SVG 변형.
 *
 * - 빈 데이터(undefined / null / [] / 모두 null): 카드 골격을 깨지 않도록
 *   placeholder 라인(점선) + aria-hidden 으로 처리. 호출자가 caption 으로
 *   "추이 데이터 준비 중" 안내.
 * - `active=true` 호버 시 면적이 채워지는 효과 — 호출자가 hover state 를
 *   props 로 전달(상위 카드의 hover state 를 그대로 받음).
 * - `prefers-reduced-motion` 에서는 채우기 transition 0ms (globals.css 의
 *   wildcard rule 이 적용 + 이 컴포넌트 자체 `motion-safe:` modifier 사용).
 */
interface SparklineProps {
  /** 7개 정도의 값. null = 결측치(라인 끊김). */
  points: Array<number | null> | null | undefined;
  active?: boolean;
  /** stroke 컬러. 미지정 시 골드. */
  color?: string;
  /** 채움 영역 컬러. 미지정 시 stroke 색의 alpha. */
  fillColor?: string;
  width?: number;
  height?: number;
  className?: string;
  /** 보조기기용 라벨 — 보통 카드 단위 aria-label 에 흡수되므로 기본 hidden. */
  ariaLabel?: string;
}

export default function Sparkline({
  points,
  active = false,
  color,
  fillColor,
  width = 100,
  height = 30,
  className,
  ariaLabel,
}: SparklineProps) {
  const idBase = useId().replace(/:/g, "-");
  const stroke = color ?? HUB_PALETTE.gold;
  const fill = fillColor ?? "rgba(184, 131, 8, 0.18)";

  const valid = useMemo(
    () => Array.isArray(points) && points.some((p) => p !== null && Number.isFinite(p)),
    [points],
  );

  if (!valid) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={className}
        aria-hidden={ariaLabel ? undefined : true}
        aria-label={ariaLabel}
        role={ariaLabel ? "img" : undefined}
      >
        <line
          x1="0"
          x2={width}
          y1={height / 2}
          y2={height / 2}
          stroke={HUB_PALETTE.border}
          strokeDasharray="3 4"
          strokeWidth="1"
        />
      </svg>
    );
  }

  const arr = (points as Array<number | null>).map((v) =>
    v === null || !Number.isFinite(v) ? null : (v as number),
  );

  const numeric = arr.filter((v): v is number => v !== null);
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const range = max - min || 1;
  const pad = 2;
  const stepX = arr.length > 1 ? (width - pad * 2) / (arr.length - 1) : width;

  // path 생성 — null 은 segment break 로 처리
  let pathD = "";
  let lastValid = false;
  for (let i = 0; i < arr.length; i += 1) {
    const v = arr[i];
    if (v === null) {
      lastValid = false;
      continue;
    }
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    pathD += `${lastValid ? "L" : "M"} ${x.toFixed(2)} ${y.toFixed(2)} `;
    lastValid = true;
  }

  // 채우기 영역 — 시작/끝을 baseline 까지 닫음
  const firstIdx = arr.findIndex((v) => v !== null);
  const lastIdx = (() => {
    for (let i = arr.length - 1; i >= 0; i -= 1) if (arr[i] !== null) return i;
    return firstIdx;
  })();
  const firstX = pad + firstIdx * stepX;
  const lastX = pad + lastIdx * stepX;
  const baseline = height - pad;
  const fillD = `${pathD} L ${lastX.toFixed(2)} ${baseline} L ${firstX.toFixed(2)} ${baseline} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? "img" : undefined}
    >
      <defs>
        <linearGradient id={`${idBase}-fill`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* 영역(채움) — active 시 그라데이션, 평소엔 옅은 색 */}
      <path
        d={fillD}
        fill={active ? `url(#${idBase}-fill)` : fill}
        opacity={active ? 1 : 0.6}
        className="motion-safe:transition-opacity motion-safe:duration-200"
      />
      <path
        d={pathD}
        fill="none"
        stroke={stroke}
        strokeWidth={active ? 2 : 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="motion-safe:transition-[stroke-width] motion-safe:duration-200"
      />
    </svg>
  );
}
