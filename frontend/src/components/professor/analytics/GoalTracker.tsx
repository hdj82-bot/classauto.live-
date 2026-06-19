"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAnalyticsI18n } from "./useAnalyticsI18n";
import EmptyState from "./EmptyState";
import { ANALYTICS_PALETTE } from "./svg";
import type { Goal, GoalMetric } from "./types";

/**
 * 학습 목표·달성률 (스펙 11 §H-3) — 자체 CRUD.
 *
 * 목표를 추가하면 생성 시점 지표값이 baseline(=before)으로 고정되고, 라이브
 * 현재값(=after)·목표(target)와 함께 진행률 바로 before→after 를 보여준다.
 * 이 컴포넌트는 자체적으로 목표를 fetch/추가/삭제하므로 페이지는 lectureId 만 넘긴다.
 */
interface GoalTrackerProps {
  lectureId: string;
}

const METRICS: GoalMetric[] = [
  "completionRate",
  "attendanceRate",
  "avgAccuracy",
  "qaCount",
];

function isPct(metric: GoalMetric): boolean {
  return metric !== "qaCount";
}

function fmt(metric: GoalMetric, value: number): string {
  return isPct(metric) ? `${value.toFixed(1)}%` : String(Math.round(value));
}

export default function GoalTracker({ lectureId }: GoalTrackerProps) {
  const { t } = useAnalyticsI18n();
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [metric, setMetric] = useState<GoalMetric>("completionRate");
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Goal[]>(
        `/api/v1/dashboard/${lectureId}/goals`,
      );
      setGoals(data);
    } catch {
      setGoals([]);
    }
  }, [lectureId]);

  useEffect(() => {
    load();
  }, [load]);

  const add = useCallback(async () => {
    const targetNum = Number(target);
    if (!label.trim() || Number.isNaN(targetNum)) {
      setErr(t("goals.formError"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/api/v1/dashboard/${lectureId}/goals`, {
        metric,
        label: label.trim(),
        target_value: targetNum,
      });
      setLabel("");
      setTarget("");
      await load();
    } catch {
      setErr(t("goals.saveError"));
    } finally {
      setBusy(false);
    }
  }, [lectureId, metric, label, target, load, t]);

  const remove = useCallback(
    async (id: string) => {
      try {
        await api.delete(`/api/v1/dashboard/${lectureId}/goals/${id}`);
        await load();
      } catch {
        setErr(t("goals.deleteError"));
      }
    },
    [lectureId, load, t],
  );

  return (
    <div className="space-y-5">
      {/* 추가 폼 */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          {t("goals.metricLabel")}
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as GoalMetric)}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            {METRICS.map((m) => (
              <option key={m} value={m}>
                {t(`goals.metric.${m}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-gray-600">
          {t("goals.nameLabel")}
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("goals.namePlaceholder")}
            maxLength={200}
            className="min-w-[140px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          {t("goals.targetLabel")}
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            type="number"
            min={0}
            className="w-24 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm tabular-nums"
          />
        </label>
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className="rounded-lg px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #FFB627, #E89E0E)", color: "#0A0A0A" }}
        >
          {t("goals.add")}
        </button>
      </div>
      {err && (
        <p role="alert" className="text-xs" style={{ color: ANALYTICS_PALETTE.warning }}>
          {err}
        </p>
      )}

      {/* 목표 목록 */}
      {goals && goals.length === 0 ? (
        <EmptyState title={t("goals.empty")} description={t("goals.emptyDesc")} />
      ) : (
        <ul className="space-y-3">
          {(goals ?? []).map((g) => (
            <li key={g.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">
                    {g.label}
                    {g.achieved && (
                      <span
                        className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: "rgba(16,185,129,0.15)", color: ANALYTICS_PALETTE.success }}
                      >
                        {t("goals.achieved")}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-gray-500">{t(`goals.metric.${g.metric}`)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(g.id)}
                  className="text-xs text-gray-400 hover:text-red-500"
                  aria-label={t("goals.delete")}
                >
                  {t("goals.delete")}
                </button>
              </div>

              {/* before → after 진행률 바 */}
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full motion-safe:transition-all motion-safe:duration-500"
                  style={{
                    width: `${g.progress_pct}%`,
                    background: g.achieved
                      ? ANALYTICS_PALETTE.success
                      : "linear-gradient(90deg, #FFB627, #B88308)",
                  }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-gray-500 tabular-nums">
                <span>
                  {t("goals.start")} {fmt(g.metric, g.baseline_value ?? 0)} →{" "}
                  <span className="font-semibold text-gray-800">
                    {t("goals.now")} {fmt(g.metric, g.current_value)}
                  </span>
                </span>
                <span>
                  {t("goals.target")} {fmt(g.metric, g.target_value)} ({g.progress_pct}%)
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
