/**
 * /features 페이지 전용 keyframe 정의.
 *
 * - 본 프로젝트는 Tailwind v4 + globals.css 만 사용해 keyframe 의 글로벌 등록을
 *   최소화합니다. 4가지 페이지 전용 애니메이션 (animations.md §3.1~3.4) 은 이
 *   파일이 마운트될 때 한 번만 `<style>` 로 주입되어 다른 페이지에 새지 않게
 *   유지합니다.
 * - 클래스 prefix 는 `fhub-` (features hub) — 메인 사이트의 다른 컴포넌트와
 *   충돌하지 않도록.
 * - `prefers-reduced-motion: reduce` 는 마지막 블록에서 일괄 무력화. 호버
 *   `transform` 도 함께 제거해 정적 스냅샷 모습 유지.
 */
const FEATURES_KEYFRAMES = `
@keyframes fhub-morph-fade {
  0%, 30%   { opacity: 1; }
  50%, 100% { opacity: 0; }
}
@keyframes fhub-morph-fade-rev {
  0%, 30%   { opacity: 0; }
  50%, 100% { opacity: 1; }
}
@keyframes fhub-pulse-arrow {
  0%, 100% { opacity: 0.35; transform: translateX(-2px); }
  50%      { opacity: 1;    transform: translateX(2px); }
}
@keyframes fhub-shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}
@keyframes fhub-check-draw {
  to { stroke-dashoffset: 0; }
}
.fhub-morph-stage--ppt {
  animation: fhub-morph-fade 3s ease-in-out infinite;
}
.fhub-morph-stage--video {
  animation: fhub-morph-fade-rev 3s ease-in-out infinite;
}
.fhub-morph-arrow {
  animation: fhub-pulse-arrow 1.5s ease-in-out infinite;
}
.fhub-shimmer {
  background-image: linear-gradient(
    90deg,
    rgba(255, 182, 39, 0.85) 0%,
    rgba(255, 199, 77, 1) 50%,
    rgba(255, 182, 39, 0.85) 100%
  );
  background-size: 200% 100%;
  animation: fhub-shimmer 2.4s linear infinite;
}
.fhub-check {
  stroke-dasharray: 32;
  stroke-dashoffset: 32;
  animation: fhub-check-draw 0.6s ease-out 0.2s forwards;
}
.fhub-module-part {
  transition: transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fhub-module-quad:hover .fhub-module-part--tl,
.fhub-module-quad:focus-within .fhub-module-part--tl {
  transform: translate(-12px, -12px);
}
.fhub-module-quad:hover .fhub-module-part--tr,
.fhub-module-quad:focus-within .fhub-module-part--tr {
  transform: translate(12px, -12px);
}
.fhub-module-quad:hover .fhub-module-part--bl,
.fhub-module-quad:focus-within .fhub-module-part--bl {
  transform: translate(-12px, 12px);
}
.fhub-module-quad:hover .fhub-module-part--br,
.fhub-module-quad:focus-within .fhub-module-part--br {
  transform: translate(12px, 12px);
}
.fhub-iso {
  will-change: transform;
}
@media (prefers-reduced-motion: reduce) {
  .fhub-morph-stage--ppt,
  .fhub-morph-stage--video,
  .fhub-morph-arrow,
  .fhub-shimmer,
  .fhub-check {
    animation: none !important;
  }
  .fhub-morph-stage--ppt   { opacity: 0; }
  .fhub-morph-stage--video { opacity: 1; }
  .fhub-check { stroke-dashoffset: 0 !important; }
  .fhub-module-part { transition: none !important; }
  .fhub-module-quad:hover .fhub-module-part,
  .fhub-module-quad:focus-within .fhub-module-part { transform: none !important; }
  .fhub-iso { transform: none !important; }
}
`;

/**
 * Mounted once at the top of `FeaturesContent` so the `<style>` element joins
 * the document `<head>` via React 19 style hoisting (deduplicated by
 * `precedence`). Re-mounting is harmless — same precedence + content collapses
 * to one stylesheet.
 */
export default function FeaturesStyles() {
  return <style precedence="features-hub">{FEATURES_KEYFRAMES}</style>;
}
