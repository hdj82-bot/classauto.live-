"use client";

import { useRef, useState, type CSSProperties } from "react";
import type { VoiceCloneStatus } from "./avatarsTypes";

interface VoiceCloneUploadCardProps {
  /** 검증 통과한 파일+성별을 부모로 올린다 — 실제 업로드는 페이지가 수행. */
  onSubmit: (file: File, gender: "male" | "female") => void;
  /** 본인 음성 삭제. */
  onDelete?: () => void;
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

export default function VoiceCloneUploadCard({
  onSubmit,
  onDelete,
  status,
  uploading,
  voiceName,
  message,
  t,
}: VoiceCloneUploadCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [gender, setGender] = useState<"male" | "female">("male");
  const [validationError, setValidationError] = useState<string | null>(null);

  const pick = () => inputRef.current?.click();

  // 제출 시 선택 파일을 비워 중복 제출을 막는다(부모가 uploading/status 로 진행 표시).
  const submit = () => {
    if (!file) return;
    onSubmit(file, gender);
    setFile(null);
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
          {/* 성별 선택 — 음성 패널 남/여 그룹 분류용 */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {(["male", "female"] as const).map((g) => {
              const active = gender === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  aria-pressed={active}
                  data-testid={`voice-gender-${g}`}
                  style={{
                    padding: "5px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 999,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    border: `1px solid ${active ? "var(--gold)" : "var(--line)"}`,
                    background: active ? "var(--gold)" : "var(--bg-card)",
                    color: active ? "#0A0A0A" : "var(--text-muted)",
                  }}
                >
                  {g === "male" ? t("genderMale") : t("genderFemale")}
                </button>
              );
            })}
          </div>

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
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={uploading}
                data-testid="voice-clone-delete"
                style={{
                  marginTop: 8,
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "1px solid var(--line-strong)",
                  background: "var(--bg-card)",
                  color: "var(--text-muted)",
                  cursor: uploading ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {t("voiceDelete")}
              </button>
            )}
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
