"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import FilterBar from "@/components/professor/inbox/FilterBar";
import InboxList from "@/components/professor/inbox/InboxList";
import ReportDownloadCard from "@/components/professor/inbox/ReportDownloadCard";
import { inboxApi } from "@/components/professor/inbox/inboxApi";
import {
  applyReportFilters,
  aggregateByCourse,
} from "@/components/professor/inbox/inboxFilters";
import { useInboxI18n } from "@/components/professor/inbox/useInboxI18n";
import type {
  InboxItem,
  InboxSort,
} from "@/components/professor/inbox/inboxTypes";
import {
  PageContainer,
  PageHeader,
  PrimaryButton,
  Card,
} from "@/components/professor/shell";

/**
 * /professor/inbox — Q&A 종합 리포트 페이지 (redesign 2026-05).
 *
 * 핵심: 학생이 강의에서 질문한 내용과 챗봇 답변을 강의별로 그루핑해 보여주고,
 * "전체 리포트 다운로드" 로 CSV 내보내기를 제공.
 *
 * 폐기된 요소 (이전 버전에서):
 *   - status 탭 (교수자 응답 필요 / AI 자동응답 / 범위 외)
 *   - RAG 유사도 메타·정렬·미답변 토글
 *   - 우측 상세 패널 + 교수자 답변 작성 / 일괄 확정 흐름
 *
 * 디자인: 라이트 베이지 + 골드 단일 톤 (`docs/design-system/colors.md` v2).
 */
export default function ProfessorInboxPage() {
  const { t } = useInboxI18n();
  const { toast } = useToast();

  const [items, setItems] = useState<InboxItem[]>([]);
  const [deferred, setDeferred] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [courseId, setCourseId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<InboxSort>("newest");

  const loadInbox = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const result = await inboxApi.list({
        resolve: (k) => t(k),
      });
      setItems(result.items);
      setDeferred(result.deferred);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  const visibleItems = useMemo(
    () => applyReportFilters(items, { courseId, search, sort }),
    [items, courseId, search, sort],
  );

  const courseAggregates = useMemo(() => aggregateByCourse(items), [items]);

  const currentCourseTitle = useMemo(() => {
    if (courseId === "all") return undefined;
    return courseAggregates.find((c) => c.courseId === courseId)?.courseTitle;
  }, [courseAggregates, courseId]);

  if (loading) {
    return <LoadingSpinner fullScreen label={t("page.loading")} />;
  }

  if (error) {
    return (
      <PageContainer width="narrow">
        <Card padding={40} radius={18}>
          <div className="text-center" role="alert">
            <p style={{ fontSize: 14, color: "var(--text)", marginBottom: 18 }}>
              {t("page.loadError")}
            </p>
            <PrimaryButton
              variant="primary"
              size="md"
              onClick={() => {
                void loadInbox();
                toast(t("page.retry"), "info");
              }}
            >
              {t("page.retry")}
            </PrimaryButton>
          </div>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div data-testid="inbox-page" className="space-y-5">
        <PageHeader
          eyebrow="Q&A 인박스"
          title={t("page.title")}
          subtitle={t("page.subtitle")}
          actions={
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                fontSize: 11.5,
                color: "var(--text-subtle)",
              }}
              data-testid="inbox-summary"
            >
              {t("page.summary", {
                total: items.length,
                courses: courseAggregates.length,
              })}
            </span>
          }
        />

        {deferred && (
          <div
            data-testid="inbox-deferred-banner"
            style={{
              borderRadius: 14,
              border: "1px solid var(--gold-medium)",
              background: "var(--gold-soft)",
              padding: "10px 14px",
              fontSize: 12,
              color: "var(--gold)",
            }}
          >
            {t("page.deferredNotice")}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5">
          <div className="lg:col-span-3">
            <FilterBar
              courseId={courseId}
              search={search}
              sort={sort}
              allItems={items}
              onChange={(next) => {
                setCourseId(next.courseId);
                setSearch(next.search);
                setSort(next.sort);
              }}
            />
          </div>

          <div className="lg:col-span-9 flex flex-col gap-4">
            <ReportDownloadCard
              courseId={courseId}
              courseTitle={currentCourseTitle}
            />
            <InboxList items={visibleItems} />
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
