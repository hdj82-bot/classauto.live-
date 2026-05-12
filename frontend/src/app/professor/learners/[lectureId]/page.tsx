"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import LearnerTable, {
  type LearnerFilter,
  type LearnerSortKey,
} from "@/components/professor/learners/LearnerTable";
import BulkActions from "@/components/professor/learners/BulkActions";
import PrivacyNotice from "@/components/professor/learners/PrivacyNotice";
import { useLearnersI18n } from "@/components/professor/learners/useLearnersI18n";
import { mergeLearnerRows } from "@/components/professor/learners/risk";
import {
  PageContainer,
  PageHeader,
  Card,
} from "@/components/professor/shell";
import type {
  AttendanceStudent,
  EngagementStudent,
} from "@/components/professor/learners/types";

interface AttendanceResponse {
  lecture_id: string;
  summary?: { total: number; live: number; vod: number };
  students?: AttendanceStudent[];
}
interface EngagementResponse {
  lecture_id: string;
  summary?: Record<string, number>;
  students?: EngagementStudent[];
}

interface LectureMeta {
  title: string;
}

const FILTER_TABS: { key: LearnerFilter; labelKey: string }[] = [
  { key: "all", labelKey: "filterAll" },
  { key: "at-risk", labelKey: "filterAtRisk" },
  { key: "in-progress", labelKey: "filterInProgress" },
  { key: "completed", labelKey: "filterCompleted" },
];

/**
 * /professor/learners/{lectureId} — 단일 강의의 학습자 보드.
 *
 * 데이터 소스:
 *   - GET /api/v1/dashboard/{id}/attendance  → 진행률·출석 유형
 *   - GET /api/v1/dashboard/{id}/engagement  → 집중도·Q&A·응답률
 *   - GET /api/v1/dashboard/{id}/export/csv  → CSV 다운로드 (전체)
 *
 * 두 endpoint 응답을 user_id 기준으로 머지(`mergeLearnerRows`)해 학생 단위
 * 한 줄로 노출. 정답률(per-student) 과 학습자별 Q&A·평가 필터는 백엔드 미흡 →
 * BACKEND_ASKS.LEARNERS.md 참조.
 */
export default function LearnersBoardPage() {
  const router = useRouter();
  const { lectureId } = useParams<{ lectureId: string }>();
  const { t } = useLearnersI18n();
  const { toast } = useToast();

  const [attendance, setAttendance] = useState<AttendanceResponse | null>(null);
  const [engagement, setEngagement] = useState<EngagementResponse | null>(null);
  const [lectureMeta, setLectureMeta] = useState<LectureMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [filter, setFilter] = useState<LearnerFilter>("all");
  const [sortKey, setSortKey] = useState<LearnerSortKey>("progressPct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 강의 메타(제목) 보강 — 메타 endpoint 가 별도 없어 상위 강좌 listing 에서
  // 슬라이스. 실패해도 테이블은 정상 작동하도록 silent fallback.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: courses } = await api.get<{ id: string }[]>("/api/courses");
        for (const c of courses) {
          const { data: lecs } = await api.get<{ id: string; title: string }[]>(
            `/api/courses/${c.id}/lectures`,
          );
          const hit = lecs.find((l) => l.id === lectureId);
          if (hit) {
            if (!cancelled) setLectureMeta({ title: hit.title });
            return;
          }
        }
      } catch {
        // 메타 실패는 silent — 테이블은 lecture_id 만으로도 동작.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lectureId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(false);
        setLoading(true);
        const [a, e] = await Promise.all([
          api.get<AttendanceResponse>(`/api/v1/dashboard/${lectureId}/attendance`),
          api.get<EngagementResponse>(`/api/v1/dashboard/${lectureId}/engagement`),
        ]);
        if (cancelled) return;
        setAttendance(a.data);
        setEngagement(e.data);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lectureId]);

  const rows = useMemo(
    () => mergeLearnerRows(attendance?.students, engagement?.students),
    [attendance, engagement],
  );

  const onToggleSelect = useCallback((userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const onToggleSelectAll = useCallback(
    (next: boolean) => {
      setSelected(next ? new Set(rows.map((r) => r.userId)) : new Set());
    },
    [rows],
  );

  const onSort = useCallback((key: LearnerSortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const onOpenDetail = useCallback(
    (userId: string) => {
      router.push(`/professor/learners/${lectureId}/${userId}`);
    },
    [router, lectureId],
  );

  const onExportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const response = await api.get(
        `/api/v1/dashboard/${lectureId}/export/csv`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([response.data as BlobPart]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `lecture_${lectureId}_learners.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast(t("loadError"), "error");
    } finally {
      setExporting(false);
    }
  }, [lectureId, toast, t]);

  const onExportSelected = useCallback(() => {
    if (selected.size === 0) return;
    const header = [
      t("colName"),
      t("colStudentNumber"),
      t("colProgress"),
      t("colWatchRatio"),
      t("colQaCount"),
      t("colResponseRate"),
    ].join(",");
    const lines = rows
      .filter((r) => selected.has(r.userId))
      .map((r) =>
        [
          JSON.stringify(r.name ?? ""),
          JSON.stringify(r.studentNumber ?? ""),
          r.progressPct.toFixed(1),
          r.watchRatio.toFixed(1),
          r.qaCount,
          r.responseRate === null ? "" : r.responseRate.toFixed(1),
        ].join(","),
      );
    // BOM for Excel 한글 호환 — 백엔드 export 와 동일 정책
    const csv = "﻿" + [header, ...lines].join("\n");
    const url = window.URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `lecture_${lectureId}_selected_${selected.size}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }, [rows, selected, lectureId, t]);

  const onBulkPending = useCallback(() => {
    toast(t("toastNotImplemented"), "warning");
  }, [toast, t]);

  if (loading) return <LoadingSpinner fullScreen label={t("loading")} />;

  return (
    <PageContainer>
      <div className="space-y-6" data-testid="learners-board">
      <PageHeader
        eyebrow={
          <button
            type="button"
            onClick={() => router.push("/professor/learners")}
            style={{
              color: "var(--gold)",
              background: "transparent",
              border: "none",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              cursor: "pointer",
              fontFamily: "inherit",
              padding: 0,
            }}
          >
            ← {t("backToList")}
          </button>
        }
        title={t("tableTitle")}
        subtitle={t("tableSubtitle", {
          lecture: lectureMeta?.title ?? "",
          total: rows.length,
        })}
        actions={
          <button
            type="button"
            onClick={onExportCsv}
            disabled={exporting}
            style={{
              padding: "8px 14px",
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--text)",
              background: "var(--bg-card)",
              border: "1px solid var(--line-strong)",
              borderRadius: 10,
              cursor: exporting ? "not-allowed" : "pointer",
              opacity: exporting ? 0.5 : 1,
              fontFamily: "inherit",
            }}
          >
            {exporting ? t("exporting") : t("exportCsv")}
          </button>
        }
      />

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"
        >
          {t("loadError")}
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div
              className="inline-flex bg-gray-100 rounded-xl p-1 gap-1 w-full sm:w-auto overflow-x-auto"
              role="tablist"
              aria-label={t("filterAll")}
            >
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  role="tab"
                  data-testid={`learners-filter-${tab.key}`}
                  aria-selected={filter === tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                    filter === tab.key
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t(tab.labelKey)}
                </button>
              ))}
            </div>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchAriaLabel")}
              data-testid="learners-search"
              className="w-full sm:w-64 text-sm rounded-lg border border-gray-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <Card padding={20} radius={14}>
            <LearnerTable
              rows={rows}
              filter={filter}
              sortKey={sortKey}
              sortDir={sortDir}
              search={search}
              selectedIds={selected}
              onToggleSelect={onToggleSelect}
              onToggleSelectAll={onToggleSelectAll}
              onSort={onSort}
              onOpenDetail={onOpenDetail}
            />
          </Card>

          <BulkActions
            selectedCount={selected.size}
            onExportSelected={onExportSelected}
            onSendNudge={onBulkPending}
            onSendEncouragement={onBulkPending}
          />

          <PrivacyNotice />
        </>
      )}
      </div>
    </PageContainer>
  );
}
