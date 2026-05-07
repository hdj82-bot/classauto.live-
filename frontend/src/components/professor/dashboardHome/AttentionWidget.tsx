"use client";

import Link from "next/link";
import { HUB_PALETTE } from "./palette";
import { useDashboardHubI18n } from "./useDashboardHubI18n";
import type { AttentionData } from "./types";

/**
 * 우측 "주의 필요" 위젯 — `05-instructor-pages.md §4.4`.
 *
 * 3 섹션:
 *   1) 답변 대기 질문 (최신 5건) — qa.responded=false 합산.
 *   2) 시청 부진 학습자 — `last_activity_at` 백엔드 미지원, 임시로 진행률 낮은
 *      학습자 5명 (BACKEND_ASKS §3 도착 시 자동 정확도 ↑).
 *   3) 자주 멈춘 구간 Top 3 — engagement 응답에 slides 가 함께 오면 활성
 *      (feat/analytics 협의안 공통).
 *
 * 색약자 친화: "주의" 빨강 점은 `!` 글리프와 항상 동반. 빈 섹션은 회색 점선
 * 박스로 골격 유지(레이아웃 점프 방지).
 */
interface AttentionWidgetProps {
  data: AttentionData;
  /** 학습자 알림 발송 핸들러 — 백엔드 미도착 시 disabled. */
  onNotifyLagging?: (userId: string) => void;
  /** 강의 보강 추천 핸들러 (자주 멈춘 구간). */
  onBoostLecture?: (lectureId: string) => void;
}

export default function AttentionWidget({
  data,
  onNotifyLagging,
  onBoostLecture,
}: AttentionWidgetProps) {
  const { t } = useDashboardHubI18n();

  return (
    <aside
      aria-label={t("attention.title")}
      className="rounded-2xl border border-gray-200 bg-white p-5"
    >
      <h3 className="mb-3 text-sm font-semibold text-gray-900">
        {t("attention.title")}
      </h3>

      {/* 1) 답변 대기 질문 */}
      <Section
        title={t("attention.pendingQa")}
        count={data.pendingQa.length}
        countSuffix={t("attention.pendingQaCount", { count: data.pendingQa.length })}
        emptyMessage={t("attention.pendingQaEmpty")}
        warn={data.pendingQa.length >= 5}
      >
        <ul className="space-y-1.5">
          {data.pendingQa.slice(0, 5).map((item) => (
            <li key={item.id}>
              <Link
                href="/professor/inbox"
                className="block truncate rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-800 hover:bg-gray-100 motion-safe:transition"
                title={item.question}
              >
                {item.question}
              </Link>
            </li>
          ))}
          <li className="pt-1 text-right">
            <Link
              href="/professor/inbox"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              {t("attention.viewAll")}
            </Link>
          </li>
        </ul>
      </Section>

      {/* 2) 시청 부진 학습자 */}
      <Section
        title={t("attention.lagging")}
        count={data.laggingLearners.length}
        countSuffix={t("attention.laggingCount", { count: data.laggingLearners.length })}
        emptyMessage={t("attention.laggingEmpty")}
        warn={data.laggingLearners.length > 0}
        hint={t("attention.laggingHint")}
      >
        <ul className="space-y-1.5">
          {data.laggingLearners.slice(0, 5).map((l) => (
            <li
              key={l.userId}
              className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs"
            >
              <span className="truncate text-gray-800">{l.name ?? "—"}</span>
              <span className="ml-2 flex items-center gap-2">
                <span className="tabular-nums text-gray-500">
                  {l.daysSinceLastActivity !== null
                    ? `D-${l.daysSinceLastActivity}`
                    : "—"}
                </span>
                <button
                  type="button"
                  onClick={() => onNotifyLagging?.(l.userId)}
                  disabled={!onNotifyLagging}
                  className="rounded-md border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("attention.notify")}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* 3) 자주 멈춘 구간 Top 3 */}
      <Section
        title={t("attention.frequentPause")}
        count={data.frequentPauseSlides.length}
        countSuffix=""
        emptyMessage={t("attention.frequentPauseEmpty")}
        hint={t("attention.frequentPauseHint")}
        warn={false}
        dashed={data.frequentPauseSlides.length === 0}
      >
        <ul className="space-y-1.5">
          {data.frequentPauseSlides.slice(0, 3).map((p) => (
            <li
              key={`${p.lectureId}-${p.slideIndex}`}
              className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs"
            >
              <span className="truncate text-gray-800">
                {t("attention.slide", { n: p.slideIndex + 1 })}
              </span>
              <span className="ml-2 flex items-center gap-2 tabular-nums text-gray-500">
                {p.replays}×
                <button
                  type="button"
                  onClick={() => onBoostLecture?.(p.lectureId)}
                  disabled={!onBoostLecture}
                  className="rounded-md border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("attention.boost")}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </aside>
  );
}

function Section({
  title,
  count,
  countSuffix,
  emptyMessage,
  hint,
  warn,
  dashed,
  children,
}: {
  title: string;
  count: number;
  countSuffix?: string;
  emptyMessage: string;
  hint?: string;
  warn: boolean;
  dashed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <header className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
          {warn && count > 0 && (
            <span
              aria-hidden="true"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
              style={{
                background: "rgba(239,68,68,0.10)",
                color: HUB_PALETTE.warning,
              }}
            >
              !
            </span>
          )}
          {title}
        </p>
        {countSuffix && (
          <span
            className="text-[11px] tabular-nums text-gray-500"
            style={warn && count > 0 ? { color: HUB_PALETTE.warning } : undefined}
          >
            {countSuffix}
          </span>
        )}
      </header>
      {count === 0 ? (
        <div
          className={[
            "rounded-lg px-3 py-3 text-xs text-gray-500",
            dashed
              ? "border border-dashed border-gray-200 bg-gray-50/40"
              : "bg-gray-50/60",
          ].join(" ")}
        >
          {emptyMessage}
          {hint && (
            <p className="mt-1 text-[11px] text-gray-400">{hint}</p>
          )}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
