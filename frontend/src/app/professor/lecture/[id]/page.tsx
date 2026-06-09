"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";

/**
 * Redirect stub — `/professor/lecture/[id]` → `/professor/studio/[id]`.
 *
 * 이전에는 본 페이지가 별도의 단순 "스크립트 에디터"(슬라이드 칩 + 발화
 * 텍스트 + 톤 + 시작/종료초 + Q&A pin)였다. studio 3단 wizard 와 편집기가
 * 둘로 갈라져, 발행·렌더 완료된 강의는 이 단순 에디터로, 제작 중 강의는
 * studio 로 보내지면서 "PPT 미리보기·번역·Q&A 아바타 패널이 사라졌다"는
 * 혼동이 발생했다. 편집 진입점을 studio 하나로 통일하고, 본 페이지는 외부
 * 북마크·이메일 링크 호환을 위해 redirect-only 로 단순화한다.
 *
 * `redirect()`(server-side) 대신 client redirect 를 쓰는 이유는 자매
 * 페이지 `dashboard/`(→ analytics) 와 동일: 본 트리가 `"use client"` 라
 * server-side redirect 사용 불가이고, loading spinner 한 frame 은 허용 가능.
 */
export default function LegacyLectureEditorRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    if (id) router.replace(`/professor/studio/${id}`);
  }, [id, router]);

  return <LoadingSpinner fullScreen label={t("common.loading")} />;
}
