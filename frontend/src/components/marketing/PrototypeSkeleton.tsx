/**
 * 마케팅 프로토타입(features·analytics-example·student-guide) 의 지연 로딩 동안
 * 보여 줄 가벼운 스켈레톤. 큰 인터랙티브 데모는 next/dynamic(ssr:false)으로 분리해
 * 초기 JS·하이드레이션 비용을 줄이고, 그 사이 레이아웃 시프트(CLS)를 막기 위해
 * 충분한 최소 높이를 차지한다. prefers-reduced-motion 에서는 펄스를 끈다.
 */
export default function PrototypeSkeleton() {
  return (
    <div
      className="max-w-5xl mx-auto px-4 sm:px-6 py-16"
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{ minHeight: "70vh" }}
    >
      <span className="sr-only">불러오는 중…</span>
      <div className="animate-pulse motion-reduce:animate-none flex flex-col gap-6">
        <div className="h-8 w-1/2 rounded-lg bg-black/[0.06]" />
        <div className="h-4 w-3/4 rounded bg-black/[0.05]" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-44 rounded-2xl bg-black/[0.05]" />
          <div className="h-44 rounded-2xl bg-black/[0.05]" />
        </div>
        <div className="h-64 rounded-2xl bg-black/[0.05]" />
      </div>
    </div>
  );
}
