"use client";

import type { CSSProperties, ReactNode } from "react";
import { LANGUAGES, QUIZ_DIFFICULTY_LABEL } from "../studioTypes";
import type {
  LangCode,
  QuizDifficulty,
  QuizInsertionPoint,
  QuizQuestionType,
  TtsProvider,
  TtsVoice,
  VoiceGender,
} from "../studioTypes";
import type { SeedQuestionDraft, SeedQuestionStatus } from "../seedQuestionsApi";

/**
 * Studio v2 — 우측 settings panel.
 *
 * docs/prototypes/05-studio-flow.extracted.html `.settings` + accordion 그대로.
 * 아코디언: 아바타 · 음성(이중 TTS) · 퀴즈/문제.
 * (강의 설정·Q&A 범위 섹션은 제거 — 링크 만료/집중 경고는 미사용, Q&A 는
 *  업로드 자료 제한·외부 차단이 백엔드 기본 가드레일이라 토글이 불필요했다.)
 *
 * 비용 미터(`.cost`) 는 planning/05 §1.1 비용 표시 금지 정책에 따라 제외.
 * 대신 우측 패널 하단에 "월 한도" 진행 표시만 남긴다 (편수 기반).
 */
export interface SettingsPanelProps {
  avatarName: string;
  ttsProvider?: TtsProvider;
  voiceGender?: VoiceGender;
  monthlyUsed?: number;
  monthlyLimit?: number | null;
  // ── 음성·자막 ──────────────────────────────────────────────────────────────
  /** 영상 음성(TTS) 언어. */
  voiceLang: LangCode;
  /** 영상 자막 언어. null = 음성과 동일. */
  subtitleLang: LangCode | null;
  /** @deprecated 보이스 선택은 "Q&A 아바타 선택" 페이지로 이동 — 패널에선 미사용(렌더 시 voice_id 는 강의에 저장된 값 사용). */
  voiceId?: string | null;
  /** 발화 속도 배율 (1.0 = 기본). 이 패널에 남는 유일한 음성 컨트롤. */
  voiceSpeed?: number;
  /** @deprecated 보이스 목록(드롭다운)은 아바타 페이지로 이동 — 패널에선 미사용. */
  voices?: TtsVoice[];
  /** @deprecated 보이스 목록 로딩 — 패널에선 미사용. */
  voicesLoading?: boolean;
  /** @deprecated 음성 언어 선택 UI 제거됨 — voiceLang 은 자막 "동일" 비교용으로만 유지. */
  onChangeVoiceLang?: (lang: LangCode) => void;
  /** null 전달 = 자막을 음성과 동일하게. */
  onChangeSubtitleLang?: (lang: LangCode | null) => void;
  /** @deprecated 보이스 선택이 아바타 페이지로 이동해 패널에선 호출하지 않는다. */
  onChangeVoiceId?: (id: string | null) => void;
  onChangeVoiceSpeed?: (speed: number) => void;
  // ───────────────────────────────────────────────────────────────────────────
  onChangeAvatar?: () => void;
  /** 영상에서 아바타 크기 배율 (1.0 = 기본). 미리보기 PiP·렌더에 함께 반영. */
  avatarScale?: number;
  onChangeAvatarScale?: (scale: number) => void;
  // ── 퀴즈/문제 (인터랙티브 퀴즈 저작) ──────────────────────────────────────────
  /** 영상 슬라이드 총 개수 — 삽입 경계 드롭다운 생성용. */
  slideCount?: number;
  /** 현재 설정된 삽입 지점들 (최대 3). */
  quizPoints?: QuizInsertionPoint[];
  onAddQuizPoint?: () => void;
  onRemoveQuizPoint?: (index: number) => void;
  onChangeQuizPoint?: (index: number, patch: Partial<QuizInsertionPoint>) => void;
  /** "문제 만들기/수정" — 소크라테스 대화 모달 오픈. */
  onOpenSocratic?: (index: number) => void;
  // ── 예상 질문 (Q&A 사전 답변) ────────────────────────────────────────────────
  /** 등록된 사전 질문들 (최대 3). 비면 빈 배열. 교수자는 질문만 입력한다. */
  seedQuestions?: SeedQuestionDraft[];
  onAddSeedQuestion?: () => void;
  onRemoveSeedQuestion?: (index: number) => void;
  onChangeSeedQuestion?: (index: number, question: string) => void;
}

const settingsStyle: CSSProperties = {
  width: 340,
  flexShrink: 0,
  background: "var(--bg-card)",
  borderLeft: "1px solid var(--line)",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  overflow: "hidden",
};

const scrollStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "14px 18px 16px",
};

const accordionStyle: CSSProperties = {
  borderBottom: "1px solid var(--line)",
  padding: "12px 0",
};

const summaryStyle: CSSProperties = {
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 8,
  listStyle: "none",
  padding: "4px 0",
  userSelect: "none",
};

const summaryTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text)",
};

const summaryValStyle: CSSProperties = {
  marginLeft: "auto",
  fontSize: 11.5,
  color: "var(--text-subtle)",
  fontWeight: 500,
};

const aBodyStyle: CSSProperties = {
  padding: "8px 0 4px 30px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const fieldValStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  background: "var(--bg)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  fontSize: 12.5,
  fontWeight: 500,
};

const segStyle: CSSProperties = {
  display: "inline-flex",
  padding: 2,
  background: "var(--bg)",
  border: "1px solid var(--line)",
  borderRadius: 7,
};

const segOptStyle = (on: boolean): CSSProperties => ({
  padding: "3px 10px",
  borderRadius: 5,
  fontSize: 11.5,
  // 선택 상태를 확실히: 굵게 + 골드 텍스트 + 골드 배경 + 골드 링(레이아웃 시프트 없이 inset).
  fontWeight: on ? 700 : 500,
  color: on ? "var(--gold-on-light, #B88308)" : "var(--text-muted)",
  cursor: "pointer",
  background: on ? "var(--gold-soft)" : "transparent",
  boxShadow: on ? "inset 0 0 0 1px var(--gold-on-light, #B88308)" : "none",
  border: "none",
  fontFamily: "inherit",
  transition: "all 140ms var(--ease-out)",
});

const switchStyle = (on: boolean): CSSProperties => ({
  position: "relative",
  width: 30,
  height: 18,
  background: on ? "linear-gradient(135deg, #FFB627, #E89E0E)" : "var(--line-strong)",
  borderRadius: 999,
  cursor: "pointer",
  transition: "background 180ms var(--ease-out)",
  border: "none",
  flexShrink: 0,
});

const subSectionLabelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--text-subtle)",
};

const subTagStyle = (tone: "gold" | "violet"): CSSProperties => ({
  fontSize: 10,
  fontWeight: 700,
  padding: "1px 7px",
  borderRadius: 4,
  letterSpacing: "0.04em",
  background: tone === "gold" ? "var(--gold-soft)" : "rgba(167, 139, 250, 0.12)",
  color: tone === "gold" ? "var(--gold-on-light, #B88308)" : "#7c3aed",
});

const selectStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "var(--bg)",
  border: "1px solid var(--line-strong)",
  borderRadius: 8,
  fontSize: 12.5,
  fontWeight: 500,
  color: "var(--text)",
  fontFamily: "inherit",
  cursor: "pointer",
};

const textareaStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "var(--bg-card)",
  border: "1px solid var(--line-strong)",
  borderRadius: 8,
  fontSize: 12.5,
  fontWeight: 500,
  color: "var(--text)",
  fontFamily: "inherit",
  lineHeight: 1.5,
  resize: "vertical",
};

function Switch({ on, onClick, label }: { on: boolean; onClick?: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      style={switchStyle(on)}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 2,
          left: 2,
          width: 14,
          height: 14,
          borderRadius: 999,
          background: "#FFFFFF",
          boxShadow: "0 1px 3px rgba(0,0,0,0.20)",
          transform: on ? "translateX(12px)" : "translateX(0)",
          transition: "transform 180ms var(--ease-out)",
        }}
      />
    </button>
  );
}

function CaretIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: "var(--text-subtle)", transition: "transform 180ms var(--ease-out)" }}
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function H4Icon({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-grid place-items-center flex-shrink-0"
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
      }}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

export default function SettingsPanel({
  avatarName,
  voiceLang,
  subtitleLang,
  voiceSpeed = 1.0,
  onChangeSubtitleLang,
  onChangeVoiceSpeed,
  onChangeAvatar,
  avatarScale = 1.0,
  onChangeAvatarScale,
  slideCount = 0,
  quizPoints = [],
  onAddQuizPoint,
  onRemoveQuizPoint,
  onChangeQuizPoint,
  onOpenSocratic,
  seedQuestions = [],
  onAddSeedQuestion,
  onRemoveSeedQuestion,
  onChangeSeedQuestion,
}: SettingsPanelProps) {
  // 자막이 음성과 동일한지 — null 이거나 voiceLang 과 같으면 "동일".
  const subtitleSame = subtitleLang === null || subtitleLang === voiceLang;
  // 아코디언 헤더 요약: 발화 속도 배율(보이스 선택은 아바타 페이지로 이동).
  const summaryVoiceVal = `${voiceSpeed.toFixed(1)}×`;
  // 퀴즈 아코디언 요약: 개수 + 작성됨 수.
  const authoredCount = quizPoints.filter((p) => p.authoredId !== null).length;
  const summaryQuizVal =
    quizPoints.length === 0
      ? "없음"
      : `${quizPoints.length}개${authoredCount > 0 ? ` · ${authoredCount} 작성됨` : ""}`;
  // 예상 질문 아코디언 요약: 질문 수 + 아바타 클립이 준비된 수(ready).
  const seedReadyCount = seedQuestions.filter((q) => q.status === "ready").length;
  const summarySeedVal =
    seedQuestions.length === 0
      ? "없음"
      : `${seedQuestions.length}개${seedReadyCount > 0 ? ` · ${seedReadyCount} 준비됨` : ""}`;

  return (
    <aside style={settingsStyle} aria-label="강의 설정">
      <div style={scrollStyle}>
        {/* 아바타 */}
        <details open style={accordionStyle}>
          <summary style={summaryStyle}>
            <CaretIcon />
            <H4Icon>
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="url(#grad-violet)"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </H4Icon>
            <h4 style={summaryTitleStyle}>Q&amp;A 아바타</h4>
            <span style={summaryValStyle}>{avatarName}</span>
          </summary>
          <div style={aBodyStyle}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ fontSize: 11.5, color: "var(--text-subtle)", fontWeight: 600 }}>
                선택된 페르소나
              </div>
              <div style={fieldValStyle}>{avatarName}</div>
            </div>
            <button
              type="button"
              onClick={onChangeAvatar}
              style={{
                alignSelf: "flex-start",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 12px",
                borderRadius: 8,
                border: "1px solid var(--line-strong)",
                background: "var(--bg-card)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                color: "var(--text)",
                fontFamily: "inherit",
              }}
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              페르소나 변경
            </button>

            {/* 영상에서 아바타가 차지하는 크기 — 미리보기 PiP·렌더에 함께 반영 */}
            <div style={{ height: 1, background: "var(--line)", margin: "2px 0" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={subSectionLabelStyle}>
                <span style={subTagStyle("gold")}>크기</span>
                <span>영상에서 아바타 크기</span>
              </div>
              <SizeSlider
                value={avatarScale}
                onChange={(v) => onChangeAvatarScale?.(v)}
              />
            </div>
          </div>
        </details>

        {/* 음성 */}
        <details open style={accordionStyle}>
          <summary style={summaryStyle}>
            <CaretIcon />
            <H4Icon>
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="url(#grad-electric)"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                <path d="M21 19a2 2 0 0 1-2 2h-1v-7h3z" />
                <path d="M3 19a2 2 0 0 0 2 2h1v-7H3z" />
              </svg>
            </H4Icon>
            <h4 style={summaryTitleStyle}>음성과 자막</h4>
            <span style={summaryValStyle}>{summaryVoiceVal}</span>
          </summary>
          <div style={aBodyStyle}>
            {/* ── 발화 속도 (음성 선택은 "Q&A 아바타 선택" 페이지로 이동) ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={subSectionLabelStyle}>
                <span style={subTagStyle("gold")}>음성</span>
                <span>발화 속도</span>
              </div>
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-subtle)", lineHeight: 1.5 }}>
                목소리는 ‘Q&amp;A 아바타 선택’에서 아바타와 함께 정합니다. 여기서는 발화
                속도만 조절합니다.
              </p>
              <SpeedSlider
                value={voiceSpeed}
                onChange={(v) => onChangeVoiceSpeed?.(v)}
              />
            </div>

            <div style={{ height: 1, background: "var(--line)", margin: "2px 0" }} />

            {/* ── 자막 (음성과 같거나 다르게) ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={subSectionLabelStyle}>
                <span style={subTagStyle("violet")}>자막</span>
                <span>영상에 표시될 자막</span>
              </div>
              <div
                className="flex items-center justify-between"
                style={{ fontSize: 12.5, padding: "2px 0" }}
              >
                <span style={{ fontWeight: 500 }}>음성과 동일</span>
                <Switch
                  on={subtitleSame}
                  onClick={() =>
                    // 켜면 동일(null), 끄면 음성과 다른 기본값(영어, 단 음성이
                    // 영어면 한국어)으로 시작해 교수자가 바꾸게 한다.
                    onChangeSubtitleLang?.(
                      subtitleSame
                        ? voiceLang === "en"
                          ? "ko"
                          : "en"
                        : null,
                    )
                  }
                  label="자막을 음성과 동일하게"
                />
              </div>
              {subtitleSame ? (
                <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-subtle)", lineHeight: 1.5 }}>
                  자막은 발화 내용과 동일한 언어로 표시됩니다.
                </p>
              ) : (
                <LangSelect
                  value={subtitleLang ?? "en"}
                  onChange={(lang) => onChangeSubtitleLang?.(lang)}
                  ariaLabel="자막 언어 선택"
                />
              )}
            </div>
          </div>
        </details>

        {/* 퀴즈/문제 (인터랙티브 퀴즈 저작) */}
        <details style={accordionStyle}>
          <summary style={summaryStyle}>
            <CaretIcon />
            <H4Icon>
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="url(#grad-success)"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </H4Icon>
            <h4 style={summaryTitleStyle}>퀴즈/문제</h4>
            <span style={summaryValStyle}>{summaryQuizVal}</span>
          </summary>
          <div style={aBodyStyle}>
            <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-subtle)", lineHeight: 1.5 }}>
              강의 영상 중간(슬라이드 사이)에 삽입할 퀴즈입니다. 클로드와 대화하며 문제를 확정합니다. 강의당 최대 3개.
            </p>

            {slideCount < 2 ? (
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-subtle)", lineHeight: 1.5 }}>
                슬라이드가 2장 이상일 때 퀴즈를 삽입할 수 있습니다.
              </p>
            ) : (
              <>
                {quizPoints.map((pt, i) => (
                  <QuizPointCard
                    key={i}
                    point={pt}
                    index={i}
                    slideCount={slideCount}
                    onChange={(patch) => onChangeQuizPoint?.(i, patch)}
                    onRemove={() => onRemoveQuizPoint?.(i)}
                    onOpen={() => onOpenSocratic?.(i)}
                  />
                ))}
                {quizPoints.length < 3 ? (
                  <button
                    type="button"
                    onClick={onAddQuizPoint}
                    style={{
                      width: "100%",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      padding: "9px 12px",
                      borderRadius: 9,
                      border: "1px dashed var(--gold-on-light, #B88308)",
                      background: "var(--gold-soft)",
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      color: "var(--gold-on-light, #B88308)",
                      fontFamily: "inherit",
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    다음 문제 추가 (다른 슬라이드 구간)
                  </button>
                ) : (
                  <p style={{ margin: 0, fontSize: 11, color: "var(--text-subtle)", lineHeight: 1.5 }}>
                    강의당 최대 3문제까지 넣을 수 있습니다.
                  </p>
                )}
              </>
            )}
          </div>
        </details>

        {/* 예상 질문 (Q&A 사전 답변) */}
        <details style={accordionStyle}>
          <summary style={summaryStyle}>
            <CaretIcon />
            <H4Icon>
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="url(#grad-electric)"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
            </H4Icon>
            <h4 style={summaryTitleStyle}>예상 질문</h4>
            <span style={summaryValStyle}>{summarySeedVal}</span>
          </summary>
          <div style={aBodyStyle}>
            <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-subtle)", lineHeight: 1.5 }}>
              학생이 자주 물을 법한 질문을 적어 두세요. 영상 생성 시 그 질문의 답변을 강의
              자료 기반으로 자동 생성해 아바타 클립으로 미리 만들어 둡니다. 학생이 비슷한
              질문을 하면 첫 질문부터 아바타가 바로 답합니다. 강의당 최대 3개.
            </p>

            {seedQuestions.map((sq, i) => (
              <SeedQuestionCard
                key={sq.id ?? `new-${i}`}
                item={sq}
                index={i}
                onChange={(question) => onChangeSeedQuestion?.(i, question)}
                onRemove={() => onRemoveSeedQuestion?.(i)}
              />
            ))}

            {seedQuestions.length < 3 ? (
              <button
                type="button"
                onClick={onAddSeedQuestion}
                style={{
                  width: "100%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "9px 12px",
                  borderRadius: 9,
                  border: "1px dashed var(--gold-on-light, #B88308)",
                  background: "var(--gold-soft)",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  color: "var(--gold-on-light, #B88308)",
                  fontFamily: "inherit",
                }}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                예상 질문 추가
              </button>
            ) : (
              <p style={{ margin: 0, fontSize: 11, color: "var(--text-subtle)", lineHeight: 1.5 }}>
                강의당 최대 3개까지 등록할 수 있습니다.
              </p>
            )}
          </div>
        </details>
      </div>
    </aside>
  );
}

/** 삽입 지점 1개 카드 — 위치·유형·난이도 설정 + "문제 만들기" 버튼. */
function QuizPointCard({
  point,
  index,
  slideCount,
  onChange,
  onRemove,
  onOpen,
}: {
  point: QuizInsertionPoint;
  index: number;
  slideCount: number;
  onChange: (patch: Partial<QuizInsertionPoint>) => void;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const authored = point.authoredId !== null;
  // 경계 N 은 0 ~ slideCount-2 (슬라이드 N+1 과 N+2 사이).
  const maxBoundary = Math.max(0, slideCount - 2);
  const boundary = Math.min(point.boundaryIndex, maxBoundary);

  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 10,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: "var(--bg)",
      }}
    >
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text)" }}>
          문제 {index + 1}
        </span>
        <div className="flex items-center" style={{ gap: 6 }}>
          {authored && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "1px 7px",
                borderRadius: 4,
                background: "var(--gold-soft)",
                color: "var(--gold-on-light, #B88308)",
              }}
            >
              작성됨
            </span>
          )}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`퀴즈 ${index + 1} 삭제`}
            title="삭제"
            style={{
              display: "inline-grid",
              placeItems: "center",
              width: 22,
              height: 22,
              borderRadius: 6,
              border: "1px solid var(--line-strong)",
              background: "var(--bg-card)",
              cursor: "pointer",
              color: "var(--text-subtle)",
              lineHeight: 1,
            }}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 삽입 위치 */}
      <select
        aria-label={`퀴즈 ${index + 1} 삽입 위치`}
        value={boundary}
        onChange={(e) => onChange({ boundaryIndex: Number(e.target.value) })}
        style={selectStyle}
      >
        {Array.from({ length: maxBoundary + 1 }).map((_, n) => (
          <option key={n} value={n}>
            슬라이드 {n + 1} ↔ {n + 2} 사이
          </option>
        ))}
      </select>

      {/* 유형 */}
      <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
        <span style={{ fontWeight: 500 }}>유형</span>
        <div style={segStyle}>
          {(["multiple_choice", "short_answer"] as QuizQuestionType[]).map((qt) => (
            <button
              key={qt}
              type="button"
              style={segOptStyle(point.questionType === qt)}
              onClick={() => onChange({ questionType: qt })}
            >
              {qt === "multiple_choice" ? "객관식" : "주관식"}
            </button>
          ))}
        </div>
      </div>

      {/* 난이도 */}
      <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
        <span style={{ fontWeight: 500 }}>난이도</span>
        <div style={segStyle}>
          {(["hard", "medium", "easy"] as QuizDifficulty[]).map((d) => (
            <button
              key={d}
              type="button"
              style={segOptStyle(point.difficulty === d)}
              onClick={() => onChange({ difficulty: d })}
            >
              {QUIZ_DIFFICULTY_LABEL[d]}
            </button>
          ))}
        </div>
      </div>

      {/* 정답 공개 여부 */}
      <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
        <span style={{ fontWeight: 500 }}>영상에서 정답 공개</span>
        <Switch
          on={point.revealAnswer}
          onClick={() => onChange({ revealAnswer: !point.revealAnswer })}
          label="영상에서 정답 공개"
        />
      </div>
      <p style={{ margin: 0, fontSize: 11, color: "var(--text-subtle)", lineHeight: 1.5 }}>
        {point.revealAnswer
          ? "학생이 푼 직후 정답·해설을 영상에서 보여줍니다."
          : "정답을 숨기고 정·오답 현황만 모아, 대면 수업에서 함께 다룹니다."}
      </p>

      <button
        type="button"
        onClick={onOpen}
        style={{
          marginTop: 2,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "8px 12px",
          borderRadius: 8,
          border: "none",
          background: "linear-gradient(135deg, #FFB627, #E89E0E)",
          fontSize: 12.5,
          fontWeight: 700,
          cursor: "pointer",
          color: "#0A0A0A",
          fontFamily: "inherit",
        }}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {authored ? "문제 보기·수정" : "문제 만들기"}
      </button>
    </div>
  );
}

/** 사전 질문 렌더 상태 → 배지 표기(라벨·색). 답변은 시스템이 생성하므로 상태만 표시. */
const SEED_STATUS_BADGE: Record<SeedQuestionStatus, { label: string; fg: string; bg: string }> = {
  pending: { label: "대기", fg: "var(--text-subtle)", bg: "var(--bg-card)" },
  rendering: { label: "생성 중", fg: "var(--gold-on-light, #B88308)", bg: "var(--gold-soft)" },
  ready: { label: "준비됨", fg: "#1B7F4B", bg: "rgba(27,127,75,0.10)" },
  failed: { label: "실패", fg: "#B42318", bg: "rgba(180,35,24,0.10)" },
};

/** 예상 질문 1개 카드 — 질문만 입력(답변은 영상 생성 시 RAG 로 자동 생성). */
function SeedQuestionCard({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: SeedQuestionDraft;
  index: number;
  onChange: (question: string) => void;
  onRemove: () => void;
}) {
  const badge = item.status ? SEED_STATUS_BADGE[item.status] : null;

  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 10,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: "var(--bg)",
      }}
    >
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text)" }}>
          질문 {index + 1}
        </span>
        <div className="flex items-center" style={{ gap: 6 }}>
          {badge && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "1px 7px",
                borderRadius: 4,
                background: badge.bg,
                color: badge.fg,
              }}
            >
              {badge.label}
            </span>
          )}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`예상 질문 ${index + 1} 삭제`}
            title="삭제"
            style={{
              display: "inline-grid",
              placeItems: "center",
              width: 22,
              height: 22,
              borderRadius: 6,
              border: "1px solid var(--line-strong)",
              background: "var(--bg-card)",
              cursor: "pointer",
              color: "var(--text-subtle)",
              lineHeight: 1,
            }}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 질문 (교수자는 질문만 입력 — 답변은 영상 생성 시 강의 자료로 자동 생성) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-subtle)" }}>
          학생 질문
        </label>
        <textarea
          value={item.question}
          onChange={(e) => onChange(e.target.value)}
          placeholder="예: 이번 장의 핵심 개념을 한 문장으로 정리하면?"
          rows={2}
          aria-label={`예상 질문 ${index + 1} 질문`}
          style={textareaStyle}
        />
      </div>
    </div>
  );
}

/* ───────── helpers ───────── */

/** 속도 배율을 보기 좋게 표기 (1.0→"1.0", 1.05→"1.05", 0.7→"0.7"). */
function formatSpeed(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r * 10) ? r.toFixed(1) : r.toFixed(2);
}

/**
 * 발화 속도 슬라이더. 1.0배속 기준으로 좌(느림)·우(빠름) 드래그.
 * 범위 0.7~1.2 (ElevenLabs voice_settings.speed 실효 범위), step 0.05.
 */
const SPEED_MIN = 0.7;
const SPEED_MAX = 1.2;
const SPEED_STEP = 0.05;
const SPEED_DEFAULT = 1.0;

function SpeedSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const clamped = Math.min(SPEED_MAX, Math.max(SPEED_MIN, value || SPEED_DEFAULT));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingTop: 2 }}>
      <div
        className="flex items-center justify-between"
        style={{ fontSize: 12, fontWeight: 600, color: "var(--text-subtle)" }}
      >
        <span>발화 속도</span>
        <span
          style={{
            color: "var(--text)",
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatSpeed(clamped)}×
        </span>
      </div>
      <input
        type="range"
        min={SPEED_MIN}
        max={SPEED_MAX}
        step={SPEED_STEP}
        value={clamped}
        aria-label="발화 속도"
        onChange={(e) => {
          const raw = parseFloat(e.target.value);
          const snapped = Math.round(raw / SPEED_STEP) * SPEED_STEP;
          const next = Math.min(SPEED_MAX, Math.max(SPEED_MIN, Number(snapped.toFixed(2))));
          onChange(next);
        }}
        className="slider-rb"
      />
      <div
        className="flex items-center justify-between"
        style={{
          fontSize: 10,
          color: "var(--text-faint)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span>0.7× 느림</span>
        <span>1.0× 원배속</span>
        <span>빠름 1.2×</span>
      </div>
    </div>
  );
}

/**
 * 아바타 크기 슬라이더. 1.0배(기본) 기준 좌(작게)·우(크게). 범위 0.5~1.5,
 * step 0.1. 값은 미리보기 PiP 크기와 강의 렌더(HeyGen character.scale)에 함께
 * 반영된다. 표기는 퍼센트(50%~150%).
 */
const SIZE_MIN = 0.5;
const SIZE_MAX = 1.5;
const SIZE_STEP = 0.1;

function SizeSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const clamped = Math.min(SIZE_MAX, Math.max(SIZE_MIN, value || 1.0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingTop: 2 }}>
      <div
        className="flex items-center justify-between"
        style={{ fontSize: 12, fontWeight: 600, color: "var(--text-subtle)" }}
      >
        <span>크기 배율</span>
        <span
          style={{
            color: "var(--text)",
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {Math.round(clamped * 100)}%
        </span>
      </div>
      <input
        type="range"
        min={SIZE_MIN}
        max={SIZE_MAX}
        step={SIZE_STEP}
        value={clamped}
        aria-label="아바타 크기"
        onChange={(e) => {
          const raw = parseFloat(e.target.value);
          const snapped = Math.round(raw / SIZE_STEP) * SIZE_STEP;
          const next = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Number(snapped.toFixed(2))));
          onChange(next);
        }}
        className="slider-rb"
      />
      <div
        className="flex items-center justify-between"
        style={{
          fontSize: 10,
          color: "var(--text-faint)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span>50% 작게</span>
        <span>100%</span>
        <span>크게 150%</span>
      </div>
    </div>
  );
}

function LangSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: LangCode;
  onChange: (lang: LangCode) => void;
  ariaLabel: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value as LangCode)}
      style={selectStyle}
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
