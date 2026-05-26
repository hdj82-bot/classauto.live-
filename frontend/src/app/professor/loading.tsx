import LoadingSpinner from "@/components/ui/LoadingSpinner";

/**
 * 교수자 라우트 세그먼트 전환 시 즉시 보여줄 로딩 경계.
 *
 * App Router 가 라우트 진입 동안 page 대신 이 fallback 을 곧바로 띄운다 —
 * 빈 화면 대기 대신 즉각적인 피드백. 공유 캐시로 페이지가 즉시 렌더되는
 * 경우에는 전환이 빨라 거의 노출되지 않는다.
 */
export default function ProfessorLoading() {
  return <LoadingSpinner fullScreen label="..." />;
}
