"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";

/**
 * Legacy redirect — `/professor/lecture/[id]/dashboard` → `/professor/analytics/[id]`.
 *
 * R5 라우팅 매트릭스 결정: 단일 진입점 정책. 이전에는 본 페이지가 자체
 * Tab(attendance / scores / engagement / cost) 4 + CSV 내보내기 UI 를
 * 가지고 있었지만, R3W3 의 `/professor/analytics/[lectureId]` 가 차트
 * 7종 + fan-out + 부분 실패 fallback 으로 같은 데이터를 더 풍부하게
 * 표시한다. 두 화면 공존 시 사용자 혼동 (어느 게 "진짜"?) 이 발생해 본
 * 페이지를 redirect-only 로 단순화. 외부 북마크·이메일 링크 호환을 위해
 * 페이지 자체는 유지하되 client navigation 으로 즉시 새 경로로 보낸다.
 *
 * `redirect()` (next/navigation server-side) 대신 client redirect 를 쓰는
 * 이유: 본 페이지가 `"use client"` 라 server-side redirect 사용 불가이고,
 * 외부에서 들어왔을 때 loading spinner 한 frame 정도는 허용 가능.
 */
export default function LegacyLectureDashboardRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    if (id) router.replace(`/professor/analytics/${id}`);
  }, [id, router]);

  return <LoadingSpinner fullScreen label={t("common.loading")} />;
}
