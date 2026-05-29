"use client";

import { useRef, useState, type CSSProperties } from "react";
import type { VoiceCloneStatus, VoiceScriptResult } from "./avatarsTypes";
import { useVoiceRecorder } from "./useVoiceRecorder";

interface VoiceCloneUploadCardProps {
  /** 검증 통과한 파일(업로드 또는 녹음)을 부모로 올린다 — 실제 업로드는 페이지가 수행. */
  onSubmit: (file: File) => void;
  /** 본인 음성 삭제. */
  onDelete?: () => void;
  /** 본인 음성(클론) 샘플 합성 — mp3 Blob 을 돌려주면 카드가 재생. 실패 시 null. */
  onPreview?: () => Promise<Blob | null>;
  /**
   * 녹음용 읽기 대본 요청 — 강의 주제에 맞춘 ~500자 학술 대본을 돌려준다.
   * 제공되지 않으면 "녹음 대본 받기" 버튼을 숨긴다.
   */
  onRequestScript?: () => Promise<VoiceScriptResult | null>;
  /** 부모가 보유한 본인 음성 상태. */
  status: VoiceCloneStatus;
  uploading: boolean;
  /** 생성된 본인 음성 이름 (status="ready" 일 때). */
  voiceName?: string | null;
  /** 서버 메시지 (실패 사유 등). */
  message?: string | null;
  t: (key: string, params?: Record<string, string | number>) => string;
}

// ElevenLabs IVC 는 1분 내외 샘플이면 충분. 고비트레이트/긴 샘플 여유로 25MB.
const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT = "audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/ogg,audio/webm,.mp3,.m4a,.wav,.ogg,.webm";

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
  t,
}: VoiceCloneUploadCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // 브라우저 직접 녹음.
  const recorder = useVoiceRecorder();

  // 녹음용 읽기 대본.
  const [script, setScript] = useState<VoiceScriptResult | null>(null);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptError, setScriptError] = useState(false);

  const pick = () => inputRef.current?.click();

  // 제출 시 선택 파일을 비워 중복 제출을 막는다(부모가 uploading/status 로 진행 표시).
  const submit = () => {
    if (!file) return;
    onSubmit(file);
    setFile(null);
  };

  // 녹음 결과를 기존 클론 업로드 경로로 제출.
  const submitRecording = () => {
    if (!recorder.file) return;
    onSubmit(recorder.file);
    recorder.reset();
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
      const result = await onRequestScript();
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
      setFile(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setValidationError(t("voiceUploadTooLarge"));
      setFile(null);
      return;
    }
    setValidationError(null);
    setFile(f);
  };

  const statusLine =
    status === "ready"
      ? { text: t("voiceUploadStatusReady"), tone: "success" as const }
      : status === "failed"
        ? { text: message || t("voiceUploadStatusFailed"), tone: "error" as const }
        : null;

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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" onClick={pick} style={secondaryBtn}>
              {file ? t("voiceUploadChange") : t("voiceUploadSelect")}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!file || uploading}
              style={{
                ...primaryBtn,
                opacity: !file || uploading ? 0.45 : 1,
                cursor: !file || uploading ? "not-allowed" : "pointer",
              }}
              data-testid="voice-clone-submit"
            >
              {uploading ? t("voiceUploading") : t("voiceUploadButton")}
            </button>
          </div>

          {file && (
            <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {file.name}
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
            {t("voiceUploadHint")}
          </p>
        </div>

        {/* 우측: 생성된 본인 음성 */}
        {status === "ready" ? (
          <div
            data-testid="voice-clone-ready"
            style={{
              marginLeft: "auto",
              flexShrink: 0,
              width: 150,
              padding: 10,
              borderRadius: 12,
              textAlign: "center",
              background: "var(--bg-card)",
              border: "2px solid var(--gold)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <span style={{ display: "block", fontSize: 10, fontWeight: 700, color: "var(--gold-on-light)", marginBottom: 6 }}>
              {t("voiceMyBadge")}
            </span>
            <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {voiceName || t("voiceMyBadge")}
            </span>
            <span style={{ display: "block", marginTop: 6, fontSize: 10.5, lineHeight: 1.5, color: "var(--text-faint)" }}>
              {t("voiceReadyHint")}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
              {onPreview && (
                <button
                  type="button"
                  onClick={preview}
                  disabled={previewing}
                  data-testid="voice-clone-preview"
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 8,
                    border: "1px solid transparent",
                    background: "linear-gradient(135deg, #FFB627, #E89E0E)",
                    color: "#0A0A0A",
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
                    width: "100%",
                    padding: "5px 10px",
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

      {/* ── 또는 브라우저에서 직접 녹음 ───────────────────────────────── */}
      <div style={dividerRow}>
        <span style={dividerLine} aria-hidden="true" />
        <span style={dividerLabel}>{t("recordOr")}</span>
        <span style={dividerLine} aria-hidden="true" />
      </div>

      <div data-testid="voice-record" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
            {t("recordTitle")}
          </h4>
          {recorder.state === "recording" && (
            <span style={recordingBadge} role="status" aria-live="polite">
              <span style={recDot} aria-hidden="true" />
              {t("recordingBadge")} · {formatElapsed(recorder.elapsedMs)}
            </span>
          )}
        </div>

        {!recorder.supported ? (
          <p role="status" style={mutedNote} data-testid="record-unsupported">
            {t("recordUnsupported")}
          </p>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {recorder.state === "recording" ? (
                <button
                  type="button"
                  onClick={recorder.stop}
                  data-testid="record-stop"
                  style={{ ...primaryBtn, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}
                >
                  <span style={stopSquare} aria-hidden="true" />
                  {t("recordStop")}
                </button>
              ) : recorder.state === "recorded" ? (
                <>
                  <button
                    type="button"
                    onClick={submitRecording}
                    disabled={uploading}
                    data-testid="record-use"
                    style={{
                      ...primaryBtn,
                      opacity: uploading ? 0.45 : 1,
                      cursor: uploading ? "not-allowed" : "pointer",
                    }}
                  >
                    {uploading ? t("voiceUploading") : t("recordUse")}
                  </button>
                  <button
                    type="button"
                    onClick={recorder.start}
                    disabled={uploading}
                    data-testid="record-redo"
                    style={secondaryBtn}
                  >
                    {t("recordRedo")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={recorder.start}
                  disabled={recorder.state === "requesting"}
                  data-testid="record-start"
                  style={{
                    ...secondaryBtn,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    cursor: recorder.state === "requesting" ? "wait" : "pointer",
                  }}
                >
                  <span style={recDotStatic} aria-hidden="true" />
                  {recorder.state === "requesting"
                    ? t("recordRequesting")
                    : t("recordStart")}
                </button>
              )}
            </div>

            {recorder.state === "recorded" && recorder.audioUrl && (
              <audio
                src={recorder.audioUrl}
                controls
                data-testid="record-playback"
                style={{ width: "100%", maxWidth: 360, height: 36 }}
              />
            )}

            {recorder.state === "denied" && (
              <p role="alert" style={warnNote} data-testid="record-denied">
                {t("recordDenied")}
              </p>
            )}
            {recorder.state === "error" && (
              <p role="alert" style={warnNote} data-testid="record-error">
                {t("recordError")}
              </p>
            )}

            <p style={mutedNote}>{t("recordHint")}</p>
          </>
        )}

        {/* 녹음 대본 받기 */}
        {onRequestScript && (
          <div style={{ display: "grid", gap: 8 }}>
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

const dividerRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  margin: "18px 0 14px",
};

const dividerLine: CSSProperties = {
  flex: 1,
  height: 1,
  background: "var(--line)",
};

const dividerLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.04em",
  color: "var(--text-faint)",
  whiteSpace: "nowrap",
};

const recordingBadge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 10px",
  borderRadius: 999,
  fontSize: 11.5,
  fontWeight: 700,
  color: "var(--warning)",
  background: "rgba(239,68,68,0.08)",
  border: "1px solid rgba(239,68,68,0.25)",
  fontVariantNumeric: "tabular-nums",
};

const recDot: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "#EF4444",
  // 전역 keyframe 재사용(globals.css `pulse-warning`). reduced-motion 시엔
  // 전역 규칙이 애니메이션을 멈춰 정적 빨간 점으로 보인다(의미 유지).
  animation: "pulse-warning 1.4s ease-in-out infinite",
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
  background: "#0A0A0A",
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
