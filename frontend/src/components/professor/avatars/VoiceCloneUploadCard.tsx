"use client";

import { useCallback, useRef, useState, type CSSProperties } from "react";
import type { VoiceCloneStatus, VoiceScriptResult } from "./avatarsTypes";
import type { ScriptLanguage } from "./avatarsApi";
import { useVoiceRecorder } from "./useVoiceRecorder";

interface VoiceCloneUploadCardProps {
  /** 검증 통과한 샘플(불러온 파일 또는 녹음)을 부모로 올린다 — 실제 업로드는 페이지가 수행. */
  onSubmit: (file: File) => void;
  /** 본인 음성 삭제. */
  onDelete?: () => void;
  /** 본인 음성(클론) 샘플 합성 — mp3 Blob 을 돌려주면 카드가 재생. 실패 시 null. */
  onPreview?: () => Promise<Blob | null>;
  /**
   * 녹음용 읽기 대본 요청 — 강의 주제·선택 언어에 맞춘 학술 대본을 돌려준다.
   * 제공되지 않으면 "녹음 대본 도우미" 블록을 숨긴다.
   */
  onRequestScript?: (language: ScriptLanguage) => Promise<VoiceScriptResult | null>;
  /** 부모가 보유한 본인 음성 상태. */
  status: VoiceCloneStatus;
  uploading: boolean;
  /** 생성된 본인 음성 이름 (status="ready" 일 때). */
  voiceName?: string | null;
  /** 서버 메시지 (실패 사유 등). */
  message?: string | null;
  /** 본인 음성이 "아바타 제작에 사용" 으로 선택됐는지(샘플 보이스와 상호 배타). */
  selectedForAvatar?: boolean;
  /** "이 음성을 아바타 제작에 사용" 토글 — 부모가 단일 선택(상호 배타)을 관리한다. */
  onUseForAvatar?: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

// ElevenLabs IVC 는 1분 내외 샘플이면 충분. 고비트레이트/긴 샘플 여유로 25MB.
const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT = "audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/ogg,audio/webm,.mp3,.m4a,.wav,.ogg,.webm";

const SCRIPT_LANGS: ScriptLanguage[] = ["ko", "en", "zh", "ja"];

/** 현재 샘플(불러온 파일 또는 녹음). 둘 다 같은 클론 업로드 경로로 제출된다. */
interface Sample {
  file: File;
  name: string;
  source: "file" | "record";
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function VoiceCloneUploadCard({
  onSubmit,
  onDelete,
  onPreview,
  onRequestScript,
  status,
  uploading,
  voiceName,
  message,
  selectedForAvatar = false,
  onUseForAvatar,
  t,
}: VoiceCloneUploadCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [sample, setSample] = useState<Sample | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // 브라우저 직접 녹음 — 완료되면 그 결과를 "현재 샘플"로 받는다.
  const recordedLabel = t("recordPlaybackLabel");
  const handleRecorded = useCallback(
    (f: File) => setSample({ file: f, name: recordedLabel, source: "record" }),
    [recordedLabel],
  );
  const recorder = useVoiceRecorder({ onRecorded: handleRecorded });

  // 녹음용 읽기 대본.
  const [script, setScript] = useState<VoiceScriptResult | null>(null);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptError, setScriptError] = useState(false);
  const [scriptLang, setScriptLang] = useState<ScriptLanguage>("ko");

  const pick = () => inputRef.current?.click();

  // "내 목소리 만들기" — 불러온 파일이든 녹음이든 동일 클론 업로드 경로로 제출.
  const submit = () => {
    if (!sample) return;
    onSubmit(sample.file);
    setSample(null);
    recorder.reset();
  };

  // 녹음 시작/다시 녹음 — 이전 파일 샘플은 비우고 녹음 결과로 대체한다(마지막 동작 우선).
  const startRecording = () => {
    setValidationError(null);
    if (sample?.source === "file") setSample(null);
    void recorder.start();
  };

  // 본인 클론 음성 미리듣기 — 서버 TTS 로 샘플을 합성해 1회 재생.
  const preview = async () => {
    if (!onPreview || previewing) return;
    setPreviewing(true);
    let blob: Blob | null = null;
    try {
      blob = await onPreview();
    } catch {
      blob = null;
    }
    if (!blob) {
      setPreviewing(false);
      return;
    }
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    const done = () => {
      setPreviewing(false);
      URL.revokeObjectURL(url);
    };
    audio.onended = done;
    audio.onerror = done;
    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(done);
  };

  const loadScript = async () => {
    if (!onRequestScript || scriptLoading) return;
    setScriptLoading(true);
    setScriptError(false);
    try {
      const result = await onRequestScript(scriptLang);
      if (result) setScript(result);
      else setScriptError(true);
    } catch {
      setScriptError(true);
    } finally {
      setScriptLoading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!f) return;
    const isAudio =
      f.type.startsWith("audio/") ||
      /\.(mp3|m4a|wav|ogg|webm|mp4)$/i.test(f.name);
    if (!isAudio) {
      setValidationError(t("voiceUploadInvalidType"));
      return;
    }
    if (f.size > MAX_BYTES) {
      setValidationError(t("voiceUploadTooLarge"));
      return;
    }
    setValidationError(null);
    recorder.reset(); // 파일을 고르면 진행 중/완료된 녹음은 비운다.
    setSample({ file: f, name: f.name, source: "file" });
  };

  const statusLine =
    status === "ready"
      ? { text: t("voiceUploadStatusReady"), tone: "success" as const }
      : status === "failed"
        ? { text: message || t("voiceUploadStatusFailed"), tone: "error" as const }
        : null;

  // 녹음 실패 사유별 안내 문구.
  const recordMessage =
    recorder.state === "denied"
      ? t("recordDenied")
      : recorder.state === "error"
        ? recorder.errorReason === "insecure"
          ? t("recordInsecure")
          : recorder.errorReason === "no-device"
            ? t("recordNoDevice")
            : recorder.errorReason === "device-busy"
              ? t("recordDeviceBusy")
              : recorder.errorReason === "empty"
                ? t("recordEmpty")
                : t("recordError")
        : null;

  const recording = recorder.state === "recording";
  const requesting = recorder.state === "requesting";
  const submitDisabled = !sample || uploading || recording || requesting;

  return (
    <div
      data-testid="voice-clone-upload"
      style={{
        background: "var(--bg-card)",
        border: "1px dashed var(--line-strong)",
        borderRadius: 14,
        padding: 18,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
        {t("voiceUploadTitle")}
      </h3>
      <p
        style={{
          margin: "6px 0 14px",
          fontSize: 12.5,
          lineHeight: 1.5,
          color: "var(--text-muted)",
        }}
      >
        {t("voiceUploadDescription")}
      </p>

      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div
          aria-hidden="true"
          style={{
            width: 84,
            height: 84,
            flexShrink: 0,
            borderRadius: 10,
            background: "var(--bg-subtle)",
            border: "1px solid var(--line)",
            display: "grid",
            placeItems: "center",
          }}
        >
          {/* 마이크 아이콘 */}
          <svg
            viewBox="0 0 24 24"
            width="30"
            height="30"
            fill="none"
            stroke={status === "ready" ? "var(--gold-on-light)" : "var(--text-faint)"}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <path d="M12 18v4" />
          </svg>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            onChange={onFileChange}
            style={{ display: "none" }}
            data-testid="voice-clone-input"
          />

          {/* 액션 행: 음성 파일 불러오기 — 마이크로 직접 녹음하기 — 내 목소리 만들기 */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <button type="button" onClick={pick} style={secondaryBtn} data-testid="voice-clone-pick">
              {sample?.source === "file" ? t("voiceUploadChange") : t("voiceUploadSelect")}
            </button>

            {/* 마이크로 직접 녹음하기 (불러오기 우측) */}
            {recording ? (
              <button
                type="button"
                onClick={recorder.stop}
                data-testid="record-stop"
                style={{ ...recordBtn, display: "inline-flex", alignItems: "center", gap: 7 }}
              >
                <span style={stopSquare} aria-hidden="true" />
                {t("recordStop")} · <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatElapsed(recorder.elapsedMs)}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={requesting || !recorder.supported}
                data-testid="record-start"
                style={{
                  ...secondaryBtn,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  opacity: !recorder.supported ? 0.5 : 1,
                  cursor: requesting
                    ? "wait"
                    : !recorder.supported
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                <span style={recDotStatic} aria-hidden="true" />
                {requesting
                  ? t("recordRequesting")
                  : recorder.state === "recorded"
                    ? t("recordRedo")
                    : t("recordTitle")}
              </button>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={submitDisabled}
              style={{
                ...primaryBtn,
                opacity: submitDisabled ? 0.45 : 1,
                cursor: submitDisabled ? "not-allowed" : "pointer",
              }}
              data-testid="voice-clone-submit"
            >
              {uploading ? t("voiceUploading") : t("voiceUploadButton")}
            </button>
          </div>

          {/* 현재 샘플: 파일명 또는 녹음 재생 */}
          {sample?.source === "file" && (
            <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sample.name}
            </p>
          )}
          {sample?.source === "record" && recorder.audioUrl && (
            <audio
              src={recorder.audioUrl}
              controls
              data-testid="record-playback"
              style={{ width: "100%", maxWidth: 360, height: 36, marginTop: 10 }}
            />
          )}

          {/* 녹음 상태/오류 안내 */}
          {recordMessage && (
            <p
              role="alert"
              data-testid="record-message"
              style={{ margin: "10px 0 0", fontSize: 12, lineHeight: 1.5, color: "var(--warning)" }}
            >
              {recordMessage}
            </p>
          )}
          {!recorder.supported && !recordMessage && (
            <p
              role="status"
              data-testid="record-unsupported"
              style={{ margin: "10px 0 0", fontSize: 11.5, lineHeight: 1.5, color: "var(--text-faint)" }}
            >
              {recorder.secureContext ? t("recordUnsupported") : t("recordInsecure")}
            </p>
          )}

          {validationError && (
            <p role="alert" style={{ margin: "10px 0 0", fontSize: 12, color: "var(--warning)" }}>
              {validationError}
            </p>
          )}

          {statusLine && (
            <p
              data-testid="voice-clone-status"
              role="status"
              style={{
                margin: "10px 0 0",
                fontSize: 12,
                fontWeight: 500,
                color:
                  statusLine.tone === "success" ? "var(--success)" : "var(--warning)",
              }}
            >
              {statusLine.text}
            </p>
          )}

          <p style={{ margin: "10px 0 0", fontSize: 11, lineHeight: 1.5, color: "var(--text-faint)" }}>
            {recorder.supported ? t("recordHint") : t("voiceUploadHint")}
          </p>
        </div>

        {/* 우측: 생성된 본인 음성 — 넓은 박스 + "아바타 제작에 사용" 토글 */}
        {status === "ready" ? (
          <div
            data-testid="voice-clone-ready"
            style={{
              marginLeft: "auto",
              flexShrink: 0,
              width: 300,
              maxWidth: "100%",
              padding: 14,
              borderRadius: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              background: selectedForAvatar ? "var(--gold-soft)" : "var(--bg-card)",
              border: `2px solid ${selectedForAvatar ? "var(--gold)" : "var(--gold-medium)"}`,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 10, fontWeight: 700, color: "var(--gold-on-light)", marginBottom: 4 }}>
                {t("voiceMyBadge")}
              </span>
              <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {voiceName || t("voiceMyBadge")}
              </span>
            </div>

            {/* 주 액션: 이 음성을 아바타 제작에 사용 (토글, 샘플과 상호 배타) */}
            {onUseForAvatar && (
              <button
                type="button"
                onClick={onUseForAvatar}
                aria-pressed={selectedForAvatar}
                data-testid="voice-clone-use"
                style={avatarUseBtnStyle(selectedForAvatar)}
              >
                {selectedForAvatar ? t("usingForAvatar") : t("useForAvatar")}
              </button>
            )}

            {/* 보조 액션: 미리듣기 · 삭제 */}
            <div style={{ display: "flex", gap: 6 }}>
              {onPreview && (
                <button
                  type="button"
                  onClick={preview}
                  disabled={previewing}
                  data-testid="voice-clone-preview"
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: "1px solid var(--line-strong)",
                    background: "var(--bg-card)",
                    color: "var(--text)",
                    cursor: previewing ? "wait" : "pointer",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                  }}
                >
                  {previewing ? t("voicePreviewPlaying") : `▶ ${t("voicePreviewListen")}`}
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={uploading}
                  data-testid="voice-clone-delete"
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    fontSize: 11.5,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: "1px solid var(--line-strong)",
                    background: "var(--bg-card)",
                    color: "var(--text-muted)",
                    cursor: uploading ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t("voiceDelete")}
                </button>
              )}
            </div>
          </div>
        ) : (
          <p
            style={{
              marginLeft: "auto",
              alignSelf: "center",
              maxWidth: 180,
              fontSize: 11.5,
              lineHeight: 1.5,
              color: "var(--text-faint)",
            }}
          >
            {t("voiceCloneHint")}
          </p>
        )}
      </div>

      {/* ── 녹음 대본 도우미 (+ 대본 언어 선택) ───────────────────────────── */}
      {onRequestScript && (
        <div data-testid="voice-script-helper" style={{ display: "grid", gap: 8, marginTop: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={loadScript}
              disabled={scriptLoading}
              data-testid="script-get"
              style={{
                ...secondaryBtn,
                cursor: scriptLoading ? "wait" : "pointer",
              }}
            >
              {scriptLoading
                ? t("scriptLoading")
                : script
                  ? t("scriptRegenerate")
                  : t("scriptGet")}
            </button>

            <label
              style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}
            >
              {t("scriptLangLabel")}
              <select
                value={scriptLang}
                onChange={(e) => setScriptLang(e.target.value as ScriptLanguage)}
                data-testid="script-lang"
                aria-label={t("scriptLangLabel")}
                style={selectStyle}
              >
                {SCRIPT_LANGS.map((lang) => (
                  <option key={lang} value={lang}>
                    {t(
                      lang === "ko"
                        ? "scriptLangKo"
                        : lang === "en"
                          ? "scriptLangEn"
                          : lang === "zh"
                            ? "scriptLangZh"
                            : "scriptLangJa",
                    )}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {scriptError && (
            <p role="alert" style={warnNote} data-testid="script-error">
              {t("scriptError")}
            </p>
          )}

          {script && (
            <div data-testid="script-box" style={scriptBox}>
              <p style={{ margin: "0 0 6px", fontSize: 11.5, fontWeight: 700, color: "var(--gold-on-light)" }}>
                {t("scriptTitle")}
              </p>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--text)", whiteSpace: "pre-wrap" }}>
                {script.text}
              </p>
              {script.mock && (
                <p style={{ margin: "8px 0 0", fontSize: 10.5, lineHeight: 1.5, color: "var(--text-faint)" }}>
                  {t("scriptMockNote")}
                </p>
              )}
            </div>
          )}

          {script && <p style={mutedNote}>{t("scriptHint")}</p>}
        </div>
      )}
    </div>
  );
}

const secondaryBtn: CSSProperties = {
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const primaryBtn: CSSProperties = {
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 10,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  fontFamily: "inherit",
};

/** "이 음성을 아바타 제작에 사용" 토글 — 활성(사용 중)이면 골드 채움, 비활성이면 골드 외곽선. */
function avatarUseBtnStyle(active: boolean): CSSProperties {
  return {
    width: "100%",
    padding: "9px 12px",
    fontSize: 12.5,
    fontWeight: 700,
    borderRadius: 9,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    border: `1px solid ${active ? "transparent" : "var(--gold-on-light)"}`,
    background: active ? "linear-gradient(135deg, #FFB627, #E89E0E)" : "var(--bg-card)",
    color: active ? "#0A0A0A" : "var(--gold-on-light)",
  };
}

// 녹음 정지 버튼 — 진행 중임을 알리는 연한 경고 톤.
const recordBtn: CSSProperties = {
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 10,
  border: "1px solid rgba(239,68,68,0.35)",
  background: "rgba(239,68,68,0.08)",
  color: "var(--warning)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const recDotStatic: CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: "50%",
  background: "#EF4444",
};

const stopSquare: CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: 2,
  background: "currentColor",
};

const selectStyle: CSSProperties = {
  padding: "6px 8px",
  fontSize: 12.5,
  fontWeight: 600,
  borderRadius: 8,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontFamily: "inherit",
  cursor: "pointer",
};

const scriptBox: CSSProperties = {
  maxHeight: 200,
  overflowY: "auto",
  padding: "12px 14px",
  borderRadius: 12,
  background: "var(--gold-soft)",
  border: "1px solid var(--gold-medium)",
};

const mutedNote: CSSProperties = {
  margin: 0,
  fontSize: 11,
  lineHeight: 1.5,
  color: "var(--text-faint)",
};

const warnNote: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--warning)",
};
