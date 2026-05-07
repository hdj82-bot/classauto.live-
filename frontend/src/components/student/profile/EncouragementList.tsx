"use client";

import type { Encouragement, RecentQuestion } from "./types";
import { useProfileHubI18n } from "./useProfileHubI18n";

interface Props {
  encouragements: Encouragement[];
  questions: RecentQuestion[];
}

/**
 * 받은 격려 + 최근 보낸 질문을 한 카드에 두 단으로.
 *
 * "받은 격려" 는 docs/planning/06-student-pages.md §9.2 의 핵심 동기 요소.
 * "최근 질문" 은 학생이 본인 학습 흔적을 돌아보는 보조 정보.
 *
 * 두 영역 모두 외부 공유 / 외부 SNS / 광고 슬롯 0 — 학생 데이터 보호 정책.
 */
export default function EncouragementList({ encouragements, questions }: Props) {
  const { t } = useProfileHubI18n();
  return (
    <section
      data-testid="profile-feedback"
      className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 격려 메시지 */}
        <div data-testid="profile-encouragements">
          <header className="mb-3">
            <h3 className="text-sm font-semibold text-white">
              {t("profileHub.encouragements.title")}
            </h3>
            <p className="text-[11px] text-white/45 mt-0.5">
              {t("profileHub.encouragements.subtitle")}
            </p>
          </header>
          {encouragements.length === 0 ? (
            <p className="text-xs text-white/40 py-4">
              {t("profileHub.encouragements.empty")}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {encouragements.map((e) => (
                <li
                  key={e.id}
                  data-testid={`encouragement-${e.id}`}
                  className="rounded-xl bg-amber-400/[0.06] border border-amber-400/15 p-3"
                >
                  <p className="text-sm text-white/90 leading-relaxed">{e.message}</p>
                  <p className="text-[10px] text-amber-300 mt-1.5 tabular-nums">
                    {t("profileHub.encouragements.from", { professor: e.professor })}
                    {" · "}
                    {e.receivedAt}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 최근 질문 */}
        <div data-testid="profile-recent-questions">
          <header className="mb-3">
            <h3 className="text-sm font-semibold text-white">
              {t("profileHub.questionsRecent.title")}
            </h3>
            <p className="text-[11px] text-white/45 mt-0.5">
              {t("profileHub.questionsRecent.subtitle")}
            </p>
          </header>
          {questions.length === 0 ? (
            <p className="text-xs text-white/40 py-4">
              {t("profileHub.questionsRecent.empty")}
            </p>
          ) : (
            <ul className="space-y-2">
              {questions.map((q) => (
                <li
                  key={q.id}
                  data-testid={`question-${q.id}`}
                  className="rounded-xl bg-white/[0.03] border border-white/5 p-3"
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <p className="text-sm text-white/85 line-clamp-2 min-w-0 flex-1">
                      {q.question}
                    </p>
                    <span
                      className={[
                        "shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                        q.inScope === false
                          ? "bg-amber-400/10 text-amber-300"
                          : q.responded
                            ? "bg-emerald-400/10 text-emerald-300"
                            : "bg-white/5 text-white/55",
                      ].join(" ")}
                    >
                      {q.inScope === false
                        ? t("profileHub.questionsRecent.outOfScopeBadge")
                        : q.responded
                          ? t("profileHub.questionsRecent.answeredBadge")
                          : t("profileHub.questionsRecent.pendingBadge")}
                    </span>
                  </div>
                  <p className="text-[10px] text-white/35 mt-1 tabular-nums">
                    {q.askedAt}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
