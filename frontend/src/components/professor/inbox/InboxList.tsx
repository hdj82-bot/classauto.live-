"use client";

import { useInboxI18n } from "./useInboxI18n";
import { groupByLecture } from "./inboxFilters";
import type { InboxItem } from "./inboxTypes";

interface Props {
  items: InboxItem[];
}

/**
 * 강의 영상(lecture) 단위로 그루핑된 Q&A 목록.
 *
 * 한 행 = 질문 1건. 행마다 학생 이름/익명·질문 텍스트·RAG 유사도(%)·챗봇 답변
 * 본문·시각을 노출합니다. status 배지("응답 필요" 등) 와 선택 체크박스는 폐기
 * (교수자가 영상에서 답변할 필요 없음 — 대면 수업에서 액션). 데이터 정리/시각화는
 * `/professor/analytics` 페이지로 분리.
 */
export default function InboxList({ items }: Props) {
  const { t, locale } = useInboxI18n();
  const groups = groupByLecture(items);

  if (items.length === 0) {
    return (
      <div
        data-testid="inbox-list-empty"
        className="bg-white border border-gray-200 rounded-2xl p-10 text-center"
      >
        <p className="text-sm font-medium text-gray-700">{t("page.empty")}</p>
        <p className="text-sm text-gray-500 mt-1">{t("page.emptyDesc")}</p>
      </div>
    );
  }

  return (
    <section
      data-testid="inbox-list"
      aria-label={t("list.ariaLabel")}
      className="flex flex-col gap-4"
    >
      {groups.map((g) => (
        <div
          key={g.lectureId}
          data-testid={`inbox-group-${g.lectureId}`}
          className="bg-white border border-gray-200 rounded-2xl overflow-hidden"
        >
          <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.14em] text-gray-400 font-semibold">
                {g.courseTitle}
              </p>
              <h3 className="text-sm font-semibold text-gray-900 truncate">
                {g.lectureTitle}
              </h3>
            </div>
            <span className="shrink-0 text-[11px] tabular-nums text-gray-500 font-medium">
              {t("list.lectureGroupTotal", { n: g.items.length })}
            </span>
          </header>

          <ul className="divide-y divide-gray-100">
            {g.items.map((it) => (
              <li key={it.id} data-testid={`inbox-row-${it.id}`} className="p-4">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <p className="text-xs font-medium text-gray-700 truncate">
                    {it.student.name ?? t("list.studentAnonymous")}
                    {it.student.studentNumber && (
                      <span className="text-gray-400 ml-1.5 tabular-nums">
                        ({it.student.studentNumber})
                      </span>
                    )}
                  </p>
                  <div className="shrink-0 flex items-center gap-2 whitespace-nowrap">
                    {it.rag.topSimilarity !== null && (
                      <span
                        className="text-[11px] tabular-nums text-gray-500 font-medium"
                        data-testid={`inbox-row-similarity-${it.id}`}
                        title={t("list.similarityTitle")}
                      >
                        {t("list.similarityLabel", {
                          value: Math.round(it.rag.topSimilarity * 100),
                        })}
                      </span>
                    )}
                    <span
                      className="text-[11px] tabular-nums text-gray-400"
                      title={it.createdAt}
                    >
                      {formatRelative(it.createdAt, locale, t)}
                    </span>
                  </div>
                </div>
                <p className="text-sm font-semibold text-gray-900 leading-snug whitespace-pre-wrap">
                  {it.question}
                </p>
                <div className="mt-2 pl-3 border-l-2 border-amber-200">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-amber-700 font-semibold mb-0.5">
                    {t("list.answerLabel")}
                  </p>
                  {it.aiDraft ? (
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {it.aiDraft}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">
                      {t("list.noAnswer")}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function formatRelative(
  iso: string,
  _locale: "ko" | "en",
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const diffMin = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (diffMin < 1) return t("list.timeJustNow");
  if (diffMin < 60) return t("list.timeMinutesAgo", { n: diffMin });
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return t("list.timeHoursAgo", { n: diffHr });
  const diffDay = Math.round(diffHr / 24);
  return t("list.timeDaysAgo", { n: diffDay });
}
