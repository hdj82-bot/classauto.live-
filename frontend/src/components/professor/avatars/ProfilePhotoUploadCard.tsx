"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { CustomAvatarStatus } from "./avatarsTypes";

interface ProfilePhotoUploadCardProps {
  /** 검증 통과한 파일을 부모로 올린다 — 실제 업로드는 페이지가 수행. */
  onSubmit: (file: File) => void;
  /** 부모가 보유한 생성 상태 (null = 미시작). */
  status: CustomAvatarStatus | null;
  uploading: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ACCEPT = "image/png,image/jpeg,image/jpg,image/webp";

export default function ProfilePhotoUploadCard({
  onSubmit,
  status,
  uploading,
  t,
}: ProfilePhotoUploadCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // 현재 object URL 을 ref 로 추적해 다음 선택·언마운트 때 해제(누수 방지).
  const urlRef = useRef<string | null>(null);
  const swapPreview = (next: string | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next;
    setPreviewUrl(next);
  };
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const pick = () => inputRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    // 같은 파일 재선택도 onChange 가 다시 불리도록 value 초기화.
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setValidationError(t("uploadInvalidType"));
      setFile(null);
      swapPreview(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setValidationError(t("uploadTooLarge"));
      setFile(null);
      swapPreview(null);
      return;
    }
    setValidationError(null);
    setFile(f);
    swapPreview(URL.createObjectURL(f));
  };

  const statusLine =
    status === "processing"
      ? { text: t("uploadStatusProcessing"), tone: "info" as const }
      : status === "ready"
        ? { text: t("uploadStatusReady"), tone: "success" as const }
        : status === "failed"
          ? { text: t("uploadStatusFailed"), tone: "error" as const }
          : null;

  return (
    <div
      data-testid="profile-photo-upload"
      style={{
        background: "var(--bg-card)",
        border: "1px dashed var(--line-strong)",
        borderRadius: 14,
        padding: 18,
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: 14,
          fontWeight: 700,
          color: "var(--text)",
        }}
      >
        {t("uploadTitle")}
      </h3>
      <p
        style={{
          margin: "6px 0 14px",
          fontSize: 12.5,
          lineHeight: 1.5,
          color: "var(--text-muted)",
        }}
      >
        {t("uploadDescription")}
      </p>

      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div
          aria-hidden={previewUrl ? undefined : "true"}
          style={{
            width: 84,
            height: 112,
            flexShrink: 0,
            borderRadius: 10,
            overflow: "hidden",
            background: "var(--bg-subtle)",
            border: "1px solid var(--line)",
            display: "grid",
            placeItems: "center",
          }}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={t("uploadPreviewAlt")}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <svg
              viewBox="0 0 24 24"
              width="28"
              height="28"
              fill="none"
              stroke="var(--text-faint)"
              strokeWidth={1.6}
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
            </svg>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            onChange={onFileChange}
            style={{ display: "none" }}
            data-testid="profile-photo-input"
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" onClick={pick} style={secondaryBtn}>
              {file ? t("uploadChangePhoto") : t("uploadSelect")}
            </button>
            <button
              type="button"
              onClick={() => file && onSubmit(file)}
              disabled={!file || uploading}
              style={{
                ...primaryBtn,
                opacity: !file || uploading ? 0.45 : 1,
                cursor: !file || uploading ? "not-allowed" : "pointer",
              }}
              data-testid="profile-photo-submit"
            >
              {uploading ? t("uploading") : t("uploadButton")}
            </button>
          </div>

          {validationError && (
            <p
              role="alert"
              style={{ margin: "10px 0 0", fontSize: 12, color: "var(--warning)" }}
            >
              {validationError}
            </p>
          )}

          {statusLine && (
            <p
              data-testid="profile-photo-status"
              role="status"
              style={{
                margin: "10px 0 0",
                fontSize: 12,
                fontWeight: 500,
                color:
                  statusLine.tone === "success"
                    ? "var(--success)"
                    : statusLine.tone === "error"
                      ? "var(--warning)"
                      : "var(--text-muted)",
              }}
            >
              {statusLine.text}
            </p>
          )}
        </div>
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
