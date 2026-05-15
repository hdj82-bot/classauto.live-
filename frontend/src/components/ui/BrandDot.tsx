/**
 * BrandDot — 골드 그라데이션 브랜드 마크 (05 prototype §topbar)
 *
 *   기본 20×20 rounded square, linear-gradient(135deg, gold-bright → gold-deep),
 *   부드러운 골드 글로우 shadow. 로고 옆에 두는 시각 앵커.
 *
 * size 는 px 단위. 기본 20. Hero 등에선 32~48 도 가능.
 *
 * canonical 단일 브랜드 마크 — 랜딩/공용은 물론 후속 정리 ② 에서
 * professor/shell/Topbar 의 손수 그리던 brand-dot 도 본 컴포넌트로
 * 흡수했다. CSS 변수(--gold-bright/-deep/-glow) 기반이라 professor scoped
 * 토큰 wrapper 안에서도 동일 그라데이션으로 렌더된다 (glow 만 표준값).
 * 브랜드 마크는 한 곳에서만 정의 — 새로 손수 그리지 말 것.
 */

interface BrandDotProps {
  size?: number;
  className?: string;
  ariaHidden?: boolean;
}

export default function BrandDot({ size = 20, className = "", ariaHidden = true }: BrandDotProps) {
  return (
    <span
      aria-hidden={ariaHidden}
      className={`inline-block rounded-md ${className}`}
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))",
        boxShadow: `0 ${Math.max(1, Math.round(size * 0.1))}px ${Math.max(3, Math.round(size * 0.3))}px var(--gold-glow)`,
        // 약간의 inner highlight 로 입체감
        backgroundImage:
          "linear-gradient(135deg, var(--gold-bright), var(--gold-deep)), radial-gradient(at 30% 30%, rgba(255,255,255,0.35), transparent 50%)",
      }}
    />
  );
}
