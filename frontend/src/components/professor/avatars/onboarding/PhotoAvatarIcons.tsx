import type { CSSProperties } from "react";

/**
 * 온보딩 전용 골드 그라데이션 SVG 아이콘 (docs/design-system/icons.md 옵션 C).
 *
 * 이모지(📷 ✨ ✓ …)를 직접 쓰지 않고, AppShell 이 마운트한 ``grad-electric`` /
 * ``grad-success`` 그라데이션을 stroke 로 참조한다. ``mono`` 가 true 면
 * currentColor 단색(작은 인라인·체크 등)으로 렌더한다.
 */

interface IconProps {
  size?: number;
  /** stroke 를 그라데이션 대신 currentColor 단색으로. */
  mono?: boolean;
  gradient?: "electric" | "success";
  style?: CSSProperties;
  title?: string;
}

function svgProps({ size = 24, mono, gradient = "electric", title }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: mono ? "currentColor" : `url(#grad-${gradient})`,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    role: title ? ("img" as const) : undefined,
    "aria-hidden": title ? undefined : true,
  };
}

/** 카메라 — 사진 업로드. */
export function CameraIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)} style={props.style}>
      {props.title && <title>{props.title}</title>}
      <path d="M3 8a2 2 0 0 1 2-2h2l1.2-2h7.6L19 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  );
}

/** 반짝임 — Design with AI 룩 생성. */
export function SparkleIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)} style={props.style}>
      {props.title && <title>{props.title}</title>}
      <path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
      <path d="M18.5 14.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" />
    </svg>
  );
}

/** 사람 — 본인 아바타. */
export function PersonIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)} style={props.style}>
      {props.title && <title>{props.title}</title>}
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
    </svg>
  );
}

/** 재생 ▶ — 움직이는 미리보기. */
export function PlayIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)} style={props.style}>
      {props.title && <title>{props.title}</title>}
      <path d="M7 5l12 7-12 7z" />
    </svg>
  );
}

/** 체크 ✓ — 완료·선택. */
export function CheckIcon(props: IconProps) {
  return (
    <svg {...svgProps({ ...props, gradient: props.gradient ?? "success" })} style={props.style}>
      {props.title && <title>{props.title}</title>}
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

/** 정보 i — 가이드·안내. */
export function InfoIcon(props: IconProps) {
  return (
    <svg {...svgProps(props)} style={props.style}>
      {props.title && <title>{props.title}</title>}
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}
