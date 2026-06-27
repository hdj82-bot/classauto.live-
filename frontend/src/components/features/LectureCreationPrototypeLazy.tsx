"use client";

import dynamic from "next/dynamic";
import PrototypeSkeleton from "@/components/marketing/PrototypeSkeleton";

/**
 * `/features` 의 LectureCreationPrototype(2300+줄 인터랙티브 데모)을 클라이언트
 * 전용으로 지연 로딩하는 얇은 래퍼. features/page.tsx 는 server component 라
 * 거기서 직접 next/dynamic(ssr:false)을 쓸 수 없어(서버 컴포넌트 제약) 이 클라이언트
 * 래퍼를 둔다. SEO 본문은 데모 내부가 아니라 page metadata 가 담당하므로 ssr:false 가
 * 안전하며, 무거운 데모 JS 의 SSR·하이드레이션 비용을 없애 첫 페인트를 앞당긴다.
 */
const LectureCreationPrototype = dynamic(
  () => import("./lectureCreationPrototype/LectureCreationPrototype"),
  { ssr: false, loading: () => <PrototypeSkeleton /> },
);

export default function LectureCreationPrototypeLazy() {
  return <LectureCreationPrototype />;
}
