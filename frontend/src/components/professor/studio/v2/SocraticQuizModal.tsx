"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  QUIZ_DIFFICULTY_LABEL,
  QUIZ_TYPE_LABEL,
} from "../studioTypes";
import type {
  QuizDraft,
  QuizInsertionPoint,
  SocraticMessage,
} from "../studioTypes";
import { confirmQuiz, socraticTurn } from "../quizApi";

/** 클로드 응답의 마크다운 강조 기호 제거 — 채팅 버블엔 일반 문장만 표시. */
function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/`+/g, "");
}

/**
 * Studio v2 — 소크라테스식 퀴즈 저작 대화 모달.
 *
 * 우측 "퀴즈/문제" 패널의 "문제 만들기"로 열린다. 클로드(Sonnet)가 슬라이드 경계
 * 내용을 근거로 초안+근거를 제시하고 유도 질문을 던지면, 교수자가 답하며 다듬어
 * "이 문제로 확정"한다. 프론트는 화면에 보이는 턴만 보관하고(숨은 kickoff 는 백엔드가
 * 선행), 매 요청에 그 히스토리를 함께 보낸다.
 *
 * 비용 표시 정책(planning/05 §1.1): 대화 비용은 노출하지 않는다(서버 CostLog 기록만).
 */
export interface SocraticQuizModalProps {
  open: boolean;
  lectureId: string;
  /** 대상 삽입 지점 (경계·유형·난이도). null 이면 렌더만 하고 동작 없음. */
  point: QuizInsertionPoint | null;
  onClose: () => void;
  /** 저장 성공 시 — 부모가 해당 지점의 authoredId·savedDraft 갱신 + 모달 닫기 담당. */
  onConfirmed: (result: { id: string; boundaryIndex: number; draft: QuizDraft }) => void;
}

const overlayStyle = (open: boolean): CSSProperties => ({
  position: "fixed",
  inset: 0,
  background: "rgba(10, 10, 10, 0.6)",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
  zIndex: 110,
  display: open ? "flex" : "none",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
});

const modalStyle: CSSProperties = {
  width: "100%",
  maxWidth: 880,
  height: "min(86vh, 720px)",
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  borderRadius: 18,
  boxShadow: "0 24px 60px rgba(10, 10, 10, 0.24)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

export default function SocraticQuizModal({
  open,
  lectureId,
  point,
  onClose,
  onConfirmed,
}: SocraticQuizModalProps) {
  const [messages, setMessages] = useState<SocraticMessage[]>([]);
  const [draft, setDraft] = useState<QuizDraft | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const runTurn = useCallback(
    async (
      visible: SocraticMessage[],
      pt: QuizInsertionPoint,
      currentDraft: QuizDraft | null = null,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const res = await socraticTurn(lectureId, {
          insertAfterSlideIndex: pt.boundaryIndex,
          questionType: pt.questionType,
          difficulty: pt.difficulty,
          messages: visible,
          currentDraft,
        });
        setMessages([...visible, { role: "assistant", content: stripMarkdown(res.reply) }]);
        if (res.draft) setDraft(res.draft);
        setDone(res.done);
      } catch {
        setError(
          "대화를 불러오지 못했습니다. 백엔드 연결을 확인하거나 잠시 후 다시 시도해주세요.",
        );
      } finally {
        setLoading(false);
      }
    },
    [lectureId],
  );

  // 모달이 열리면(open && point) 세션을 초기화하고 첫 턴을 자동 전송한다.
  // react-hooks/set-state-in-effect: effect 본문 동기 setState 회피 — rAF 로 비동기화.
  useEffect(() => {
    if (!open || !point) {
      startedRef.current = false;
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    const pt = point;
    const handle = requestAnimationFrame(() => {
      setDone(false);
      setError(null);
      setInput("");
      setConfirming(false);
      if (pt.authoredId && pt.savedDraft) {
        // 저장된 문제 다시 보기/수정 — 자동 대화 없이 미리보기로 보여준다.
        setDraft(pt.savedDraft);
        setMessages([
          {
            role: "assistant",
            content:
              "이전에 저장한 문제예요. 오른쪽 미리보기를 확인하시고, 바꾸고 싶은 점을 알려주시면 다듬어 드릴게요. 그대로 두시려면 ‘이 문제로 확정’을 누르세요.",
          },
        ]);
      } else {
        setMessages([]);
        setDraft(null);
        void runTurn([], pt, null);
      }
    });
    return () => cancelAnimationFrame(handle);
  }, [open, point, runTurn]);

  // 새 메시지가 쌓이면 맨 아래로 스크롤.
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const handle = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(handle);
  }, [messages, loading]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || loading || !point) return;
    const visible: SocraticMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(visible);
    setInput("");
    // 현재 미리보기 문제를 컨텍스트로 함께 전달(수정 모드에서 모델이 기준 삼도록).
    void runTurn(visible, point, draft);
  };

  const handleConfirm = async () => {
    if (!draft || !point || confirming) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await confirmQuiz(lectureId, point.boundaryIndex, draft, point.revealAnswer);
      // 서버가 객관식 정답 위치를 무작위 재배치하므로, 저장본은 응답의 draft 를 쓴다.
      onConfirmed({
        id: res.id,
        boundaryIndex: res.insert_after_slide_index,
        draft: res.draft ?? draft,
      });
    } catch {
      setError("문제 저장에 실패했습니다. 입력을 확인하거나 잠시 후 다시 시도해주세요.");
      setConfirming(false);
    }
  };

  if (!open || !point) return <div style={overlayStyle(false)} aria-hidden="true" />;

  const boundaryLabel = `슬라이드 ${point.boundaryIndex + 1} ↔ ${point.boundaryIndex + 2} 사이`;
  const revealLabel = point.revealAnswer ? "정답 영상 공개" : "정답 비공개(대면 활용)";
  const metaLabel = `${QUIZ_TYPE_LABEL[point.questionType]} · 난이도 ${QUIZ_DIFFICULTY_LABEL[point.difficulty]} · ${revealLabel}`;

  return (
    <div style={overlayStyle(open)} role="dialog" aria-modal="true" aria-labelledby="socratic-h">
      <div style={modalStyle}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--line)",
            flexShrink: 0,
          }}
        >
          <div>
            <h2 id="socratic-h" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
              퀴즈 만들기 — {boundaryLabel}
            </h2>
            <div style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 2 }}>
              {metaLabel} · 클로드와 대화하며 문제를 다듬어 확정하세요.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              display: "inline-grid",
              placeItems: "center",
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid var(--line-strong)",
              background: "var(--bg-card)",
              cursor: "pointer",
              color: "var(--text-subtle)",
            }}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — 좌: 대화 / 우: 문제 미리보기 */}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          {/* 대화 */}
          <div style={{ flex: "1.4 1 0", display: "flex", flexDirection: "column", minWidth: 0, borderRight: "1px solid var(--line)" }}>
            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
              {messages.map((m, i) => (
                <ChatBubble key={i} role={m.role} content={m.content} />
              ))}
              {loading && <TypingBubble />}
            </div>

            {/* 입력 */}
            <div style={{ borderTop: "1px solid var(--line)", padding: "12px 14px", flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="클로드의 질문에 답하거나 원하는 방향을 알려주세요…"
                  rows={2}
                  disabled={loading}
                  aria-label="교수자 답변 입력"
                  style={{
                    flex: 1,
                    resize: "none",
                    padding: "9px 11px",
                    border: "1px solid var(--line-strong)",
                    borderRadius: 9,
                    fontSize: 13,
                    fontFamily: "inherit",
                    color: "var(--text)",
                    background: "var(--bg)",
                    lineHeight: 1.5,
                  }}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  aria-label="전송"
                  style={{
                    flexShrink: 0,
                    display: "inline-grid",
                    placeItems: "center",
                    width: 38,
                    height: 38,
                    borderRadius: 9,
                    border: "none",
                    background: loading || !input.trim() ? "var(--line-strong)" : "linear-gradient(135deg, #FFB627, #E89E0E)",
                    color: loading || !input.trim() ? "var(--text-subtle)" : "#0A0A0A",
                    cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* 문제 미리보기 + 확정 */}
          <div style={{ flex: "1 1 0", display: "flex", flexDirection: "column", minWidth: 300, background: "var(--bg)" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-subtle)", textTransform: "uppercase", marginBottom: 10 }}>
                문제 미리보기
              </div>
              <DraftPreview draft={draft} />
            </div>

            {error && (
              <div style={{ padding: "0 18px 10px", fontSize: 11.5, color: "var(--danger, #DC2626)", lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            <div style={{ borderTop: "1px solid var(--line)", padding: "12px 18px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {done && draft && (
                <div style={{ fontSize: 11.5, color: "var(--gold-on-light, #B88308)", fontWeight: 600 }}>
                  클로드가 문제 확정을 제안했습니다.
                </div>
              )}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!draft || loading || confirming}
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: !draft || loading || confirming ? "var(--line-strong)" : "linear-gradient(135deg, #10B981, #059669)",
                  color: !draft || loading || confirming ? "var(--text-subtle)" : "#FFFFFF",
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: !draft || loading || confirming ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {confirming ? "저장 중…" : "이 문제로 확정"}
              </button>
              <div style={{ fontSize: 11, color: "var(--text-subtle)", lineHeight: 1.5 }}>
                확정하면 {boundaryLabel}에 형성평가 문제로 저장됩니다.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────── helpers ───────── */

function ChatBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "84%",
          padding: "9px 12px",
          borderRadius: 12,
          fontSize: 13,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: isUser ? "linear-gradient(135deg, #FFB627, #E89E0E)" : "var(--bg)",
          color: isUser ? "#0A0A0A" : "var(--text)",
          border: isUser ? "none" : "1px solid var(--line)",
        }}
      >
        {content}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div
        style={{
          padding: "10px 14px",
          borderRadius: 12,
          background: "var(--bg)",
          border: "1px solid var(--line)",
          display: "inline-flex",
          gap: 4,
          alignItems: "center",
        }}
        aria-label="클로드가 작성 중"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "var(--text-subtle)",
              animation: `socratic-typing 1.2s ${i * 0.18}s infinite ease-in-out`,
            }}
          />
        ))}
        <style>{`
          @keyframes socratic-typing {
            0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
            30% { opacity: 1; transform: translateY(-3px); }
          }
          @media (prefers-reduced-motion: reduce) {
            @keyframes socratic-typing { 0%, 100% { opacity: 0.5; } }
          }
        `}</style>
      </div>
    </div>
  );
}

function DraftPreview({ draft }: { draft: QuizDraft | null }) {
  if (!draft) {
    return (
      <div style={{ fontSize: 12.5, color: "var(--text-subtle)", lineHeight: 1.6 }}>
        아직 확정할 문제 초안이 없습니다. 클로드의 제안과 질문에 답하면 여기에 문제가 나타납니다.
      </div>
    );
  }
  const correctIdx =
    draft.question_type === "multiple_choice" && draft.correct_answer != null
      ? Number(draft.correct_answer)
      : -1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
        {draft.content || "(문제 본문 작성 중…)"}
      </div>

      {draft.question_type === "multiple_choice" && Array.isArray(draft.options) && (
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {draft.options.map((opt, i) => {
            const correct = i === correctIdx;
            return (
              <li
                key={i}
                style={{
                  display: "flex",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  background: correct ? "var(--gold-soft)" : "var(--bg-card)",
                  border: correct ? "1px solid var(--gold-on-light, #B88308)" : "1px solid var(--line)",
                  color: "var(--text)",
                }}
              >
                <span style={{ fontWeight: 700, color: correct ? "var(--gold-on-light, #B88308)" : "var(--text-subtle)" }}>
                  {String.fromCharCode(65 + i)}
                </span>
                <span>{opt}</span>
                {correct && (
                  <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, color: "var(--gold-on-light, #B88308)" }}>
                    정답
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {draft.question_type === "short_answer" && draft.correct_answer && (
        <div style={{ padding: "9px 11px", borderRadius: 8, background: "var(--bg-card)", border: "1px solid var(--line)" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-subtle)", marginBottom: 4 }}>모범답안</div>
          <div style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
            {draft.correct_answer}
          </div>
        </div>
      )}

      {draft.explanation && (
        <div style={{ padding: "9px 11px", borderRadius: 8, background: "var(--bg-card)", border: "1px solid var(--line)" }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-subtle)", marginBottom: 4 }}>해설</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
            {draft.explanation}
          </div>
        </div>
      )}
    </div>
  );
}
