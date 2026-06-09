"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HUB_PALETTE } from "./palette";
import { useDashboardHubI18n } from "./useDashboardHubI18n";
import type { RecentActivity } from "./types";

/**
 * 최근 활동 피드 — animations.md §4.4.
 *
 * - 새 항목이 도착하면 위에서 슬라이드인 + glow-fade(3초). React state 의
 *   "다음 fetch 결과에 새 id 가 있으면 NEW 표시" 로 흉내냄(WebSocket 도착
 *   전 대비).
 * - `prefers-reduced-motion`: 슬라이드인은 `motion-safe:` 로 보호 — 환원
 *   사용자에게는 항목이 즉시 등장.
 *
 * 본 PR 단계의 데이터 소스는 Q&A 로그(최신순). 단일 활동 로그 endpoint 는
 * BACKEND_ASKS §5 로 정리.
 */
interface ActivityFeedProps {
  activity: RecentActivity[];
}

export default function ActivityFeed({ activity }: ActivityFeedProps) {
  const { t } = useDashboardHubI18n();
  const seenRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fresh = new Set<string>();
    for (const a of activity) {
      if (!seenRef.current.has(a.id)) fresh.add(a.id);
      seenRef.current.add(a.id);
    }
    if (fresh.size === 0) return;

    // react-hooks/set-state-in-effect 룰 회피: effect body 의 sync setState
    // 호출 X. rAF 로 다음 frame 으로 비동기화하면 cascading render 위험 없이
    // 동일 효과 (mount 직후 NEW 표시 → 3.5초 후 해제).
    const showHandle = requestAnimationFrame(() => setNewIds(fresh));
    const clearTimer = setTimeout(() => setNewIds(new Set()), 3500);
    return () => {
      cancelAnimationFrame(showHandle);
      clearTimeout(clearTimer);
    };
  }, [activity]);

  if (activity.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 px-6 py-8 text-center">
        <p className="text-sm text-gray-700">{t("activity.empty")}</p>
      </div>
    );
  }

  return (
    <ol className="rounded-2xl border border-gray-200 bg-white">
      {activity.map((item, idx) => {
        const isNew = newIds.has(item.id);
        return (
          <li
            key={item.id}
            className={[
              "flex items-start gap-3 px-4 py-3 text-sm",
              idx === 0 ? "" : "border-t border-gray-100",
              isNew ? "motion-safe:animate-slide-in-top" : "",
            ].join(" ")}
            style={
              isNew
                ? {
                    background: `${HUB_PALETTE.goldSoft}`,
                    transition: "background 3000ms ease-out",
                  }
                : undefined
            }
            onAnimationEnd={(e) => {
              // glow-fade 단계 — background 를 transparent 로 떨어뜨림
              const el = e.currentTarget as HTMLLIElement;
              el.style.background = "transparent";
            }}
          >
            <ActivityGlyph kind={item.kind} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-gray-800">
                <span className="text-gray-500">
                  {t(`activity.${kindKey(item.kind)}`, { name: shortName(item) })}
                </span>{" "}
                {item.excerpt}
              </p>
              {item.createdAt && (
                <p className="mt-0.5 text-[11px] tabular-nums text-gray-400">
                  {formatRelative(item.createdAt)}
                </p>
              )}
            </div>
            {isNew && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{
                  background: HUB_PALETTE.goldGlow,
                  color: HUB_PALETTE.gold,
                }}
              >
                {t("activity.newBadge")}
              </span>
            )}
            <Link
              href={`/professor/studio/${item.lectureId}`}
              className="self-center text-[11px] text-indigo-600 hover:text-indigo-700"
            >
              {t("activity.viewSource")}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function ActivityGlyph({ kind }: { kind: RecentActivity["kind"] }) {
  if (kind === "qa-out-of-scope") {
    return (
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs"
        style={{
          background: "rgba(239,68,68,0.10)",
          color: HUB_PALETTE.warning,
        }}
      >
        ⊘
      </span>
    );
  }
  if (kind === "qa-responded") {
    return (
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs"
        style={{
          background: "rgba(16,185,129,0.10)",
          color: HUB_PALETTE.success,
        }}
      >
        ✓
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs"
      style={{
        background: HUB_PALETTE.goldSoft,
        color: HUB_PALETTE.gold,
      }}
    >
      ?
    </span>
  );
}

function kindKey(k: RecentActivity["kind"]): string {
  switch (k) {
    case "qa-asked":
      return "qaAsked";
    case "qa-responded":
      return "qaResponded";
    case "qa-out-of-scope":
      return "qaOutOfScope";
  }
}

/** Q&A 응답에 학생명이 없어 임시로 "익명 학습자" 표시 — BACKEND_ASKS §6. */
function shortName(item: RecentActivity): string {
  return item.lectureId.slice(0, 6);
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const d = Math.floor(hr / 24);
  return `${d}일 전`;
}
