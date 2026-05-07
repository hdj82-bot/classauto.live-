/**
 * Page-scoped <defs> for SVG gradients (icons.md §3 — `grad-electric` 등).
 *
 * 한 페이지에서 한 번만 마운트되면 모든 자식 SVG 가 `url(#fhub-grad-...)`
 * 으로 참조할 수 있다. 다른 워크트리/페이지가 이미 같은 id 를 정의해도
 * 충돌하지 않도록 prefix `fhub-` 를 적용.
 *
 * 위치를 fixed 로 두지 않고 레이아웃 안에 width/height 0 으로 흘려보내야
 * Safari 가 일관되게 해석한다 (절대 위치 + 0x0 svg 는 사파리에서 reference
 * 누락 사례가 있음).
 */
export default function GradientDefs() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", overflow: "hidden", pointerEvents: "none" }}
    >
      <defs>
        <linearGradient id="fhub-grad-electric" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFB627" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
        <linearGradient id="fhub-grad-violet" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
        <linearGradient id="fhub-grad-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
        <linearGradient id="fhub-grad-pink" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F472B6" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
      </defs>
    </svg>
  );
}
