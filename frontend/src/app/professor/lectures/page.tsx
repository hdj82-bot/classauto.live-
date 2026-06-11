"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/contexts/I18nContext";
import { PageContainer } from "@/components/professor/shell";
import LectureLibrarySection from "@/components/professor/LectureLibrarySection";

/**
 * /professor/lectures — 강의 보관함 (독립 페이지).
 *
 * 본문(폴더 사이드바 + 검색 + 강의 그리드 + 모달)은 `LectureLibrarySection`
 * 으로 추출되어 대시보드 홈과 공유된다. 이 페이지는 컨테이너 + 돌아가기
 * 버튼만 얹는 얇은 래퍼다.
 */
export default function LectureLibraryPage() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <PageContainer>
      <LectureLibrarySection
        title={t("library.pageTitle")}
        subtitle={t("library.pageSubtitle")}
        headerExtra={
          <button
            type="button"
            onClick={() => router.push("/professor/dashboard")}
            className="hidden sm:inline-flex items-center rounded-lg motion-safe:transition"
            style={{
              padding: "8px 14px",
              fontSize: 12.5,
              fontWeight: 500,
              color: "var(--text-muted)",
              background: "transparent",
              border: "1px solid var(--line)",
              cursor: "pointer",
            }}
          >
            ← {t("library.back")}
          </button>
        }
      />
    </PageContainer>
  );
}
