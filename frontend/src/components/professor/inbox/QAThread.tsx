"use client";

import { useState } from "react";
import { useInboxI18n } from "./useInboxI18n";
import AnswerComposer from "./AnswerComposer";
import type { InboxAnswerPayload, InboxItem } from "./inboxTypes";

interface Props {
  item: InboxItem | null;
  onAnswer: (
    id: string,
    payload: InboxAnswerPayload,
  ) => Promise<{ ok: boolean; deferred: boolean }>;
}

/**
 * 인박스 우측 패널 — 선택한 질문의 학생/슬라이드 컨텍스트 + RAG 초안 + 답변기.
 *
 * 기획서 §6.3 의 4가지 표시 항목:
 *   - 어느 영상 어느 시점에서 질문했는가
 *   - 학생이 본 슬라이드 미리보기 (현재 슬라이드 번호 칩으로 대체 — 실 썸네일은
 *     백엔드 도착 시 `inbox.thread.slidePreview` 영역에 합성)
 *   - AI 답변 초안
 *   - 유사 질문 클러스터링 (Pro)
 */
export default function QAThread({ item, onAnswer }: Props) {
  const { t } = useInboxI18n();
  const [showRagOriginal, setShowRagOriginal] = useState(false);

  if (!item) {
    return (
      <aside
        data-testid="inbox-thread-empty"
        className="bg-white border border-gray-200 rounded-2xl p-8 sm:p-10 text-center text-sm text-gray-500"
        aria-label={t("thread.panelTitle")}
      >
        {t("thread.selectPrompt")}
      </aside>
    );
  }

  return (
    <aside
      data-testid={`inbox-thread-${item.id}`}
      className="space-y-4"
      aria-label={t("thread.panelTitle")}
    >
      {/* 학생/강의 컨텍스트 */}
      <header className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 mb-1">
          {t("thread.panelTitle")}
        </p>
        <h3 className="text-base font-semibold text-gray-900 leading-snug">
          {item.question}
        </h3>
        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-gray-400 uppercase tracking-[0.12em] text-[10px]">
              {t("thread.studentLabel")}
            </dt>
            <dd className="mt-0.5 text-sm text-gray-800">
              {item.student.name ?? t("list.studentAnonymous")}
              {item.student.studentNumber && (
                <span className="text-gray-400 ml-1.5 tabular-nums">
                  ({item.student.studentNumber})
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-gray-400 uppercase tracking-[0.12em] text-[10px]">
              {t("thread.lectureLabel")}
            </dt>
            <dd className="mt-0.5 text-sm text-gray-800 truncate">
              <span className="text-gray-500">
                {item.lecture.courseTitle}
              </span>{" "}
              · {item.lecture.lectureTitle}
            </dd>
          </div>
          <div>
            <dt className="text-gray-400 uppercase tracking-[0.12em] text-[10px]">
              {t("thread.askedAt")}
            </dt>
            <dd
              className="mt-0.5 text-sm text-gray-800 tabular-nums"
              title={item.createdAt}
            >
              {new Date(item.createdAt).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-gray-400 uppercase tracking-[0.12em] text-[10px]">
              {t("thread.slideLabel")}
            </dt>
            <dd className="mt-0.5 text-sm text-gray-800">
              {item.rag.topSlideNumbers.length === 0 ? (
                <span className="text-gray-400">
                  {t("thread.noSlideContext")}
                </span>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {item.rag.topSlideNumbers.map((n) => (
                    <li
                      key={n}
                      data-testid={`inbox-thread-slide-${n}`}
                      className="inline-flex items-center gap-1 rounded-md bg-gray-50 border border-gray-200 px-2 py-0.5 tabular-nums text-xs"
                    >
                      {t("thread.slidePreview", { n })}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
      </header>

      {/* RAG 초안 또는 out-of-scope 안내 */}
      {item.inScope ? (
        <section
          data-testid="inbox-thread-ai-draft"
          className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="text-sm font-semibold text-gray-900">
              {t("thread.aiDraftLabel")}
            </h4>
            {item.rag.topSimilarity !== null && (
              <span
                className="text-[11px] tabular-nums text-gray-400"
                data-testid="inbox-thread-similarity"
              >
                {t("list.similarityLabel", {
                  value: Math.round(item.rag.topSimilarity * 100),
                })}
              </span>
            )}
          </div>
          {item.aiDraft ? (
            <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
              {item.aiDraft}
            </p>
          ) : (
            <p className="text-sm text-gray-400">{t("thread.aiDraftMissing")}</p>
          )}

          {item.rag.similarQuestionCount &&
            item.rag.similarQuestionCount > 1 && (
              <div
                data-testid="inbox-thread-cluster"
                className="mt-3 rounded-xl bg-amber-50/70 border border-amber-200 p-3 text-xs text-amber-900"
              >
                <p className="font-medium mb-1">
                  {t("thread.similarCluster", {
                    n: item.rag.similarQuestionCount,
                  })}
                </p>
                <button
                  type="button"
                  className="text-[11px] font-semibold text-amber-800 underline-offset-2 hover:underline"
                >
                  {t("thread.similarClusterCta")}
                </button>
              </div>
            )}
        </section>
      ) : (
        <section
          data-testid="inbox-thread-off-topic"
          className="bg-white border border-rose-200 rounded-2xl p-4 sm:p-5"
        >
          <p className="text-sm font-semibold text-rose-700 mb-1">
            {t("thread.outOfScope")}
          </p>
          <p className="text-xs leading-relaxed text-rose-700/80">
            {t("thread.outOfScopeDesc")}
          </p>
        </section>
      )}

      {/* 교수자 확정 답변 (있다면) */}
      {item.professorAnswered && item.professorAnswer && (
        <section
          data-testid="inbox-thread-professor-answer"
          className="bg-white border border-emerald-200 rounded-2xl p-4 sm:p-5"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="text-sm font-semibold text-emerald-800">
              {t("thread.professorAnswerLabel")}
            </h4>
            {item.aiDraft && item.aiDraft !== item.professorAnswer && (
              <button
                type="button"
                data-testid="inbox-thread-toggle-rag"
                onClick={() => setShowRagOriginal((s) => !s)}
                className="text-[11px] font-medium text-gray-500 hover:text-gray-800 transition motion-reduce:transition-none"
              >
                {showRagOriginal
                  ? t("thread.hideRagOriginal")
                  : t("thread.showRagOriginal")}
              </button>
            )}
          </div>
          <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
            {item.professorAnswer}
          </p>
          {showRagOriginal && item.aiDraft && (
            <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
              <p className="text-[10px] uppercase tracking-[0.14em] text-gray-400 mb-1">
                {t("thread.ragOriginalLabel")}
              </p>
              <p className="text-sm leading-relaxed text-gray-500 whitespace-pre-wrap">
                {item.aiDraft}
              </p>
            </div>
          )}
        </section>
      )}

      {/* 답변 작성 — 항목 변경 시 fresh mount */}
      <AnswerComposer
        key={item.id}
        item={item}
        onSubmit={(payload) => onAnswer(item.id, payload)}
      />
    </aside>
  );
}
