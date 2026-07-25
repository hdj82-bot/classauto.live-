"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/contexts/I18nContext";

// 스펙 13 · A(테스터별 사용량 롤업) + D(활성화 퍼널). 백엔드:
//   GET /api/v1/admin/beta-overview?cohort= , /api/v1/admin/funnel?cohort=
//   GET /api/v1/admin/users/{id}/usage (드릴다운)
//
// 스펙 14 §E — v2 토큰 전환 + 행 오버플로 메뉴.
//   · 드릴다운은 **인라인 확장을 유지**한다. /admin/testers/[id] 라우트로의 교체는
//     그 화면을 만드는 B 의 몫이고, 여기서 먼저 링크를 걸면 B 전까지 404 다.
//   · 오버플로 메뉴에는 PRO 분석 토글만 둔다. 역할 변경·유저 삭제는 /admin/users
//     에 남기고 메뉴의 딥링크로 도달 경로를 유지한다(§5 후단).

interface InstructorRow {
  id: string;
  email: string;
  name: string | null;
  cohort: string | null;
  last_active_at: string | null;
  courses_count: number;
  lectures_count: number;
  published_lectures_count: number;
  renders_count: number;
  spend_this_month_usd: number;
  spend_total_usd: number;
  spend_monthly_avg_usd: number;
}

interface FunnelStep {
  step: string;
  count: number;
  conversion_from_prev_pct: number;
}

interface UsageDetail {
  id: string;
  email: string;
  cohort: string | null;
  beta_consented_at: string | null;
  lectures_count: number;
  lectures: {
    id: string;
    title: string;
    is_published: boolean;
    course_title: string;
    updated_at: string | null;
  }[];
  spend_total_usd: number;
  monthly_spend: { year: number; month: number; cost_usd: number }[];
}

const FUNNEL_LABELS: Record<string, string> = {
  invited: "betaFunnelInvited",
  signed_up: "betaFunnelSignedUp",
  created_course: "betaFunnelCreatedCourse",
  published_lecture: "betaFunnelPublishedLecture",
  ran_student_session: "betaFunnelRanSession",
};

// PRO 분석 상태 조인 시 훑을 최대 페이지 수. 베타 규모(교수자 수십 명)에선 1페이지로
// 끝나지만, 모집단이 이보다 커지면 상태를 모르는 채 토글을 보여주는 대신 숨긴다.
const PRO_JOIN_PAGE_LIMIT = 100;
const PRO_JOIN_MAX_PAGES = 5;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export default function AdminBetaPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [cohort, setCohort] = useState<string>("");
  const [cohortOptions, setCohortOptions] = useState<string[]>([]);
  const [instructors, setInstructors] = useState<InstructorRow[]>([]);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 드릴다운 — 행 클릭 시 펼침. id → 상세(또는 "loading"/"error").
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, UsageDetail | "loading" | "error">>({});

  // PRO 분석 토글 상태. beta-overview 응답에 analytics_pro_enabled 가 없고 단일 유저
  // 조회 엔드포인트도 없어서, /admin/users 목록(교수자 필터)을 훑어 id 로 조인한다.
  // 백엔드 변경 0 제약(§E) 때문이며, 추후 beta-overview 가 이 필드를 실어주면 삭제 대상.
  const [proMap, setProMap] = useState<Record<string, boolean> | null>(null);
  const [proBusy, setProBusy] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const load = useCallback(async (isCancelled?: () => boolean) => {
    setLoading(true);
    setError(null);
    try {
      const ovParams = new URLSearchParams({ limit: "200" });
      const fnParams = new URLSearchParams();
      if (cohort) {
        ovParams.set("cohort", cohort);
        fnParams.set("cohort", cohort);
      }
      const fnQuery = fnParams.toString();
      const [ov, fn] = await Promise.all([
        api.get(`/api/v1/admin/beta-overview?${ovParams.toString()}`),
        api.get(`/api/v1/admin/funnel${fnQuery ? `?${fnQuery}` : ""}`),
      ]);
      if (isCancelled?.()) return;
      const rows: InstructorRow[] = ov.data.instructors ?? [];
      setInstructors(rows);
      setFunnel(fn.data.steps ?? []);
      // 코호트 옵션은 필터가 비어 있을 때(전체)만 갱신 — 전체 모집단 기준.
      if (!cohort) {
        const set = new Set<string>();
        rows.forEach((r) => r.cohort && set.add(r.cohort));
        setCohortOptions(Array.from(set).sort());
      }
    } catch {
      if (isCancelled?.()) return;
      setError(t("admin.betaLoadError"));
    }
    if (!isCancelled?.()) setLoading(false);
  }, [cohort, t]);

  // load() 첫 줄에서 동기 setState(setLoading/setError) 하므로, effect 동기 경로에서
  // 직접 호출하면 react-hooks/set-state-in-effect 린트가 막는다. rAF 로 다음 프레임에
  // 비동기 실행한다(레포 표준 회피책 — DEPLOYMENT_PROGRESS §v2 CI 함정 참조).
  // 코호트 필터 변경 시 이전 요청의 늦은 응답이 새 상태를 덮어쓰지 않게 취소 플래그.
  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      void load(() => cancelled);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [load]);

  // PRO 상태 조인 — 코호트 필터와 무관하게 교수자 전체를 한 번만 훑는다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map: Record<string, boolean> = {};
      try {
        for (let page = 1; page <= PRO_JOIN_MAX_PAGES; page++) {
          const { data } = await api.get("/api/v1/admin/users", {
            params: { page, limit: PRO_JOIN_PAGE_LIMIT, role: "professor" },
          });
          if (cancelled) return;
          const users: { id: string; analytics_pro_enabled?: boolean }[] = data.users ?? [];
          users.forEach((u) => {
            map[u.id] = u.analytics_pro_enabled ?? false;
          });
          if (users.length < PRO_JOIN_PAGE_LIMIT) break;
          // 모집단이 상한을 넘으면 일부만 아는 상태다 — 토글을 숨긴다(잘못된 상태 표시 방지).
          if (page === PRO_JOIN_MAX_PAGES) return;
        }
        setProMap(map);
      } catch {
        // 조인 실패 시 토글을 숨기고 딥링크만 남긴다. 목록 자체는 영향 없음.
        if (!cancelled) setProMap(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 메뉴 바깥 클릭·Esc 로 닫기.
  // click 리스너는 **다음 틱**에 건다. 메뉴를 여는 그 클릭이 아직 document 까지
  // 올라오는 중이라, 즉시 등록하면 열자마자 닫힌다.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const timer = window.setTimeout(() => document.addEventListener("click", close), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const toggleRow = async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!detail[id] || detail[id] === "error") {
      setDetail((d) => ({ ...d, [id]: "loading" }));
      try {
        const { data } = await api.get(`/api/v1/admin/users/${id}/usage`);
        setDetail((d) => ({ ...d, [id]: data }));
      } catch {
        setDetail((d) => ({ ...d, [id]: "error" }));
      }
    }
  };

  // §5 기존 쓰기 — 감사 로그 user.set_analytics_pro 1행이 남는다.
  const toggleAnalyticsPro = async (id: string, current: boolean) => {
    setProBusy(id);
    try {
      await api.patch(`/api/v1/admin/users/${id}`, null, {
        params: { analytics_pro_enabled: !current },
      });
      setProMap((m) => (m ? { ...m, [id]: !current } : m));
      toast(t("admin.userAnalyticsProChanged"), "success");
    } catch {
      toast(t("admin.userAnalyticsProChangeError"), "error");
    }
    setProBusy(null);
    setMenuOpen(null);
  };

  if (loading && instructors.length === 0) {
    return <LoadingSpinner fullScreen label={t("admin.betaLoadingLabel")} />;
  }
  if (error) {
    return (
      <div className="py-20 text-center text-warning" role="alert">
        {error}
      </div>
    );
  }

  const maxFunnel = Math.max(...funnel.map((s) => s.count), 1);

  return (
    <div>
      <div className="animate-fade-in-up mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-text">
          {t("admin.betaTitle")}
        </h1>
        <select
          value={cohort}
          onChange={(e) => setCohort(e.target.value)}
          className="rounded-lg border border-line-strong bg-bg-card px-3 py-2 text-sm text-text tabular-nums outline-none focus:border-gold-on-light"
          aria-label={t("admin.betaCohortAll")}
        >
          <option value="">{t("admin.betaCohortAll")}</option>
          {cohortOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* D: 활성화 퍼널 */}
      <div className="animate-fade-in-up stagger-1 mb-6 rounded-2xl border border-line bg-bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-base font-bold text-text">{t("admin.betaFunnelTitle")}</h2>
        <div className="space-y-3">
          {funnel.map((s) => (
            <div key={s.step} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-sm font-medium text-text-muted">
                {t(`admin.${FUNNEL_LABELS[s.step] ?? "betaFunnelInvited"}`)}
              </span>
              {/* 막대는 골드 단일색 — 길이가 수를 인코딩한다(§0-6). */}
              <div className="h-6 flex-1 overflow-hidden rounded-full bg-seq-1">
                <div
                  className="flex h-full items-center justify-end rounded-full bg-seq-4 pr-2 motion-safe:transition-all"
                  style={{ width: `${(s.count / maxFunnel) * 100}%`, minWidth: "2rem" }}
                >
                  <span className="text-xs font-semibold tabular-nums text-white">{s.count}</span>
                </div>
              </div>
              <span className="w-14 text-right text-xs tabular-nums text-text-subtle">
                {t("admin.betaFunnelConversion", { pct: s.conversion_from_prev_pct })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* A: 테스터별 사용량 롤업 */}
      <div className="animate-fade-in-up stagger-2 rounded-2xl border border-line bg-bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-base font-bold text-text">{t("admin.betaTableTitle")}</h2>
        {instructors.length === 0 ? (
          <p className="text-sm text-text-subtle">{t("admin.betaNoInstructors")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg-subtle">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-text-muted">{t("admin.betaColInstructor")}</th>
                  <th className="px-3 py-2 text-left font-medium text-text-muted">{t("admin.betaColCohort")}</th>
                  <th className="px-3 py-2 text-right font-medium text-text-muted">{t("admin.betaColCourses")}</th>
                  <th className="px-3 py-2 text-right font-medium text-text-muted">{t("admin.betaColLectures")}</th>
                  <th className="px-3 py-2 text-right font-medium text-text-muted">{t("admin.betaColPublished")}</th>
                  <th className="px-3 py-2 text-right font-medium text-text-muted">{t("admin.betaColRenders")}</th>
                  <th className="px-3 py-2 text-right font-medium text-text-muted">{t("admin.betaColSpendMonth")}</th>
                  <th className="px-3 py-2 text-right font-medium text-text-muted">{t("admin.betaColSpendTotal")}</th>
                  <th className="px-3 py-2 text-right font-medium text-text-muted">{t("admin.betaColSpendAvg")}</th>
                  <th className="px-3 py-2 text-left font-medium text-text-muted">{t("admin.betaColLastActive")}</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">{t("admin.betaRowMenu")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {instructors.map((r) => (
                  <RowWithDrilldown
                    key={r.id}
                    row={r}
                    expanded={expanded === r.id}
                    detail={detail[r.id]}
                    onToggle={() => toggleRow(r.id)}
                    proEnabled={proMap ? (proMap[r.id] ?? false) : null}
                    proBusy={proBusy === r.id}
                    menuOpen={menuOpen === r.id}
                    onMenuToggle={() => setMenuOpen(menuOpen === r.id ? null : r.id)}
                    onToggleAnalyticsPro={toggleAnalyticsPro}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function RowWithDrilldown({
  row,
  expanded,
  detail,
  onToggle,
  proEnabled,
  proBusy,
  menuOpen,
  onMenuToggle,
  onToggleAnalyticsPro,
  t,
}: {
  row: InstructorRow;
  expanded: boolean;
  detail: UsageDetail | "loading" | "error" | undefined;
  onToggle: () => void;
  /** null = 상태를 알 수 없음(조인 실패/모집단 초과) → 토글을 숨긴다. */
  proEnabled: boolean | null;
  proBusy: boolean;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onToggleAnalyticsPro: (id: string, current: boolean) => void;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  return (
    <>
      <tr
        className={`cursor-pointer transition hover:bg-bg-hover ${expanded ? "bg-gold/10" : ""}`}
        onClick={onToggle}
      >
        <td className="px-3 py-2">
          <div className="font-medium text-text">{row.name || "—"}</div>
          <div className="text-xs text-text-subtle">{row.email}</div>
        </td>
        <td className="px-3 py-2 tabular-nums text-text-muted">{row.cohort || "—"}</td>
        <td className="px-3 py-2 text-right tabular-nums text-text-muted">{row.courses_count}</td>
        <td className="px-3 py-2 text-right tabular-nums text-text-muted">{row.lectures_count}</td>
        <td className="px-3 py-2 text-right tabular-nums text-text-muted">{row.published_lectures_count}</td>
        <td className="px-3 py-2 text-right tabular-nums text-text-muted">{row.renders_count}</td>
        <td className="px-3 py-2 text-right font-mono tabular-nums text-text-muted">${row.spend_this_month_usd.toFixed(2)}</td>
        <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-text">${row.spend_total_usd.toFixed(2)}</td>
        <td className="px-3 py-2 text-right font-mono tabular-nums text-text-muted">${row.spend_monthly_avg_usd.toFixed(2)}</td>
        <td className="px-3 py-2 tabular-nums text-text-muted">{fmtDate(row.last_active_at)}</td>

        {/* 오버플로 메뉴 — 행 클릭(드릴다운)과 충돌하지 않게 전파를 끊는다. */}
        <td className="relative px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={onMenuToggle}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t("admin.betaRowMenu")}
            className="rounded-lg px-1.5 py-1 text-text-subtle transition hover:bg-bg-hover hover:text-text"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="12" cy="19" r="1.6" />
            </svg>
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="animate-fade-in absolute top-full right-3 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-line bg-bg-card text-left shadow-lg"
            >
              {proEnabled !== null && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={proBusy}
                  onClick={() => onToggleAnalyticsPro(row.id, proEnabled)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-text transition hover:bg-bg-hover disabled:opacity-60"
                >
                  <span>{t("admin.betaMenuAnalyticsPro")}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      proEnabled ? "bg-success/10 text-success" : "bg-text/5 text-text-subtle"
                    }`}
                  >
                    {proEnabled ? t("admin.analyticsProOn") : t("admin.analyticsProOff")}
                  </span>
                </button>
              )}
              {/* 역할 변경·유저 삭제는 /admin/users 에 남는다(§5 후단). 사이드바에서만
                  뺐으므로 도달 경로를 여기서 유지한다. */}
              <Link
                href="/admin/users"
                role="menuitem"
                className="block border-t border-line px-3 py-2.5 text-xs font-medium text-text-muted transition hover:bg-bg-hover hover:text-text"
              >
                {t("admin.betaMenuManageUsers")}
              </Link>
            </div>
          )}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-bg-subtle">
          <td colSpan={11} className="px-4 py-4">
            {detail === "loading" || detail === undefined ? (
              <p className="text-sm text-text-subtle">…</p>
            ) : detail === "error" ? (
              <p className="text-sm text-warning">{t("admin.betaDrilldownLoadError")}</p>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-sm font-bold text-text-muted">{t("admin.betaDrilldownLectures")}</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        detail.beta_consented_at
                          ? "bg-success/10 text-success"
                          : "bg-warning/10 text-warning"
                      }`}
                    >
                      {t("admin.betaDrilldownConsent")}:{" "}
                      {detail.beta_consented_at
                        ? t("admin.betaDrilldownConsentYes")
                        : t("admin.betaDrilldownConsentNo")}
                    </span>
                  </div>
                  {detail.lectures.length === 0 ? (
                    <p className="text-sm text-text-subtle">{t("admin.betaDrilldownEmpty")}</p>
                  ) : (
                    <ul className="space-y-1">
                      {detail.lectures.map((l) => (
                        <li key={l.id} className="flex items-center gap-2 text-sm text-text-muted">
                          <span
                            aria-hidden
                            className={`h-1.5 w-1.5 rounded-full ${l.is_published ? "bg-success" : "bg-text-faint"}`}
                          />
                          <span className="truncate">{l.title}</span>
                          <span className="text-xs text-text-subtle">· {l.course_title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-bold text-text-muted">{t("admin.betaDrilldownMonthly")}</h3>
                  {detail.monthly_spend.length === 0 ? (
                    <p className="text-sm text-text-subtle">—</p>
                  ) : (
                    <ul className="space-y-1">
                      {detail.monthly_spend.map((m) => (
                        <li key={`${m.year}-${m.month}`} className="flex max-w-xs justify-between text-sm text-text-muted">
                          <span className="tabular-nums">{t("admin.yearMonth", { year: m.year, month: m.month })}</span>
                          <span className="font-mono tabular-nums">${m.cost_usd.toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
