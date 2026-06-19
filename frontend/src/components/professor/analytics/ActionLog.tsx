"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAnalyticsI18n } from "./useAnalyticsI18n";
import EmptyState from "./EmptyState";
import { ANALYTICS_PALETTE } from "./svg";
import type { InstructorAction } from "./types";

/**
 * 교수자 개입 행동 로그 (스펙 11 §H-4, RQ2) — 격려 기록 + 로그.
 *
 * "데이터 기반 개입"을 계측하는 RQ2 핵심 화면. 학습자를 골라 격려 메시지를
 * 기록하면 instructor_actions 에 남는다. ⚠️ 현재는 **기록만**(status=recorded) —
 * 실제 학생 외부 발송(이메일/알림) 채널 연결은 후속이다(라이브 학생 데이터
 * 대상이라 채널 결정 필요). 컴포넌트는 자체적으로 로그를 fetch/추가한다.
 */
interface StudentRef {
  user_id: string;
  name: string | null;
}

interface ActionLogProps {
  lectureId: string;
  students: StudentRef[];
}

const TYPE_BADGE: Record<string, string> = {
  encouragement: "rgba(255,182,39,0.18)",
  adopt_recommendation: "rgba(59,130,246,0.15)",
  note: "rgba(10,10,10,0.06)",
};

export default function ActionLog({ lectureId, students }: ActionLogProps) {
  const { t } = useAnalyticsI18n();
  const [actions, setActions] = useState<InstructorAction[] | null>(null);
  const [targetId, setTargetId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<InstructorAction[]>(
        `/api/v1/dashboard/${lectureId}/actions`,
      );
      setActions(data);
    } catch {
      setActions([]);
    }
  }, [lectureId]);

  useEffect(() => {
    load();
  }, [load]);

  const send = useCallback(async () => {
    if (!message.trim()) {
      setErr(t("actions.formError"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/v1/dashboard/${lectureId}/actions`, {
        action_type: "encouragement",
        target_user_id: targetId || null,
        message: message.trim(),
      });
      setMessage("");
      setTargetId("");
      await load();
    } catch {
      setErr(t("actions.saveError"));
    } finally {
      setBusy(false);
    }
  }, [lectureId, targetId, message, load, t]);

  return (
    <div className="space-y-4">
      {/* 안내: 현재는 기록만 */}
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
        {t("actions.recordOnlyNote")}
      </p>

      {/* 격려 기록 폼 */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          {t("actions.targetLabel")}
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">{t("actions.targetClass")}</option>
            {students.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.name ?? s.user_id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-gray-600">
          {t("actions.messageLabel")}
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("actions.messagePlaceholder")}
            maxLength={2000}
            className="min-w-[180px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="rounded-lg px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #FFB627, #E89E0E)", color: "#0A0A0A" }}
        >
          {t("actions.send")}
        </button>
      </div>
      {err && (
        <p role="alert" className="text-xs" style={{ color: ANALYTICS_PALETTE.warning }}>
          {err}
        </p>
      )}

      {/* 로그 */}
      {actions && actions.length === 0 ? (
        <EmptyState title={t("actions.empty")} description={t("actions.emptyDesc")} />
      ) : (
        <ul className="space-y-2">
          {(actions ?? []).map((a) => (
            <li
              key={a.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: TYPE_BADGE[a.action_type] ?? TYPE_BADGE.note }}
                  >
                    {t(`actions.type.${a.action_type}`)}
                  </span>
                  <span className="text-xs text-gray-700">
                    {a.target_name ?? t("actions.targetClass")}
                  </span>
                </div>
                {a.message && (
                  <p className="mt-1 truncate text-sm text-gray-800">{a.message}</p>
                )}
              </div>
              <time className="shrink-0 text-[11px] text-gray-400 tabular-nums">
                {a.created_at?.slice(0, 10)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
