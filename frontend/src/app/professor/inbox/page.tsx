"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import FilterBar from "@/components/professor/inbox/FilterBar";
import InboxList from "@/components/professor/inbox/InboxList";
import QAThread from "@/components/professor/inbox/QAThread";
import BulkAnswerBar from "@/components/professor/inbox/BulkAnswerBar";
import { inboxApi } from "@/components/professor/inbox/inboxApi";
import {
  applyFilters,
  DEFAULT_FILTERS,
  summariseStats,
} from "@/components/professor/inbox/inboxFilters";
import { useInboxI18n } from "@/components/professor/inbox/useInboxI18n";
import type {
  InboxAnswerPayload,
  InboxFilters,
  InboxItem,
  InboxStatsSummary,
} from "@/components/professor/inbox/inboxTypes";
import {
  PageContainer,
  PageHeader,
  PrimaryButton,
  Card,
} from "@/components/professor/shell";

/**
 * /professor/inbox — Q&A 인박스.
 *
 * 기획: docs/planning/05-instructor-pages.md §6 (Gmail 스타일 3단).
 *
 * 디자인:
 *   - 라이트 베이스 + 골드 포인트 (`docs/design-system/colors.md` §1).
 *   - 의미적 컬러 (rose=액션, emerald=좋음) 는 데이터 시각화에만 사용.
 *   - 마스코트·이모지 폰트 사용 안 함. SVG 인라인만.
 *   - prefers-reduced-motion: 모든 transition 에 motion-reduce 변종 적용.
 *
 * 백엔드 미흡 시: `inboxApi` 가 `/api/v1/inbox` → dashboard fan-out → mock
 * 순으로 자동 fallback. mock 사용 중이면 상단 배너 + 답변 임시저장 토스트.
 */
export default function ProfessorInboxPage() {
  const { t } = useInboxI18n();
  const { toast } = useToast();

  const [items, setItems] = useState<InboxItem[]>([]);
  const [stats, setStats] = useState<InboxStatsSummary | null>(null);
  const [deferred, setDeferred] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [filters, setFilters] = useState<InboxFilters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── 초기 로드 + 재시도 ────────────────────────────────────────────────────
  const loadInbox = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const result = await inboxApi.list({
        // mock 데이터의 i18n 키 (`mock.<scope>.<key>`) 를 패치 dict 에서 lookup.
        resolve: (k) => t(k),
      });
      setItems(result.items);
      setStats(result.stats);
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

  // ── 파생 상태 ─────────────────────────────────────────────────────────────
  const visibleItems = useMemo(
    () => applyFilters(items, filters),
    [items, filters],
  );
  const liveStats = useMemo(
    () => summariseStats(items, stats ?? undefined),
    [items, stats],
  );

  // 활성 탭이 바뀌거나 visibleItems 가 갱신될 때 selection 자동 정리.
  useEffect(() => {
    if (selectedId && !visibleItems.some((it) => it.id === selectedId)) {
      setSelectedId(null);
    }
    setSelectedIds((prev) => {
      const visibleIds = new Set(visibleItems.map((it) => it.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visibleIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [visibleItems, selectedId]);

  // ── 핸들러 ────────────────────────────────────────────────────────────────
  const handleSelect = (id: string) => {
    setSelectedId(id);
  };

  const handleToggleCheck = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleToggleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(visibleItems.map((it) => it.id)));
  };

  const applyLocal = (id: string, patch: Partial<InboxItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  };

  const handleAnswer = useCallback(
    async (id: string, payload: InboxAnswerPayload) => {
      const res = await inboxApi.answer(id, payload);
      if (res.ok) {
        const patch: Partial<InboxItem> = {
          professorAnswer: payload.body,
          professorAnswered: payload.mode === "send",
          reviewedAt: new Date().toISOString(),
        };
        if (payload.mode === "send") patch.responded = true;
        applyLocal(id, patch);
      }
      return res;
    },
    [],
  );

  const handleBulkConfirm = useCallback(async () => {
    const eligible = items.filter(
      (it) => selectedIds.has(it.id) && it.aiDraft && it.inScope,
    );
    if (eligible.length === 0) {
      return { successIds: [], failedIds: [], deferred: false };
    }
    const res = await inboxApi.bulkConfirm({
      ids: eligible.map((it) => it.id),
      useAiDraft: true,
      notify: true,
    });
    const successSet = new Set(res.successIds);
    const reviewedAt = new Date().toISOString();
    setItems((prev) =>
      prev.map((it) =>
        successSet.has(it.id)
          ? {
              ...it,
              professorAnswer: it.aiDraft,
              professorAnswered: true,
              responded: true,
              reviewedAt,
            }
          : it,
      ),
    );
    setSelectedIds(new Set());
    return res;
  }, [items, selectedIds]);

  const handleBulkMarkReviewed = useCallback(async () => {
    if (selectedIds.size === 0) {
      return { successIds: [], failedIds: [], deferred: false };
    }
    const ids = Array.from(selectedIds);
    const res = await inboxApi.bulkConfirm({
      ids,
      useAiDraft: false,
      notify: false,
    });
    const successSet = new Set(res.successIds);
    const reviewedAt = new Date().toISOString();
    setItems((prev) =>
      prev.map((it) =>
        successSet.has(it.id)
          ? { ...it, professorAnswered: true, reviewedAt }
          : it,
      ),
    );
    setSelectedIds(new Set());
    return res;
  }, [selectedIds]);

  const selectedItem = useMemo(
    () => items.find((it) => it.id === selectedId) ?? null,
    [items, selectedId],
  );

  const selectedItemsArray = useMemo(
    () => items.filter((it) => selectedIds.has(it.id)),
    [items, selectedIds],
  );

  // ── 로딩 / 에러 ───────────────────────────────────────────────────────────
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

  // ── 본 화면 ───────────────────────────────────────────────────────────────
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
            {t("filter.filterSummary", {
              total: liveStats.total,
              unanswered: liveStats.unanswered,
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
        {/* 좌측 사이드 + 상단 필터 (모바일에선 스택) */}
        <div className="lg:col-span-3">
          <FilterBar
            filters={filters}
            allItems={items}
            onChange={setFilters}
          />
        </div>

        {/* 중앙 리스트 */}
        <div className="lg:col-span-5">
          <InboxList
            items={visibleItems}
            selectedId={selectedId}
            selectedIds={selectedIds}
            onSelectItem={handleSelect}
            onToggleCheck={handleToggleCheck}
            onToggleSelectAll={handleToggleSelectAll}
          />
        </div>

        {/* 우측 상세 */}
        <div className="lg:col-span-4">
          <QAThread item={selectedItem} onAnswer={handleAnswer} />
        </div>
      </div>

      <BulkAnswerBar
        selectedItems={selectedItemsArray}
        onConfirm={handleBulkConfirm}
        onMarkReviewed={handleBulkMarkReviewed}
        onClear={() => setSelectedIds(new Set())}
      />
      </div>
    </PageContainer>
  );
}
