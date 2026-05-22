"use client";

import type { CSSProperties, ReactNode } from "react";
import type { TtsProvider, VoiceGender } from "../studioTypes";

/**
 * Studio v2 — 우측 settings panel.
 *
 * docs/prototypes/05-studio-flow.extracted.html `.settings` + accordion 그대로.
 * 4개 아코디언: 아바타 · 음성(이중 TTS) · 강의 설정 · Q&A 범위.
 *
 * 비용 미터(`.cost`) 는 planning/05 §1.1 비용 표시 금지 정책에 따라 제외.
 * 대신 우측 패널 하단에 "월 한도" 진행 표시만 남긴다 (편수 기반).
 */
export interface SettingsPanelProps {
  avatarName: string;
  ttsProvider: TtsProvider;
  voiceGender: VoiceGender;
  expiresAt: string | null;
  qaScopeOnUploaded: boolean;
  blockExternalSearch: boolean;
  monthlyUsed?: number;
  monthlyLimit?: number | null;
  onChangeAvatar?: () => void;
  onChangeExpires?: (iso: string | null) => void;
  onToggleQaScope?: (on: boolean) => void;
  onToggleBlockExternal?: (on: boolean) => void;
  onToggleAttentionWarn?: (on: boolean) => void;
  attentionWarn?: boolean;
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
  padding: "3px 9px",
  borderRadius: 5,
  fontSize: 11.5,
  fontWeight: 600,
  color: on ? "var(--text)" : "var(--text-muted)",
  cursor: "pointer",
  background: on ? "var(--bg-card)" : "transparent",
  boxShadow: on ? "0 1px 2px rgba(10,10,10,0.06)" : "none",
  border: "none",
  fontFamily: "inherit",
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
  voiceGender,
  expiresAt,
  qaScopeOnUploaded,
  blockExternalSearch,
  onChangeAvatar,
  onChangeExpires,
  onToggleQaScope,
  onToggleBlockExternal,
  onToggleAttentionWarn,
  attentionWarn = true,
}: SettingsPanelProps) {
  const expDays = expiresAtToDays(expiresAt);

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
            <h4 style={summaryTitleStyle}>아바타</h4>
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
            <h4 style={summaryTitleStyle}>음성 (이중 TTS)</h4>
            <span style={summaryValStyle}>한 · 中</span>
          </summary>
          <div style={aBodyStyle}>
            <VoiceRow
              tag="주"
              tagColor="gold"
              name="한국어 (여)"
              meta="Yuna · 자연스러움"
            />
            <VoiceRow
              tag="부"
              tagColor="violet"
              name="中文 (남)"
              meta="Xiaoming · 표준"
            />
            <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
              voiceGender: {voiceGender}
            </div>
          </div>
        </details>

        {/* 강의 설정 */}
        <details style={accordionStyle}>
          <summary style={summaryStyle}>
            <CaretIcon />
            <H4Icon>
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="url(#grad-cyan)"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
            </H4Icon>
            <h4 style={summaryTitleStyle}>강의 설정</h4>
            <span style={summaryValStyle}>{expDays}일 · 중</span>
          </summary>
          <div style={aBodyStyle}>
            <div className="flex items-center justify-between" style={{ padding: "6px 0", fontSize: 12.5 }}>
              <span style={{ fontWeight: 500 }}>링크 만료</span>
              <div style={segStyle}>
                {[7, 30, "학기말" as const].map((opt) => {
                  const isStr = typeof opt === "string";
                  const optDays = isStr ? null : opt;
                  const on =
                    (optDays === null && expiresAt === null) ||
                    (optDays !== null && expDays === optDays);
                  return (
                    <button
                      key={String(opt)}
                      type="button"
                      style={segOptStyle(on)}
                      onClick={() =>
                        onChangeExpires?.(
                          optDays === null
                            ? null
                            : new Date(Date.now() + optDays * 86400 * 1000).toISOString(),
                        )
                      }
                    >
                      {isStr ? opt : `${opt}일`}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between" style={{ padding: "6px 0", fontSize: 12.5 }}>
              <span style={{ fontWeight: 500 }}>집중 경고</span>
              <Switch
                on={attentionWarn}
                onClick={() => onToggleAttentionWarn?.(!attentionWarn)}
                label="집중 경고"
              />
            </div>
          </div>
        </details>

        {/* Q&A 범위 */}
        <details style={accordionStyle}>
          <summary style={summaryStyle}>
            <CaretIcon />
            <H4Icon>
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="url(#grad-pink)"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </H4Icon>
            <h4 style={summaryTitleStyle}>Q&amp;A 범위</h4>
            <span style={summaryValStyle}>업로드 자료만</span>
          </summary>
          <div style={aBodyStyle}>
            <div className="flex items-center justify-between" style={{ padding: "6px 0", fontSize: 12.5 }}>
              <span style={{ fontWeight: 500 }}>업로드 자료만</span>
              <Switch
                on={qaScopeOnUploaded}
                onClick={() => onToggleQaScope?.(!qaScopeOnUploaded)}
                label="업로드 자료만"
              />
            </div>
            <div className="flex items-center justify-between" style={{ padding: "6px 0", fontSize: 12.5 }}>
              <span style={{ fontWeight: 500 }}>외부 검색 차단</span>
              <Switch
                on={blockExternalSearch}
                onClick={() => onToggleBlockExternal?.(!blockExternalSearch)}
                label="외부 검색 차단"
              />
            </div>
            <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-subtle)", lineHeight: 1.5, paddingTop: 4 }}>
              학생 질문은 이 강의의 PPT·노트·스크립트 범위 안에서만 답변됩니다.
              (가드레일 2차 — RAG 임계값 0.7)
            </p>
          </div>
        </details>
      </div>
    </aside>
  );
}

/* ───────── helpers ───────── */

function expiresAtToDays(iso: string | null): number | "∞" {
  if (!iso) return "∞" as const;
  const days = Math.round(
    (new Date(iso).getTime() - Date.now()) / (86400 * 1000),
  );
  return days > 0 ? days : 0;
}

function VoiceRow({
  tag,
  tagColor,
  name,
  meta,
}: {
  tag: string;
  tagColor: "gold" | "violet";
  name: string;
  meta: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 9px",
        background: "var(--bg)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        fontSize: 12.5,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          padding: "1px 6px",
          borderRadius: 4,
          letterSpacing: "0.04em",
          flexShrink: 0,
          background: tagColor === "gold" ? "var(--gold-soft)" : "rgba(167, 139, 250, 0.12)",
          color: tagColor === "gold" ? "var(--gold)" : "#7c3aed",
        }}
      >
        {tag}
      </span>
      <span style={{ fontWeight: 600 }}>{name}</span>
      <span style={{ color: "var(--text-subtle)", fontSize: 11.5, marginLeft: "auto" }}>
        {meta}
      </span>
    </div>
  );
}
