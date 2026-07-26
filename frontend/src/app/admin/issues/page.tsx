"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { issuesApi, type IssueItem, type IssueStatus } from "@/lib/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useI18n } from "@/contexts/I18nContext";

/**
 * /admin/issues — 이슈 인박스. 스펙 14 §C · 프로토타입 08.
 *
 * 한 줄 = **강의 + 렌더 패스** 하나다. 그룹핑은 백엔드가 한다(`admin_issues`) —
 * 같은 사고가 슬라이드 수만큼 N줄로 보이면 안 된다는 게 §C 의 핵심 요구라, 화면이
 * 다시 묶으려 들지 않고 서버가 준 묶음을 그대로 그린다.
 *
 * 상태는 3분기 파생값이다(`resolved` 컬럼 없음). 화면에서 "해결"을 직접 누르는
 * 버튼을 두지 않는 것도 그래서다 — 해결은 재렌더가 성공하면 저절로 된다. 운영자가
 * 남길 수 있는 건 "확인했다"까지(§5 쓰기 화이트리스트).
 *
 * `?render=` 쿼리로 들어오면 그 행의 드로어를 바로 연다 — 테스터 상세의 "최근 오류"가
 * 이 경로로 넘어온다.
 */

const LIMIT = 50;
const SINCE_OPTIONS = ["7d", "30d", "90d"] as const;

export default function AdminIssuesPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<IssueItem[]>([]);
  const [counts, setCounts] = useState({ new: 0, triaged: 0, resolved: 0 });
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [since, setSince] = useState<string>("7d");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // 테스터 상세에서 넘어온 필터/딥링크.
  const userFilter = searchParams.get("user_id") ?? "";
  const deepLink = searchParams.get("render");

  const load = useCallback(async (isCancelled?: () => boolean) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await issuesApi.list({
        since,
        page,
        limit: LIMIT,
        ...(userFilter ? { user_id: userFilter } : {}),
      });
      if (isCancelled?.()) return;
      setItems(data.issues ?? []);
      setCounts(data.counts ?? { new: 0, triaged: 0, resolved: 0 });
      setTotal(data.total ?? 0);
      setTruncated(!!data.truncated);
    } catch {
      if (isCancelled?.()) return;
      setError(t("admin.issues.loadError"));
    }
    if (!isCancelled?.()) setLoading(false);
  }, [since, page, userFilter, t]);

  // rAF 로 다음 프레임에 — effect 동기 경로의 setState 를 린트가 막는다(레포 표준 회피책).
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

  // 딥링크(`?render=`)는 목록이 도착한 뒤에 연다 — 그 전엔 열 행이 아직 없다.
  // 여기서도 rAF 로 미룬다(effect 동기 경로의 setState 를 린트가 막는 레포 표준).
  useEffect(() => {
    if (!deepLink || !items.some((i) => i.id === deepLink)) return;
    const raf = requestAnimationFrame(() => setOpenId(deepLink));
    return () => cancelAnimationFrame(raf);
  }, [deepLink, items]);

  const onSinceChange = (value: string) => {
    setSince(value);
    setPage(1);
  };

  const openItem = items.find((i) => i.id === openId) ?? null;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  if (loading && items.length === 0) {
    return <LoadingSpinner fullScreen label={t("admin.issues.loadingLabel")} />;
  }

  return (
    <div>
      <div className="animate-fade-in-up mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-text">
            {t("admin.issues.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">
            {t("admin.issues.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="issue-since" className="text-xs font-semibold text-text-subtle">
            {t("admin.issues.filterSince")}
          </label>
          <select
            id="issue-since"
            value={since}
            onChange={(e) => onSinceChange(e.target.value)}
            className="rounded-lg border border-line-strong bg-bg-card px-2.5 py-1.5 text-sm text-text outline-none focus:border-gold-on-light"
          >
            {SINCE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {t(`admin.issues.since${opt}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 3분기 카운트 타일 — 프로토타입 08 의 4타일 중 '실패율'은 뺐다.
          전체 렌더 수를 세는 별도 집계가 필요한데 §7 범위 밖이고, 인박스의 판단에
          실제로 쓰이는 건 미확인 건수다. */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CountTile
          label={t("admin.issues.tileNew")}
          sub={t("admin.issues.tileNewSub")}
          value={counts.new}
          alert={counts.new > 0}
        />
        <CountTile
          label={t("admin.issues.tileTriaged")}
          sub={t("admin.issues.tileTriagedSub")}
          value={counts.triaged}
        />
        <CountTile
          label={t("admin.issues.tileResolved")}
          sub={t("admin.issues.tileResolvedSub")}
          value={counts.resolved}
        />
      </div>

      {error && (
        <div className="mb-4 text-sm text-warning" role="alert">
          {error}
        </div>
      )}
      {truncated && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-muted">
          {t("admin.issues.truncated")}
        </div>
      )}

      <div className="animate-fade-in-up stagger-1 rounded-2xl border border-line bg-bg-card p-4 shadow-sm">
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-subtle">
            {t("admin.issues.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg-subtle">
                <tr>
                  <Th>{t("admin.issues.colWhen")}</Th>
                  <Th>{t("admin.issues.colTester")}</Th>
                  <Th>{t("admin.issues.colLecture")}</Th>
                  <Th>{t("admin.issues.colProvider")}</Th>
                  <Th>{t("admin.issues.colError")}</Th>
                  <Th>{t("admin.issues.colSlides")}</Th>
                  <Th>{t("admin.issues.colStatus")}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((issue) => (
                  <tr
                    key={issue.id}
                    onClick={() => setOpenId(issue.id)}
                    className="cursor-pointer transition hover:bg-bg-hover"
                  >
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-text-subtle">
                      {formatWhen(issue.last_failed_at)}
                    </td>
                    <td className="px-3 py-2 font-semibold whitespace-nowrap text-text">
                      {issue.user_name || issue.user_email || "—"}
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-text">
                      {issue.lecture_title || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-text/5 px-1.5 py-0.5 text-[11px] font-semibold text-text-subtle">
                        {issue.provider}
                      </span>
                    </td>
                    <td className="max-w-[280px] truncate px-3 py-2 font-mono text-[12px] text-text-muted">
                      {issue.error_message || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-text-subtle">
                      {issue.affected_slides.length > 0
                        ? t("admin.issues.slidesCount", {
                            count: issue.affected_slides.length,
                          })
                        : t("admin.issues.slidesNone")}
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip status={issue.status} t={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-line px-3 py-1.5 text-text-muted transition disabled:opacity-40 enabled:hover:bg-bg-hover"
            >
              ‹
            </button>
            <span className="tabular-nums text-text-subtle">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-line px-3 py-1.5 text-text-muted transition disabled:opacity-40 enabled:hover:bg-bg-hover"
            >
              ›
            </button>
          </div>
        )}
      </div>

      <IssueDrawer
        issue={openItem}
        onClose={() => setOpenId(null)}
        onTriaged={() => {
          setOpenId(null);
          void load();
        }}
        t={t}
      />
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left font-medium whitespace-nowrap text-text-muted">
      {children}
    </th>
  );
}

function CountTile({
  label,
  sub,
  value,
  alert,
}: {
  label: string;
  sub: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div
      className={`animate-fade-in-up rounded-2xl border bg-bg-card p-5 shadow-sm ${
        alert ? "border-warning/30" : "border-line"
      }`}
    >
      <p className="text-xs text-text-muted">{label}</p>
      <p
        className={`mt-2 text-3xl font-bold tracking-tight tabular-nums ${
          alert ? "text-warning" : "text-text"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] text-text-faint">{sub}</p>
    </div>
  );
}

const STATUS_CLASS: Record<IssueStatus, string> = {
  new: "bg-warning/10 text-warning",
  triaged: "bg-info/10 text-info",
  resolved: "bg-success/10 text-success",
};

const STATUS_KEY: Record<IssueStatus, string> = {
  new: "admin.issues.statusNew",
  triaged: "admin.issues.statusTriaged",
  resolved: "admin.issues.statusResolved",
};

function StatusChip({
  status,
  t,
}: {
  status: IssueStatus;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${STATUS_CLASS[status]}`}
    >
      {t(STATUS_KEY[status])}
    </span>
  );
}

/** 발생 시각 — 목록은 좁으므로 날짜+시각만(초 제외). */
function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

/**
 * 우측 드로어 — 프로토타입 08 순서 그대로:
 * error_message 원문 → 파이프라인 추적 → 운영자 판단 → 재현 경로 → 하단 액션 바.
 *
 * "파이프라인 추적"은 **있는 로그만** 그린다(§C: 없으면 이 블록 생략). 지금 DB 에
 * 남는 건 한 패스 안의 서로 다른 `error_message` 들이라 그걸 시간순으로 보여준다.
 * 프로토타입의 `[celery] …` 같은 단계별 로그는 아직 어디에도 저장되지 않으므로
 * 지어내지 않는다.
 */
function IssueDrawer({
  issue,
  onClose,
  onTriaged,
  t,
}: {
  issue: IssueItem | null;
  onClose: () => void;
  onTriaged: () => void;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 다른 이슈를 열면 메모 입력을 그 이슈의 기존 메모로 갈아끼운다.
  useEffect(() => {
    setNote(issue?.triage_note ?? "");
    setSaveError(null);
  }, [issue]);

  // Esc 로 닫기 — 프로토타입과 같은 동작.
  useEffect(() => {
    if (!issue) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [issue, onClose]);

  if (!issue) return null;

  const submit = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await issuesApi.triage(issue.id, note.trim() || undefined);
      onTriaged();
    } catch {
      setSaveError(t("admin.issues.actionError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label={t("admin.issues.drawerClose")}
        onClick={onClose}
        className="fixed inset-0 z-60 bg-black/30 backdrop-blur-[2px]"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("admin.issues.drawerTitle")}
        className="fixed top-0 right-0 z-61 flex h-screen w-[min(560px,94vw)] flex-col border-l border-line bg-bg-card shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold text-text">
              {issue.lecture_title || t("admin.issues.drawerTitle")}
            </h2>
            <p className="mt-0.5 text-[11.5px] text-text-subtle">
              {[issue.user_name || issue.user_email, issue.provider, formatWhen(issue.last_failed_at)]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("admin.issues.drawerClose")}
            className="rounded-lg p-1.5 text-text-subtle transition hover:bg-bg-hover hover:text-text"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            <Kv label={t("admin.issues.kvTester")}>
              {issue.user_name || issue.user_email || "—"}
            </Kv>
            <Kv label={t("admin.issues.kvCourse")}>{issue.course_title || "—"}</Kv>
            <Kv label={t("admin.issues.kvProvider")}>{issue.provider}</Kv>
            <Kv label={t("admin.issues.kvTts")}>{issue.tts_provider || "—"}</Kv>
            <Kv label={t("admin.issues.kvStatus")}>
              <StatusChip status={issue.status} t={t} />
            </Kv>
            <Kv label={t("admin.issues.kvWhen")}>{formatWhen(issue.created_at)}</Kv>
            <Kv label={t("admin.issues.kvSlides")}>
              {issue.affected_slides.length > 0
                ? issue.affected_slides.join(", ")
                : t("admin.issues.slidesNone")}
            </Kv>
          </dl>

          <SecTitle>{t("admin.issues.sectionError")}</SecTitle>
          <pre className="overflow-x-auto rounded-lg bg-text/[0.04] p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-warning">
            {issue.error_message || "—"}
          </pre>

          {/* 파이프라인 추적 — 저장된 게 있을 때만(§C). */}
          {issue.error_messages.length > 1 && (
            <>
              <SecTitle>{t("admin.issues.sectionTrace")}</SecTitle>
              <div className="overflow-x-auto rounded-lg bg-text/[0.04] p-3 font-mono text-[12px] leading-relaxed">
                {issue.error_messages.map((line, i) => (
                  <div key={`${line}-${i}`} className="whitespace-pre-wrap text-text-muted">
                    {line}
                  </div>
                ))}
              </div>
            </>
          )}

          <SecTitle>{t("admin.issues.sectionJudgement")}</SecTitle>
          <p className="mb-2 text-[12px] leading-relaxed text-text-faint">
            {t("admin.issues.judgementPlaceholder")}
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("admin.issues.notePlaceholder")}
            rows={3}
            className="w-full resize-y rounded-lg border border-line-strong bg-bg-card px-3 py-2 text-sm text-text outline-none focus:border-gold-on-light"
          />
          {issue.triaged_at && (
            <p className="mt-1.5 text-[11px] text-text-faint">
              {t("admin.issues.triagedAt", { when: formatWhen(issue.triaged_at) })}
            </p>
          )}

          <SecTitle>{t("admin.issues.sectionRepro")}</SecTitle>
          <p className="text-[12.5px] leading-relaxed text-text-muted">
            {t("admin.issues.reproHint")}
          </p>
          {issue.user_id && (
            <Link
              href={`/admin/testers/${issue.user_id}`}
              className="mt-2 inline-block text-[12.5px] font-semibold text-gold-on-light transition hover:underline"
            >
              {t("admin.issues.reproLink")} →
            </Link>
          )}

          {saveError && (
            <p className="mt-3 text-sm text-warning" role="alert">
              {saveError}
            </p>
          )}
        </div>

        {/* 하단 액션 바 — §5 화이트리스트대로 triage 만. "해결"은 파생값이라 버튼이 없다. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-bg-subtle px-5 py-3">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="rounded-lg bg-gold-deep px-3.5 py-2 text-sm font-semibold text-white transition disabled:opacity-50 enabled:hover:brightness-110"
          >
            {saving
              ? t("admin.issues.actionSaving")
              : issue.triaged_at
                ? t("admin.issues.actionRetriage")
                : t("admin.issues.actionTriage")}
          </button>
          <span className="ml-auto text-[11px] tabular-nums text-text-faint">
            {t("admin.issues.affectedCount", { count: issue.affected_count })}
          </span>
        </div>
      </aside>
    </>
  );
}

function SecTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 mb-1.5 text-[10px] font-bold tracking-[0.09em] text-text-faint uppercase">
      {children}
    </p>
  );
}

function Kv({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="whitespace-nowrap text-text-subtle">{label}</dt>
      <dd className="min-w-0 truncate text-text">{children}</dd>
    </>
  );
}
