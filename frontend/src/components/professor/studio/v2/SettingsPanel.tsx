"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { LANGUAGES } from "../studioTypes";
import type { LangCode, TtsProvider, TtsVoice, VoiceGender } from "../studioTypes";

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
  ttsProvider?: TtsProvider;
  voiceGender?: VoiceGender;
  expiresAt: string | null;
  qaScopeOnUploaded: boolean;
  blockExternalSearch: boolean;
  monthlyUsed?: number;
  monthlyLimit?: number | null;
  // ── 음성·자막 ──────────────────────────────────────────────────────────────
  /** 영상 음성(TTS) 언어. */
  voiceLang: LangCode;
  /** 영상 자막 언어. null = 음성과 동일. */
  subtitleLang: LangCode | null;
  /** 선택한 ElevenLabs 보이스 ID. null = 기본 보이스. */
  voiceId: string | null;
  /** 발화 속도 배율 (1.0 = 기본). */
  voiceSpeed?: number;
  /** GET /api/voices 로 받은 보이스 목록. */
  voices?: TtsVoice[];
  voicesLoading?: boolean;
  /** @deprecated 음성 언어 선택 UI 제거됨 — voiceLang 은 자막 "동일" 비교용으로만 유지. */
  onChangeVoiceLang?: (lang: LangCode) => void;
  /** null 전달 = 자막을 음성과 동일하게. */
  onChangeSubtitleLang?: (lang: LangCode | null) => void;
  onChangeVoiceId?: (id: string | null) => void;
  onChangeVoiceSpeed?: (speed: number) => void;
  // ───────────────────────────────────────────────────────────────────────────
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
  expiresAt,
  qaScopeOnUploaded,
  blockExternalSearch,
  voiceLang,
  subtitleLang,
  voiceId,
  voiceSpeed = 1.0,
  voices = [],
  voicesLoading = false,
  onChangeSubtitleLang,
  onChangeVoiceId,
  onChangeVoiceSpeed,
  onChangeAvatar,
  onChangeExpires,
  onToggleQaScope,
  onToggleBlockExternal,
  onToggleAttentionWarn,
  attentionWarn = true,
}: SettingsPanelProps) {
  const expDays = expiresAtToDays(expiresAt);
  // 자막이 음성과 동일한지 — null 이거나 voiceLang 과 같으면 "동일".
  const subtitleSame = subtitleLang === null || subtitleLang === voiceLang;
  // 아코디언 헤더 요약: 선택한 보이스 이름 + 속도 배율.
  const selectedVoice = voices.find((v) => v.voice_id === voiceId) ?? null;
  const selectedVoiceName = selectedVoice
    ? selectedVoice.display_name || selectedVoice.name
    : "기본 보이스";
  const summaryVoiceVal = `${selectedVoiceName} · ${voiceSpeed.toFixed(1)}×`;

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
            <h4 style={summaryTitleStyle}>음성과 자막</h4>
            <span style={summaryValStyle}>{summaryVoiceVal}</span>
          </summary>
          <div style={aBodyStyle}>
            {/* ── 음성 (영상에서 나올 TTS) ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={subSectionLabelStyle}>
                <span style={subTagStyle("gold")}>음성</span>
                <span>영상에서 나올 목소리</span>
              </div>
              <VoiceSelect
                voices={voices}
                loading={voicesLoading}
                value={voiceId}
                onChange={(id) => onChangeVoiceId?.(id)}
              />
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

function SpeedSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const clamped = Math.min(SPEED_MAX, Math.max(SPEED_MIN, value || 1.0));
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
        style={{
          width: "100%",
          accentColor: "var(--gold-on-light, #B88308)",
          cursor: "pointer",
        }}
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
        <span>1.0×</span>
        <span>빠름 1.2×</span>
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

/** 보이스의 한국어 표기: 고유명(title) + 특성·성별·국적(meta). */
function voiceTitle(v: TtsVoice): string {
  return v.display_name || v.name;
}
function voiceMeta(v: TtsVoice): string {
  const parts = [v.description_ko, v.gender_ko, v.accent_ko].filter(
    (p): p is string => !!p,
  );
  return parts.join(" · ");
}

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="var(--gold-on-light, #B88308)" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="var(--gold-on-light, #B88308)" aria-hidden="true">
      <path d="M7 4.5v15a1 1 0 0 0 1.55.83l11-7.5a1 1 0 0 0 0-1.66l-11-7.5A1 1 0 0 0 7 4.5z" />
    </svg>
  );
}

function PreviewButton({
  url,
  playing,
  onToggle,
}: {
  url: string | null | undefined;
  playing: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      disabled={!url}
      aria-label={playing ? "미리듣기 정지" : "미리듣기"}
      title={url ? "미리듣기" : "미리듣기 샘플 없음"}
      style={{
        flexShrink: 0,
        display: "inline-grid",
        placeItems: "center",
        width: 28,
        height: 28,
        borderRadius: 7,
        border: "1px solid var(--line-strong)",
        background: playing ? "var(--gold-soft)" : "var(--bg-card)",
        cursor: url ? "pointer" : "not-allowed",
        opacity: url ? 1 : 0.4,
      }}
    >
      <PlayIcon playing={playing} />
    </button>
  );
}

function VoiceSelect({
  voices,
  loading,
  value,
  onChange,
}: {
  voices: TtsVoice[];
  loading: boolean;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const selected = voices.find((v) => v.voice_id === value) ?? null;

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
  };

  const togglePreview = (v: TtsVoice) => {
    if (typeof window === "undefined" || !v.preview_url) return;
    if (playingId === v.voice_id) {
      stopAudio();
      return;
    }
    stopAudio();
    try {
      const audio = new Audio(v.preview_url);
      audio.onended = () => setPlayingId((cur) => (cur === v.voice_id ? null : cur));
      audioRef.current = audio;
      setPlayingId(v.voice_id);
      void audio.play().catch(() => stopAudio());
    } catch {
      stopAudio();
    }
  };

  // 바깥 클릭 시 닫기 + 오디오 정지. 언마운트 시에도 오디오 정리.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  if (loading) {
    return (
      <div style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>
        보이스 목록을 불러오는 중…
      </div>
    );
  }

  if (voices.length === 0) {
    return (
      <div style={{ fontSize: 11.5, color: "var(--text-subtle)", lineHeight: 1.5 }}>
        선택 가능한 ElevenLabs 보이스가 없습니다. 기본 보이스로 생성됩니다.
      </div>
    );
  }

  const triggerLabel = selected
    ? `${voiceTitle(selected)}${selected.gender_ko ? ` · ${selected.gender_ko}` : ""}${
        selected.accent_ko ? ` · ${selected.accent_ko}` : ""
      }`
    : "기본 보이스 (성별 기준)";

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          style={{
            ...selectStyle,
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
            textAlign: "left",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {triggerLabel}
          </span>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--text-subtle)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <PreviewButton
          url={selected?.preview_url}
          playing={!!selected && playingId === selected.voice_id}
          onToggle={() => selected && togglePreview(selected)}
        />
      </div>

      {open && (
        <div
          role="listbox"
          aria-label="ElevenLabs 보이스 목록"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 20,
            maxHeight: 280,
            overflowY: "auto",
            background: "var(--bg-card)",
            border: "1px solid var(--line-strong)",
            borderRadius: 10,
            boxShadow: "var(--shadow-md, 0 8px 24px rgba(10,10,10,0.12))",
            padding: 4,
          }}
        >
          <button
            type="button"
            role="option"
            aria-selected={value === null}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            style={voiceRowStyle(value === null)}
          >
            <span style={{ fontWeight: 600, fontSize: 12.5 }}>기본 보이스 (성별 기준)</span>
          </button>
          {voices.map((v) => {
            const meta = voiceMeta(v);
            const isSel = v.voice_id === value;
            return (
              <div key={v.voice_id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  onClick={() => {
                    onChange(v.voice_id);
                    setOpen(false);
                  }}
                  style={{ ...voiceRowStyle(isSel), flex: 1 }}
                >
                  <span style={{ fontWeight: 600, fontSize: 12.5 }}>{voiceTitle(v)}</span>
                  {meta && (
                    <span style={{ fontSize: 11, color: "var(--text-subtle)", lineHeight: 1.4 }}>
                      {meta}
                    </span>
                  )}
                </button>
                <PreviewButton
                  url={v.preview_url}
                  playing={playingId === v.voice_id}
                  onToggle={() => togglePreview(v)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const voiceRowStyle = (selected: boolean): CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  gap: 2,
  alignItems: "flex-start",
  width: "100%",
  textAlign: "left",
  padding: "7px 9px",
  borderRadius: 7,
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  color: "var(--text)",
  background: selected ? "var(--gold-soft)" : "transparent",
});
