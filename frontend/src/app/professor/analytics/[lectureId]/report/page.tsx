"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";
import {
  PageContainer,
  PageHeader,
  PrimaryButton,
  Card,
  displayStyle,
} from "@/components/professor/shell";
import {
  EvidenceStrip,
  WeakConceptList,
  RecommendationCards,
  ClassVsIndividual,
  InsightsCsvButton,
  useInsightsI18n,
} from "@/components/professor/analytics/insights";
import type { InsightsReport } from "@/components/professor/analytics/insights";

interface LectureMeta {
  id: string;
  title: string;
}

/**
 * 대면수업 솔루션 보고서 (RQ2 핵심 — 09 §10, 11 §H).
 *
 * GET /api/v1/insights/{id}/report 가 집계 evidence + AI 브리핑(요약·취약개념·
 * 권고·학급/개별)을 한 번에 내려준다. 합성 비용 가드레일(재생성 간격·월 상한)은
 * 백엔드가 담당하므로, "다시 생성" 은 force=refresh 로 전달만 한다.
 *
 * 라이트 베이지 + 골드 v2 토큰(professor shell), localStorage 미사용,
 * prefers-reduced-motion 존중(motion-safe). 한자 강조는 withHan 로 처리.
 */
export default function InsightsReportPage() {
  const params = useParams<{ lectureId: string }>();
  const lectureId = params.lectureId;
  const { locale } = useI18n();
  const { t } = useInsightsI18n();

  const [lecture, setLecture] = useState<LectureMeta | null>(null);
  const [report, setReport] = useState<InsightsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const fetchReport = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        // 강의 제목: 단일 GET /api/lectures/{id} 가 없어 courses → lectures fan-out
        // (분석 상세 페이지와 동일). 실패해도 보고서는 렌더.
        const lectureMetaPromise = (async () => {
          try {
            const { data: courses } = await api.get<{ id: string }[]>("/api/courses");
            for (const c of courses) {
              const { data: lecs } = await api.get<LectureMeta[]>(
                `/api/courses/${c.id}/lectures`,
              );
              const found = lecs.find((l) => l.id === lectureId);
              if (found) return found;
            }
          } catch {
            /* 무시 */
          }
          return null;
        })();

        const [meta, reportRes] = await Promise.all([
          lectureMetaPromise,
          api.get<InsightsReport>(
            `/api/v1/insights/${lectureId}/report${refresh ? "?refresh=true" : ""}`,
          ),
        ]);
        if (meta) setLecture(meta);
        setReport(reportRes.data);
      } catch {
        setError(t("loadError"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [lectureId, t],
  );

  useEffect(() => {
    fetchReport(false);
  }, [fetchReport, retry]);

  if (loading) {
    return <LoadingSpinner fullScreen label={t("loading")} />;
  }

  if (error || !report) {
    return (
      <PageContainer width="narrow">
        <Card padding={40} radius={18}>
          <div role="alert" className="text-center">
            <p style={{ fontSize: 14, color: "var(--text)", marginBottom: 18 }}>
              {error ?? t("loadError")}
            </p>
            <PrimaryButton variant="primary" size="md" onClick={() => setRetry((n) => n + 1)}>
              {t("retry")}
            </PrimaryButton>
          </div>
        </Card>
      </PageContainer>
    );
  }

  const { briefing, evidence } = report;
  const payload = briefing.payload;
  const generatedTs = briefing.generated_at
    ? new Date(briefing.generated_at).toLocaleString(locale === "ko" ? "ko-KR" : "en-US")
    : "";

  return (
    <PageContainer>
      <div lang={locale} />
      <PageHeader
        eyebrow={
          <Link
            href={`/professor/analytics/${lectureId}`}
            style={{ color: "var(--gold)", textDecoration: "none", fontSize: 11 }}
          >
            {t("back")}
          </Link>
        }
        title={t("title", { title: lecture?.title ?? lectureId })}
        subtitle={t("subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <PrimaryButton
              variant="secondary"
              size="md"
              onClick={() => fetchReport(true)}
              disabled={refreshing}
            >
              {refreshing ? t("refreshing") : t("refresh")}
            </PrimaryButton>
            <InsightsCsvButton lectureId={lectureId} />
          </div>
        }
      />

      {/* 생성 메타 — AI/규칙기반 배지 + 생성 시각 + 가드레일 안내 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 10px",
            borderRadius: 999,
            color: briefing.is_ai_generated ? "var(--gold)" : "var(--text-muted)",
            background: briefing.is_ai_generated ? "var(--gold-soft)" : "var(--bg-subtle)",
          }}
        >
          {briefing.is_ai_generated ? t("aiBadge") : t("ruleBadge")}
        </span>
        {generatedTs && (
          <span style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>
            {t("generatedAt", { ts: generatedTs })}
          </span>
        )}
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>· {t("modelHint")}</span>
      </div>

      <div className="space-y-6">
        <Section title={t("evidence.title")}>
          <EvidenceStrip evidence={evidence} />
        </Section>

        <Section title={t("summary.title")}>
          {payload.summary.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-subtle)" }}>{t("summary.empty")}</p>
          ) : (
            <ul className="space-y-2" style={{ margin: 0, paddingLeft: 18 }}>
              {payload.summary.map((s, i) => (
                <li key={i} style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.55 }}>
                  {s}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t("weakConcepts.title")} description={t("weakConcepts.subtitle")}>
          <WeakConceptList
            briefingConcepts={payload.weak_concepts}
            evidenceConcepts={evidence.weak_concepts}
          />
        </Section>

        <Section title={t("recommendations.title")} description={t("recommendations.subtitle")}>
          <RecommendationCards items={payload.recommendations} />
        </Section>

        <Section title={t("classVsIndividual.title")}>
          <ClassVsIndividual data={payload.class_vs_individual} />
        </Section>
      </div>
    </PageContainer>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card padding={24} radius={16} role="region">
      <header className="mb-5">
        <h2 style={{ ...displayStyle, margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
          {title}
        </h2>
        {description && (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-subtle)" }}>{description}</p>
        )}
      </header>
      {children}
    </Card>
  );
}
