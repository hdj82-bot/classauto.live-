"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, feedbackApi, type FeedbackItem } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";

/**
 * /admin/testers/[id] — 테스터 상세. 스펙 14 §B.
 *
 * 프로토타입 08 "테스터 상세": 상단 4 스탯 타일, 좌측 "만든 자료" 카드 그리드
 * (재렌더 잔여 pip), 우측 월별 지출 + 최근 오류, 하단 그 사람의 피드백.
 *
 * `/admin/beta` 의 인라인 드릴다운을 이 라우트가 대체한다(§B — E 시점엔 인라인을
 * 유지했다가 이 화면이 생기면서 교체).
 */

type Stage = "ok" | "run" | "fail" | "none";

interface ArtifactLecture {
  id: string;
  title: string;
  course_title: string | null;
  is_published: boolean;
  updated_at: string | null;
  thumbnail_url: string | null;
  slide_count: number;
  stages: { ppt: Stage; script: Stage; avatar: Stage; quiz: Stage };
  question_count: number;
  avatar_render_count: number;
  avatar_render_cap: number;
  failed_render_count: number;
  spend_usd: number;
}

interface ArtifactsResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    cohort: string | null;
    beta_consented_at: string | null;
    school: string | null;
    department: string | null;
  };
  lectures: ArtifactLecture[];
}

interface UsageDetail {
  spend_total_usd: number;
  monthly_spend: { year: number; month: number; cost_usd: number }[];
}

export default function AdminTesterDetailPage() {
  const params = useParams<{ id: string | string[] }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const { t } = useI18n();

  const [data, setData] = useState<ArtifactsResponse | null>(null);
  const [usage, setUsage] = useState<UsageDetail | null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isCancelled?: () => boolean) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [art, use] = await Promise.all([
        api.get<ArtifactsResponse>(`/api/v1/admin/users/${id}/artifacts`),
        // 월별 지출은 기존 usage 엔드포인트가 이미 준다 — 중복 구현하지 않는다.
        api.get<UsageDetail>(`/api/v1/admin/users/${id}/usage`),
      ]);
      if (isCancelled?.()) return;
      setData(art.data);
      setUsage(use.data);
    } catch {
      if (isCancelled?.()) return;
      setError(t("admin.testerLoadError"));
    }
    if (!isCancelled?.()) setLoading(false);
  }, [id, t]);

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

  // 그 사람의 피드백. 백엔드 목록에 user 필터가 없어 받아와서 이메일로 거른다 —
  // 베타 규모(피드백 수백 건)에선 충분하고, 필터 파라미터 추가는 별건이다.
  useEffect(() => {
    if (!data?.user.email) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: res } = await feedbackApi.adminList({});
        if (cancelled) return;
        const mine = (res.feedback ?? []).filter(
          (f) => f.user_email === data.user.email,
        );
        setFeedback(mine);
      } catch {
        if (!cancelled) setFeedback([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data?.user.email]);

  if (loading) return <LoadingSpinner fullScreen label={t("admin.testerLoadingLabel")} />;
  if (error) {
    return (
      <div className="py-20 text-center text-warning" role="alert">
        {error}
      </div>
    );
  }
  if (!data) return null;

  const lectures = data.lectures;
  const published = lectures.filter((l) => l.is_published).length;
  const totalSpend = lectures.reduce((sum, l) => sum + l.spend_usd, 0);
  const failedTotal = lectures.reduce((sum, l) => sum + l.failed_render_count, 0);
  const withErrors = lectures.filter((l) => l.failed_render_count > 0);

  const tiles = [
    { label: t("admin.testerStatLectures"), value: lectures.length },
    { label: t("admin.testerStatPublished"), value: published },
    { label: t("admin.testerStatSpend"), value: `$${totalSpend.toFixed(2)}` },
    { label: t("admin.testerStatFailed"), value: failedTotal, alert: failedTotal > 0 },
  ];

  return (
    <div>
      <div className="animate-fade-in-up">
        <Link
          href="/admin/beta"
          className="inline-flex items-center gap-1 text-xs font-semibold text-text-subtle transition hover:text-gold-on-light"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {t("admin.navBeta")}
        </Link>
        <h1 className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-text">
          {data.user.name || data.user.email}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
          <span>{data.user.email}</span>
          {data.user.cohort && (
            <span className="rounded-full bg-gold/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-gold-on-light">
              {data.user.cohort}
            </span>
          )}
          {(data.user.school || data.user.department) && (
            <span className="text-text-subtle">
              {data.user.school ?? "—"} · {data.user.department ?? "—"}
            </span>
          )}
        </p>
      </div>

      {/* 상단 4 스탯 타일 */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile, i) => (
          <div
            key={tile.label}
            className={`animate-fade-in-up stagger-${i + 1} rounded-2xl border bg-bg-card p-5 shadow-sm ${
              tile.alert ? "border-warning/30" : "border-line"
            }`}
          >
            <p className="text-xs text-text-muted">{tile.label}</p>
            <p
              className={`mt-2 text-3xl font-bold tracking-tight tabular-nums ${
                tile.alert ? "text-warning" : "text-text"
              }`}
            >
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        {/* 좌측 — 만든 자료 */}
        <div className="animate-fade-in-up stagger-2 rounded-2xl border border-line bg-bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-base font-bold text-text">
            {t("admin.testerArtifactsTitle")}
          </h2>
          {lectures.length === 0 ? (
            <p className="text-sm text-text-subtle">{t("admin.testerNoArtifacts")}</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {lectures.map((lec) => (
                <ArtifactCard key={lec.id} lecture={lec} t={t} />
              ))}
            </div>
          )}
        </div>

        {/* 우측 — 월별 지출 + 최근 오류 */}
        <div className="space-y-6">
          <div className="animate-fade-in-up stagger-3 rounded-2xl border border-line bg-bg-card p-5 shadow-sm">
            <h2 className="mb-3 text-base font-bold text-text">
              {t("admin.testerMonthlySpend")}
            </h2>
            {!usage?.monthly_spend?.length ? (
              <p className="text-sm text-text-subtle">—</p>
            ) : (
              <ul className="space-y-1.5">
                {usage.monthly_spend.map((m) => (
                  <li
                    key={`${m.year}-${m.month}`}
                    className="flex justify-between text-sm text-text-muted"
                  >
                    <span className="tabular-nums">
                      {t("admin.yearMonth", { year: m.year, month: m.month })}
                    </span>
                    <span className="tabular-nums text-text">${m.cost_usd.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="animate-fade-in-up stagger-4 rounded-2xl border border-line bg-bg-card p-5 shadow-sm">
            <h2 className="mb-3 text-base font-bold text-text">
              {t("admin.testerRecentErrors")}
            </h2>
            {withErrors.length === 0 ? (
              <p className="text-sm text-text-subtle">{t("admin.testerNoErrors")}</p>
            ) : (
              <ul className="space-y-2">
                {withErrors.map((lec) => (
                  <li key={lec.id} className="text-sm">
                    {/* 이 테스터로 좁힌 이슈 인박스로 넘긴다 — 원문·triage 는 거기 몫(§C).
                        강의별 render_id 를 여기서 알 수 없어(artifacts 응답에 없다)
                        user_id 필터까지만 걸고, 드로어는 운영자가 해당 행에서 연다. */}
                    <Link
                      href={`/admin/issues?user_id=${id}`}
                      className="group flex items-center gap-2 transition"
                    >
                      <span className="text-text group-hover:text-gold-on-light">
                        {lec.title}
                      </span>
                      <span className="tabular-nums text-warning">
                        {t("admin.testerFailedCount", { count: lec.failed_render_count })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {/* 오류 원문(error_message)과 triage 는 스펙 §C 이슈 인박스의 몫이다.
                여기서는 어느 강의가 깨졌는지까지 + 인박스로 가는 경로만 준다. */}
            <p className="mt-3 text-xs text-text-faint">{t("admin.testerErrorsHint")}</p>
            {withErrors.length > 0 && (
              <Link
                href={`/admin/issues?user_id=${id}`}
                className="mt-1.5 inline-block text-xs font-semibold text-gold-on-light transition hover:underline"
              >
                {t("admin.navIssues")} →
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* 하단 — 그 사람의 피드백 */}
      <div className="animate-fade-in-up stagger-5 mt-6 rounded-2xl border border-line bg-bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-base font-bold text-text">
          {t("admin.testerFeedbackTitle")}
        </h2>
        {feedback.length === 0 ? (
          <p className="text-sm text-text-subtle">{t("admin.testerNoFeedback")}</p>
        ) : (
          <ul className="space-y-3">
            {feedback.map((fb) => (
              <li key={fb.id} className="border-l-2 border-line-strong pl-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-bg-subtle px-2 py-0.5 font-semibold text-text-muted">
                    {t(`feedback.category.${fb.category}`)}
                  </span>
                  <span className="tabular-nums text-text-subtle">
                    {fb.created_at.slice(0, 10)}
                  </span>
                  {fb.page && <span className="text-text-faint">{fb.page}</span>}
                </div>
                <p className="mt-1 text-sm whitespace-pre-wrap text-text">{fb.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** 강의 1개 카드 — 4단계 칩 + 재렌더 잔여 pip. */
function ArtifactCard({
  lecture,
  t,
}: {
  lecture: ArtifactLecture;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const stages: { key: keyof ArtifactLecture["stages"]; label: string }[] = [
    { key: "ppt", label: t("admin.stagePpt") },
    { key: "script", label: t("admin.stageScript") },
    { key: "avatar", label: t("admin.stageAvatar") },
    { key: "quiz", label: t("admin.stageQuiz") },
  ];

  // 의미 컬러는 상태 칩에만(§0-6). 나머지는 중립.
  const chipClass = (s: Stage) =>
    s === "ok"
      ? "bg-success/10 text-success"
      : s === "run"
        ? "bg-info/10 text-info"
        : s === "fail"
          ? "bg-warning/10 text-warning"
          : "bg-text/5 text-text-subtle";

  const used = lecture.avatar_render_count;
  const cap = lecture.avatar_render_cap;

  return (
    <div className="rounded-xl border border-line bg-bg-subtle p-3">
      <div className="flex gap-3">
        {lecture.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={lecture.thumbnail_url}
            alt=""
            width={104}
            height={59}
            className="h-[59px] w-[104px] shrink-0 rounded-lg border border-line object-cover"
          />
        ) : (
          <div className="flex h-[59px] w-[104px] shrink-0 items-center justify-center rounded-lg border border-line bg-bg-card text-[10px] text-text-faint">
            {t("admin.testerNoThumbnail")}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{lecture.title}</p>
          <p className="truncate text-xs text-text-subtle">
            {lecture.course_title ?? "—"}
            {lecture.slide_count > 0 && (
              <span className="ml-1 tabular-nums">
                · {t("admin.testerSlides", { count: lecture.slide_count })}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs tabular-nums text-text-muted">
            ${lecture.spend_usd.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1">
        {stages.map((s) => (
          <span
            key={s.key}
            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${chipClass(lecture.stages[s.key])}`}
          >
            {s.label}
          </span>
        ))}
      </div>

      {/* 재렌더 잔여 pip — ●●○ 2/3. 남은 횟수를 한눈에. */}
      <div className="mt-2 flex items-center gap-1.5">
        <span className="flex gap-0.5" aria-hidden>
          {Array.from({ length: cap }, (_, i) => (
            <span
              key={i}
              className={`h-[7px] w-[7px] rounded-[2px] ${i < used ? "bg-seq-5" : "bg-text/10"}`}
            />
          ))}
        </span>
        <span className="text-[11px] tabular-nums text-text-subtle">
          {t("admin.testerRerender", { used, cap })}
        </span>
      </div>
    </div>
  );
}
