"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CameraIcon, CheckIcon, PersonIcon } from "./PhotoAvatarIcons";

interface PhotoUploadStepProps {
  /** 검증 통과한 파일을 업로드. 성공 시 흐름이 학습 단계로 전진한다. */
  onSubmit: (file: File) => Promise<void>;
  /**
   * 클라이언트 사진 용량 상한(bytes). 기본 8MB. 호출자가 백엔드 한도에 맞춰
   * 올릴 수 있다(가이드·검증 문구는 t 로 함께 맞춘다 — DEFAULT_MAX_BYTES 참고).
   */
  maxBytes?: number;
  t: (key: string, params?: Record<string, string | number>) => string;
}

// 계약 가이드 기본값: 8MB 이하, JPEG/PNG 만 (docs §4 사진 가이드라인).
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png";

/**
 * ① 사진 업로드 — 정면·단색 배경·정장 가이드를 제시하고 증명사진 1장을 받는다.
 *
 * 기존 ProfilePhotoUploadCard 와 달리 (1) 8MB·JPEG/PNG 로 제약하고, (2) 갤러리
 * 우측 패널 없이 온보딩 단일 카드로 동작한다. 업로드 성공 시 부모가 그룹 학습
 * 단계로 넘긴다.
 */
export default function PhotoUploadStep({
  onSubmit,
  maxBytes = DEFAULT_MAX_BYTES,
  t,
}: PhotoUploadStepProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    e.target.value = "";
    if (!f) return;
    if (f.type !== "image/jpeg" && f.type !== "image/png") {
      setValidationError(t("upload.errorType"));
      setFile(null);
      swapPreview(null);
      return;
    }
    if (f.size > maxBytes) {
      setValidationError(t("upload.errorTooLarge"));
      setFile(null);
      swapPreview(null);
      return;
    }
    setValidationError(null);
    setFile(f);
    swapPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!file || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(file);
    } catch {
      setValidationError(t("upload.errorUpload"));
      setSubmitting(false);
    }
    // 성공 시 단계가 바뀌며 이 컴포넌트는 언마운트되므로 setSubmitting(false) 불필요.
  };

  const guides = [
    t("upload.guideBackground"),
    t("upload.guideAttire"),
    t("upload.guideFront"),
    t("upload.guideFormat"),
  ];

  return (
    <div data-testid="step-upload" style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <CameraIcon size={26} />
        <h2 style={headingStyle}>{t("upload.title")}</h2>
      </div>
      <p style={descStyle}>{t("upload.description")}</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
          gap: 18,
          marginTop: 18,
          alignItems: "start",
        }}
      >
        {/* 좌: 가이드 */}
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
          {guides.map((g) => (
            <li key={g} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <CheckIcon size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text)" }}>{g}</span>
            </li>
          ))}
        </ul>

        {/* 우: 미리보기 + 업로드 */}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div
            aria-hidden={previewUrl ? undefined : "true"}
            style={{
              width: 110,
              height: 146,
              flexShrink: 0,
              borderRadius: 12,
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
                alt={t("upload.previewAlt")}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <PersonIcon size={40} mono style={{ color: "var(--text-faint)" }} />
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              onChange={onFileChange}
              style={{ display: "none" }}
              data-testid="upload-input"
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" onClick={pick} style={secondaryBtn} disabled={submitting}>
                {file ? t("upload.change") : t("upload.select")}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!file || submitting}
                data-testid="upload-submit"
                style={{
                  ...primaryBtn,
                  opacity: !file || submitting ? 0.45 : 1,
                  cursor: !file || submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? t("upload.submitting") : t("upload.submit")}
              </button>
            </div>

            {file && (
              <p style={fileNameStyle}>{file.name}</p>
            )}

            {validationError && (
              <p role="alert" style={{ margin: "10px 0 0", fontSize: 12, color: "var(--warning)" }}>
                {validationError}
              </p>
            )}

            <p style={{ margin: "12px 0 0", fontSize: 11.5, lineHeight: 1.5, color: "var(--text-faint)" }}>
              {t("upload.privacyNote")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const cardStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  borderRadius: 16,
  padding: 24,
  boxShadow: "var(--shadow-sm)",
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: "var(--text)",
};

const descStyle: CSSProperties = {
  margin: "2px 0 0",
  fontSize: 13.5,
  lineHeight: 1.6,
  color: "var(--text-muted)",
};

const fileNameStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 11.5,
  color: "var(--text-faint)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const secondaryBtn: CSSProperties = {
  padding: "9px 16px",
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
  padding: "9px 18px",
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 10,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  fontFamily: "inherit",
};
