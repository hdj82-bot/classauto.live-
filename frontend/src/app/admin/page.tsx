"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";

/**
 * /admin — 콘솔 개요. 스펙 14 §E 로 v2 토큰 전환.
 *
 * 종전 4개 스탯 카드는 항목마다 다른 색 dot(파랑·초록·보라·주황)을 달고 있었다.
 * 이는 §0-6(색은 크기만 인코딩, 카테고리컬 팔레트 폐기) 위반이라 제거하고,
 * 구분은 라벨·배치가 맡는다.
 */

interface Stats {
  total_users: number;
  total_courses: number;
  total_lectures: number;
  total_sessions: number;
  total_renders: number;
}

interface UnitCosts {
  heygen_usd_per_second: number;
  visionstory_usd_per_second: number;
  visionstory_to_heygen_ratio: number | null;
  expected_ratio: number;
  /** false = 한쪽만 env override 된 상태일 수 있다(스펙 13 §C-1a). */
  ratio_consistent: boolean;
}

interface BudgetService {
  service: string;
  mock: boolean;
  /** 지금 실제로 적용 중인 단가 — 코드 기본값과 env 가 갈려도 이걸로 드러난다. */
  effective_unit_cost_usd_per_second: number;
  daily_budget_usd: number;
  spent_today_usd: number;
  day_pct: number | null;
  monthly_budget_usd: number;
  spent_month_usd: number;
  month_pct: number | null;
  per_professor_month_usd: number;
  headroom_professors: number | null;
}

interface BudgetOverview {
  active_professor_count: number;
  warn_threshold_pct: number;
  unit_costs: UnitCosts;
  services: BudgetService[];
}

export default function AdminDashboardPage() {
  const { t } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [budget, setBudget] = useState<BudgetOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/api/v1/admin/stats");
        setStats(data);
      } catch {
        setError(t("admin.statsLoadError"));
      }
      // 예산 미터는 보조 정보 — 실패해도 개요 자체는 뜨게 둔다.
      try {
        const { data } = await api.get<BudgetOverview>("/api/v1/admin/budget");
        setBudget(data);
      } catch {
        setBudget(null);
      }
      setLoading(false);
    })();
  }, [t]);

  if (loading) return <LoadingSpinner fullScreen label={t("admin.statsLoadingLabel")} />;
  if (error) {
    return (
      <div className="py-20 text-center text-warning" role="alert">
        {error}
      </div>
    );
  }
  if (!stats) return null;

  // 부분 200 응답(필드 누락)에서도 .toLocaleString() 크래시가 나지 않게 기본값 0.
  const cards = [
    { label: t("admin.totalUsers"), value: stats.total_users ?? 0 },
    { label: t("admin.totalCourses"), value: stats.total_courses ?? 0 },
    { label: t("admin.totalLectures"), value: stats.total_lectures ?? 0 },
    { label: t("admin.totalSessions"), value: stats.total_sessions ?? 0 },
  ];

  return (
    <div>
      <h1 className="animate-fade-in-up font-display text-2xl font-extrabold tracking-tight text-text">
        {t("admin.dashboardTitle")}
      </h1>

      {/* 통계 타일 */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => (
          <div
            key={card.label}
            className={`animate-fade-in-up stagger-${i + 1} rounded-2xl border border-line bg-bg-card p-5 shadow-sm`}
          >
            <p className="text-xs text-text-muted">{card.label}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums text-text">
              {card.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* 예산 미터 (스펙 13 §C-1) — 전역 브레이커라 한 명이 한도를 채우면 나머지
          전원의 렌더가 동시에 멈춘다. 인원을 늘리기 전에 여기를 먼저 본다. */}
      {budget && (
        <div className="animate-fade-in-up stagger-5 mt-6 rounded-2xl border border-line bg-bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold text-text">{t("admin.budgetTitle")}</h2>
            <span className="text-xs tabular-nums text-text-muted">
              {t("admin.budgetActiveProfessors", {
                count: budget.active_professor_count,
              })}
            </span>
          </div>
          <p className="mt-1 text-xs text-text-subtle">{t("admin.budgetHint")}</p>

          {/* 단가 드리프트 경고 — VisionStory 단가는 HeyGen 에서 유도된 값이라
              한쪽만 env override 되면 코드가 전제하는 2배 관계가 깨진다.
              이게 조용히 넘어가서 아무도 모르던 게 §C-1a 를 만든 이유다. */}
          {!budget.unit_costs.ratio_consistent && (
            <p
              className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-xs font-semibold text-warning"
              role="alert"
            >
              {t("admin.budgetRatioWarning", {
                ratio: budget.unit_costs.visionstory_to_heygen_ratio ?? "—",
                expected: budget.unit_costs.expected_ratio,
              })}
            </p>
          )}

          <div className="mt-4 space-y-4">
            {budget.services.map((s) => (
              <BudgetMeter
                key={s.service}
                data={s}
                warnAt={budget.warn_threshold_pct}
                t={t}
              />
            ))}
          </div>
        </div>
      )}

      {/* 렌더링 통계 */}
      <div className="animate-fade-in-up stagger-5 mt-6 rounded-2xl border border-line bg-bg-card p-5 shadow-sm">
        <h2 className="text-base font-bold text-text">{t("admin.renderStatusTitle")}</h2>
        <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums text-gold-on-light">
          {(stats.total_renders ?? 0).toLocaleString()}
        </p>
        <p className="mt-1 text-sm text-text-muted">{t("admin.renderStatusDesc")}</p>
      </div>
    </div>
  );
}

/**
 * 서비스 하나의 월 예산 소진 막대.
 *
 * 색은 크기만 인코딩한다(§0-6) — 골드 시퀀셜. 다만 경고 임계(80%)를 넘으면
 * 의미 컬러로 바꾼다. 이건 카테고리 구분이 아니라 **상태 인디케이터**라 §0-6 이
 * 허용하는 용례다.
 */
function BudgetMeter({
  data,
  warnAt,
  t,
}: {
  data: BudgetService;
  warnAt: number;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const pct = data.month_pct;
  // 한도 0 = 브레이커 비활성. 0으로 나눈 값을 100%처럼 보여주면 안 된다.
  if (pct === null) {
    return (
      <div className="text-sm text-text-subtle">
        {t("admin.budgetDisabled", { service: data.service })}
      </div>
    );
  }

  const over = pct >= 100;
  const warn = pct >= warnAt;
  const barClass = over ? "bg-warning" : warn ? "bg-gold-deep" : "bg-seq-4";

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-text">
          {data.service}
          {data.mock && (
            <span className="ml-2 rounded bg-text/5 px-1.5 py-0.5 text-[10px] font-semibold text-text-subtle">
              mock
            </span>
          )}
        </span>
        <span className="font-mono text-xs tabular-nums text-text-muted">
          ${data.spent_month_usd.toFixed(2)} / ${data.monthly_budget_usd.toFixed(0)}
          <span className={`ml-2 font-semibold ${warn ? "text-warning" : "text-text-subtle"}`}>
            {pct.toFixed(1)}%
          </span>
        </span>
      </div>

      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-seq-1">
        <div
          className={`h-full rounded-full motion-safe:transition-all ${barClass}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      <div className="mt-1.5 flex flex-wrap justify-between gap-x-4 text-xs text-text-subtle">
        <span className="tabular-nums">
          {t("admin.budgetPerProfessor", {
            amount: data.per_professor_month_usd.toFixed(2),
          })}
          {/* 지금 적용 중인 단가를 함께 보여준다 — 어느 값으로 계산된 숫자인지
              화면에서 바로 알 수 있어야 드리프트가 숨지 않는다. */}
          <span className="ml-2 text-text-faint">
            {t("admin.budgetUnitCost", {
              rate: data.effective_unit_cost_usd_per_second,
            })}
          </span>
        </span>
        {/* "몇 명까지 더 초대해도 되나" — 1인당 소진이 0이면 추정 근거가 없어 숨긴다. */}
        {data.headroom_professors !== null && (
          <span className="tabular-nums">
            {t("admin.budgetHeadroom", { count: data.headroom_professors })}
          </span>
        )}
      </div>

      {warn && (
        <p className="mt-2 text-xs font-semibold text-warning" role="alert">
          {over
            ? t("admin.budgetOverWarning", { service: data.service })
            : t("admin.budgetNearWarning", { service: data.service, pct: warnAt })}
        </p>
      )}
    </div>
  );
}
