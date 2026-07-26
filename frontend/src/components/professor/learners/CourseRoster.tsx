"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLearnersI18n } from "./useLearnersI18n";

/**
 * 수강 명단 — 강좌에 **등록된** 학생 목록.
 *
 * 강의별 학습자 보드(`/professor/learners/[lectureId]`)와 분모가 다르다. 그쪽은
 * 세션 기록에서 파생돼 **한 번이라도 본 사람**만 나온다. 등록만 하고 한 번도 안 본
 * 학생은 어디에도 나타나지 않아 "미시청 3명"을 특정할 수 없었다(스펙 15 §1.2).
 * 이 표의 핵심 값이 그 분모이며, `최근 시청` 이 비어 있는 행이 곧 미시청자다.
 *
 * 제적은 행 삭제가 아니라 상태 전이다(§3.1) — 지우면 이미 쌓인 세션·평가가 주인을
 * 잃고 연구 데이터의 코호트 집계가 과거와 어긋난다. 제적자도 목록에 남긴다.
 */
interface RosterEntry {
  enrollment_id: string;
  student_id: string;
  name: string | null;
  student_number: string | null;
  status: string;
  section: string | null;
  source: string;
  joined_at: string;
  last_watched_at: string | null;
}

interface RosterResponse {
  course_id: string;
  course_title: string;
  active_count: number;
  withdrawn_count: number;
  never_watched_count: number;
  entries: RosterEntry[];
}

interface CourseRosterProps {
  courseId: string;
}

function formatDate(value: string | null, locale: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale === "en" ? "en-US" : "ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function CourseRoster({ courseId }: CourseRosterProps) {
  const { t, locale } = useLearnersI18n();
  const [data, setData] = useState<RosterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // 제적/재등록 진행 중인 행. 연타로 같은 요청이 두 번 나가는 것을 막는다.
  const [busyId, setBusyId] = useState<string | null>(null);
  // 되돌릴 수 없는 조작이 아니지만(재등록이 있다) 학생이 스스로는 못 푸는 상태라
  // 확인 단계를 한 번 둔다.
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data: res } = await api.get<RosterResponse>(
        `/api/v1/enrollments/roster/${courseId}`,
      );
      setData(res);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = async (entry: RosterEntry, action: "withdraw" | "reactivate") => {
    setBusyId(entry.enrollment_id);
    setConfirmId(null);
    try {
      const { data: updated } = await api.post<RosterEntry>(
        `/api/v1/enrollments/${entry.enrollment_id}/${action}`,
      );
      setData((prev) => {
        if (!prev) return prev;
        const entries = prev.entries.map((e) =>
          e.enrollment_id === updated.enrollment_id ? updated : e,
        );
        const active = entries.filter((e) => e.status === "active");
        return {
          ...prev,
          entries,
          active_count: active.length,
          withdrawn_count: entries.length - active.length,
          never_watched_count: active.filter((e) => !e.last_watched_at).length,
        };
      });
    } catch {
      // 실패하면 서버 상태를 신뢰한다 — 낙관적 갱신이 어긋난 채로 남으면
      // 교수자가 제적했다고 믿는 학생이 계속 시청한다.
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <p style={cellNote} role="status">
        {t("rosterLoading")}
      </p>
    );
  }

  if (error || !data) {
    return (
      <p style={cellNote} role="alert">
        {t("rosterLoadError")}
      </p>
    );
  }

  if (data.entries.length === 0) {
    return (
      <p style={cellNote} data-testid="roster-empty">
        {t("rosterEmpty")}
      </p>
    );
  }

  return (
    <div data-testid="course-roster">
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1"
        style={{ padding: "10px 20px", borderTop: "1px solid var(--line)" }}
      >
        <Stat label={t("rosterActive")} value={data.active_count} />
        {/* 등록만 하고 한 번도 안 본 학생 — 명단이 생기며 처음 셀 수 있게 된 값이다. */}
        <Stat label={t("rosterNeverWatched")} value={data.never_watched_count} />
        {data.withdrawn_count > 0 && (
          <Stat label={t("rosterWithdrawn")} value={data.withdrawn_count} />
        )}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr>
              <th scope="col" style={th}>{t("rosterColName")}</th>
              <th scope="col" style={th}>{t("rosterColNumber")}</th>
              <th scope="col" style={th}>{t("rosterColJoined")}</th>
              <th scope="col" style={th}>{t("rosterColLastWatched")}</th>
              <th scope="col" style={{ ...th, textAlign: "right" }}>
                {t("rosterColAction")}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e) => {
              const withdrawn = e.status !== "active";
              const busy = busyId === e.enrollment_id;
              return (
                <tr
                  key={e.enrollment_id}
                  data-testid={`roster-row-${e.enrollment_id}`}
                  style={{ opacity: withdrawn ? 0.55 : 1 }}
                >
                  <td style={td}>
                    {e.name ?? "—"}
                    {withdrawn && (
                      <span style={withdrawnChip}>{t("rosterWithdrawnBadge")}</span>
                    )}
                  </td>
                  <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>
                    {e.student_number ?? "—"}
                  </td>
                  <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>
                    {formatDate(e.joined_at, locale) ?? "—"}
                  </td>
                  <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>
                    {/* 비어 있는 칸이 곧 미시청자다. '—' 로 뭉개지 말 것. */}
                    {formatDate(e.last_watched_at, locale) ?? (
                      <span style={{ color: "var(--text-faint)" }}>
                        {t("rosterNeverWatchedCell")}
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    {confirmId === e.enrollment_id ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void mutate(e, "withdraw")}
                          style={dangerBtn}
                          data-testid={`roster-withdraw-confirm-${e.enrollment_id}`}
                        >
                          {t("rosterWithdrawConfirm")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          style={ghostBtn}
                        >
                          {t("rosterCancel")}
                        </button>
                      </>
                    ) : withdrawn ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void mutate(e, "reactivate")}
                        style={ghostBtn}
                        data-testid={`roster-reactivate-${e.enrollment_id}`}
                      >
                        {t("rosterReactivate")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmId(e.enrollment_id)}
                        style={ghostBtn}
                        data-testid={`roster-withdraw-${e.enrollment_id}`}
                      >
                        {t("rosterWithdraw")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ ...cellNote, paddingTop: 4 }}>{t("rosterWithdrawNote")}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>
      {label}{" "}
      <strong style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </strong>
    </span>
  );
}

const th = {
  padding: "8px 20px",
  textAlign: "left",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-faint)",
  borderTop: "1px solid var(--line)",
  borderBottom: "1px solid var(--line)",
} as const;

const td = {
  padding: "9px 20px",
  color: "var(--text)",
  borderBottom: "1px solid var(--line)",
} as const;

const cellNote = {
  margin: 0,
  padding: "14px 20px",
  fontSize: 12,
  color: "var(--text-subtle)",
  borderTop: "1px solid var(--line)",
} as const;

const withdrawnChip = {
  marginLeft: 6,
  padding: "1px 6px",
  fontSize: 10,
  fontWeight: 600,
  borderRadius: 999,
  background: "var(--bg-subtle)",
  color: "var(--text-subtle)",
} as const;

const baseBtn = {
  padding: "4px 10px",
  fontSize: 11.5,
  fontWeight: 600,
  borderRadius: 7,
  cursor: "pointer",
  fontFamily: "inherit",
} as const;

const ghostBtn = {
  ...baseBtn,
  marginLeft: 4,
  color: "var(--text-muted)",
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
} as const;

const dangerBtn = {
  ...baseBtn,
  // v2 토큰에 --danger 는 없다. 의미적 빨강은 --warning 하나로 통일돼 있다.
  color: "var(--warning)",
  background: "transparent",
  border: "1px solid var(--warning)",
} as const;
