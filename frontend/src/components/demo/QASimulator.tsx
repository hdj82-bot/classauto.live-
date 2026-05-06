"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEMO_FIELDS,
  DEMO_INPUT_MAX,
  DEMO_QUESTION_LIMIT,
  isOnTopic,
  type DemoAnswer,
  type DemoField,
} from "./demoTypes";
import { useDemoI18n } from "./useDemoI18n";

interface Props {
  field: DemoField;
  onLimitReached?: () => void;
}

interface ChatTurn {
  id: string;
  role: "user" | "assistant" | "greeting";
  content: string;
  answer?: DemoAnswer;
}

let turnIdCounter = 0;
const nextId = () => `turn-${++turnIdCounter}`;

/**
 * Q&A 시뮬레이터.
 *
 * docs/planning/04-demo-page.md Section 7-10 참조.
 * - 추천 질문 카드 클릭 → 자동 입력·전송
 * - 강의 외 질문 → 자동 거부 (RAG 범위 제한 시연)
 * - 3건 사용 시 onLimitReached 콜백 → 부모(데모 페이지)가 CTA 모달 노출
 *
 * 베타 단계는 mock 응답. 추후 backend `/api/demo/qa` 로 교체할 수 있도록
 * `DemoAnswer` 타입을 통해 분리.
 */
export default function QASimulator({ field, onLimitReached }: Props) {
  const { t } = useDemoI18n();
  const cfg = DEMO_FIELDS[field];

  const [chat, setChat] = useState<ChatTurn[]>(() => [
    { id: nextId(), role: "greeting", content: "" },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [used, setUsed] = useState(0);
  const [limitNotified, setLimitNotified] = useState(false);

  const remaining = DEMO_QUESTION_LIMIT - used;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // field 변경 시 대화는 부모에서 `key={field}` 로 컴포넌트를 remount 하여
  // 자연스럽게 초기화한다. (react-hooks/set-state-in-effect 회피)

  // 새 턴이 추가되면 스크롤 끝까지 — jsdom 등 scrollTo 미지원 환경 보호
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof el.scrollTo !== "function") return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat, pending]);

  const buildAnswer = useCallback(
    (question: string): DemoAnswer => {
      const onTopic = isOnTopic(question, field);

      if (!onTopic) {
        return {
          id: nextId(),
          offTopic: true,
          body: t("answer.offTopicBody"),
          sourceSlide: null,
          videoTimeRange: null,
        };
      }

      // 추천 질문 키 매칭 → 사전 작성된 mock 응답 사용
      const matchedIdx = cfg.suggestedKeys.findIndex(
        (k) => t(k).trim() === question.trim(),
      );
      const answerKey =
        matchedIdx >= 0 ? cfg.answerKeys[matchedIdx] : cfg.answerKeys[0];

      return {
        id: nextId(),
        offTopic: false,
        body: t(answerKey),
        sourceSlide: t(cfg.sourceSlideKey),
        videoTimeRange: t(cfg.videoTimeRangeKey),
      };
    },
    [cfg, field, t],
  );

  const ask = useCallback(
    (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || pending || remaining <= 0) return;

      const userTurn: ChatTurn = {
        id: nextId(),
        role: "user",
        content: trimmed,
      };
      setChat((prev) => [...prev, userTurn]);
      setInput("");
      setPending(true);

      // mock latency — 프로덕션에선 실제 API 호출 시간
      const delay = 700;
      setTimeout(() => {
        const answer = buildAnswer(trimmed);
        setChat((prev) => [
          ...prev,
          {
            id: answer.id,
            role: "assistant",
            content: answer.body,
            answer,
          },
        ]);
        setPending(false);
        setUsed((u) => {
          const next = u + 1;
          if (next >= DEMO_QUESTION_LIMIT) {
            // 다음 tick 에서 부모에 알림 — 렌더 사이클 안전
            queueMicrotask(() => {
              if (!limitNotified) {
                setLimitNotified(true);
                onLimitReached?.();
              }
            });
          }
          return next;
        });
      }, delay);
    },
    [buildAnswer, limitNotified, onLimitReached, pending, remaining],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    ask(input);
  };

  const handleSuggested = (key: string) => {
    ask(t(key));
  };

  // 추천 질문 — 이미 사용된 건 비활성화
  const suggested = useMemo(() => {
    const usedQuestions = new Set(
      chat.filter((c) => c.role === "user").map((c) => c.content.trim()),
    );
    return cfg.suggestedKeys.map((k) => ({
      key: k,
      text: t(k),
      disabled: usedQuestions.has(t(k).trim()),
    }));
  }, [cfg.suggestedKeys, chat, t]);

  return (
    <section
      className="flex flex-col h-full bg-[#141414] border border-white/10 rounded-2xl overflow-hidden"
      aria-label={t("experience.chatTitle")}
    >
      {/* Header */}
      <header className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-lg">💬</span>
          <h2 className="text-sm font-semibold text-white">
            {t("experience.chatTitle")}
          </h2>
        </div>
        <span
          className="text-[11px] text-white/55 tabular-nums"
          data-testid="demo-questions-counter"
        >
          {t("experience.questionsRemaining", {
            remaining,
            max: DEMO_QUESTION_LIMIT,
          })}
        </span>
      </header>

      {/* Messages */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-[320px] max-h-[480px]"
        role="log"
        aria-live="polite"
      >
        {chat.map((turn) =>
          turn.role === "greeting" ? (
            <div key={turn.id} className="flex gap-3 items-start animate-fade-in">
              <span aria-hidden="true" className="text-xl">🤖</span>
              <p className="text-sm text-white/80 leading-relaxed">
                {t("experience.chatGreeting")}
              </p>
            </div>
          ) : turn.role === "user" ? (
            <div key={turn.id} className="flex justify-end animate-fade-in">
              <div className="max-w-[85%] px-4 py-2.5 rounded-2xl bg-[#FFB627] text-[#0A0A0A] text-sm font-medium">
                {turn.content}
              </div>
            </div>
          ) : (
            <AssistantBubble key={turn.id} turn={turn} />
          ),
        )}

        {pending && (
          <div className="flex gap-3 items-start" aria-live="polite">
            <span aria-hidden="true" className="text-xl">🤖</span>
            <div className="flex items-center gap-1 mt-2">
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse" />
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse [animation-delay:120ms]" />
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse [animation-delay:240ms]" />
              <span className="sr-only">{t("experience.sending")}</span>
            </div>
          </div>
        )}

        {remaining === 1 && !pending && (
          <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
            {t("experience.lastQuestionHint")}
          </p>
        )}
      </div>

      {/* Suggested questions */}
      {remaining > 0 && (
        <div className="px-5 pt-2 pb-3 border-t border-white/10">
          <p className="text-[11px] text-white/45 mb-2">
            {t("experience.suggestedHeader")}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {suggested.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => handleSuggested(s.key)}
                disabled={s.disabled || pending}
                className={[
                  "shrink-0 text-xs px-3 py-2 rounded-full transition",
                  "border border-white/10 bg-white/5 text-white/80",
                  "hover:bg-white/10 hover:border-[#FFB627]/40",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                ].join(" ")}
                data-testid={`demo-suggested-${s.key}`}
              >
                {s.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="px-5 pt-3 pb-4 border-t border-white/10 bg-black/20"
        aria-label={t("experience.send")}
      >
        {remaining <= 0 ? (
          <div
            className="rounded-xl bg-[#FFB627]/10 border border-[#FFB627]/30 p-4 text-center"
            data-testid="demo-limit-reached"
          >
            <p className="text-sm font-semibold text-white mb-1">
              {t("experience.limitReachedTitle")}
            </p>
            <p className="text-xs text-white/65 mb-3">
              {t("experience.limitReachedDesc")}
            </p>
            <a
              href="/beta-apply"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-[#FFB627] text-[#0A0A0A] font-semibold text-sm"
            >
              {t("experience.limitReachedCta")}
            </a>
          </div>
        ) : (
          <div className="flex gap-2 items-end">
            <label className="sr-only" htmlFor="demo-q-input">
              {t("a11y.questionInput")}
            </label>
            <textarea
              id="demo-q-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, DEMO_INPUT_MAX))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(input);
                }
              }}
              placeholder={t("experience.inputPlaceholder")}
              rows={1}
              maxLength={DEMO_INPUT_MAX}
              data-testid="demo-input"
              className={[
                "flex-1 resize-none bg-white/5 border border-white/10 rounded-xl",
                "px-3 py-2.5 text-sm text-white placeholder-white/35",
                "focus:outline-none focus:border-[#FFB627]/60",
              ].join(" ")}
            />
            <button
              type="submit"
              disabled={!input.trim() || pending}
              data-testid="demo-send"
              className={[
                "shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold",
                "bg-[#FFB627] text-[#0A0A0A]",
                "hover:bg-[#FFC74D] transition",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              {t("experience.send")}
            </button>
          </div>
        )}
        {remaining > 0 && (
          <p className="text-right text-[11px] text-white/40 mt-1 tabular-nums">
            {t("experience.inputCounter", {
              count: input.length,
              max: DEMO_INPUT_MAX,
            })}
          </p>
        )}
      </form>
    </section>
  );
}

/** AI 답변 버블 — 출처/영상시점/거부 분기 시각화 */
function AssistantBubble({ turn }: { turn: ChatTurn }) {
  const { t } = useDemoI18n();
  const a = turn.answer;
  if (!a) return null;

  return (
    <div
      className="flex gap-3 items-start animate-fade-in"
      data-testid={a.offTopic ? "demo-answer-offtopic" : "demo-answer-ontopic"}
    >
      <span aria-hidden="true" className="text-xl">🤖</span>
      <div className="flex-1 space-y-3">
        {a.offTopic ? (
          <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/5">
            <p className="text-sm font-semibold text-rose-200 mb-1">
              {t("answer.offTopicTitle")}
            </p>
            <p className="text-sm text-white/75 leading-relaxed">{a.body}</p>
            <span className="inline-block mt-3 text-[10px] uppercase tracking-[0.16em] text-rose-300/80">
              {t("answer.offTopicTag")}
            </span>
          </div>
        ) : (
          <>
            <p className="text-sm text-white/85 leading-relaxed">{a.body}</p>
            {a.sourceSlide && a.videoTimeRange && (
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white/60 space-y-1">
                <p>
                  📍 <span className="text-white/80">{t("answer.sourceLabel")}</span>:{" "}
                  <span className="font-medium text-white/90">{a.sourceSlide}</span>
                </p>
                <p>
                  ⏱️ <span className="text-white/80">{t("answer.videoTime")}</span>:{" "}
                  <span className="font-medium text-white/90 tabular-nums">{a.videoTimeRange}</span>
                </p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="text-[11px] px-2.5 py-1 rounded-full border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition"
                disabled
                title="W4 단계에서 TTS 연동 예정"
              >
                {t("answer.replayAudio")}
              </button>
              <button
                type="button"
                className="text-[11px] px-2.5 py-1 rounded-full border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition"
                disabled
                title="W4 단계에서 영상 점프 연동 예정"
              >
                {t("answer.jumpToVideo")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
