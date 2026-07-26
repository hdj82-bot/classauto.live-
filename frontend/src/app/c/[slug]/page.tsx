import { Suspense } from "react";
import CourseEntryContent from "./CourseEntryContent";

/**
 * /c/[slug] — **강좌 단위** 학생 진입 (스펙 15 2단계).
 *
 * 종전 `/v/[slug]` 는 강의 단위라 12주차 수업이면 링크도 QR 도 12개고 교수자가 매주
 * 새로 뿌려야 했다(§1.1). 매주 배포가 곧 매주의 이탈 지점이다.
 *
 * 이 라우트는 학기 초 QR 1회로 끝내기 위한 것이다 — 한 번 등록하면 이후 발행되는
 * 강의가 자동으로 목록에 나타난다.
 *
 * `/v/[slug]` 는 **지우지 않는다.** 단일 강의만 공유하는 용도(특강·보강·외부 공개)가
 * 남아 있어 병존시킨다.
 */
export default function CourseEntryPage() {
  return (
    <Suspense fallback={null}>
      <CourseEntryContent />
    </Suspense>
  );
}
