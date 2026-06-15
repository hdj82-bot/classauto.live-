"use client";

import { useRef, useState, type ChangeEvent, type CSSProperties } from "react";

// 본인 사진 직접 업로드 한도(백엔드 _MAX_OWN_FACE_PHOTO 와 정합). 고화질 16:9 원본.
const OWN_PHOTO_MAX_BYTES = 30 * 1024 * 1024;

interface OwnPhotoUploadCardProps {
  /** 본인이 준비한 사진을 업로드한다(교수자 본인 얼굴 룩 등록). */
  onUpload: (file: File) => void;
  /** 업로드 진행 중이면 true(버튼 비활성·라벨 전환). */
  uploading: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * "내 사진으로 교수자 아바타 만들기" — AI 룩 생성(페르소나/복장/배경/표정)을 폐지하고,
 * 교수자가 직접 준비한 사진을 그대로 본인 아바타 룩으로 업로드하는 카드.
 *
 * 업로드한 사진은 라이브러리에 본인 아바타로 추가되고, Q&A 답변·미리보기는 이 얼굴로
 * VisionStory 합성된다(아바타 1회 생성 후 재사용·계정 한도 없음). 형식·용량(30MB)만 1차 검증해 부모에게
 * 파일을 넘긴다.
 */
export default function OwnPhotoUploadCard({
  onUpload,
  uploading,
  t,
}: OwnPhotoUploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택도 onChange 가 발화하도록 초기화.
    if (!file) return;
    const isImage =
      /^image\/(jpe?g|png)$/i.test(file.type) ||
      /\.(jpe?g|png)$/i.test(file.name);
    if (!isImage) {
      setError(t("libraryUploadInvalidType"));
      return;
    }
    if (file.size > OWN_PHOTO_MAX_BYTES) {
      setError(t("libraryUploadTooLarge"));
      return;
    }
    setError(null);
    onUpload(file);
  };

  return (
    <div style={cardStyle} data-testid="own-photo-upload">
      <h3 style={titleStyle}>{t("ownAvatarCardTitle")}</h3>
      <p style={descStyle}>{t("ownAvatarCardDesc")}</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        onChange={onPick}
        style={{ display: "none" }}
        data-testid="own-photo-input"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        style={{
          ...uploadBtnStyle,
          opacity: uploading ? 0.6 : 1,
          cursor: uploading ? "wait" : "pointer",
        }}
        data-testid="own-photo-upload-btn"
      >
        {uploading ? t("libraryUploading") : t("libraryUploadButton")}
      </button>

      {/* 업로드 버튼 바로 아래 부연 설명(16:9 권장). */}
      <p style={hintStyle}>{t("libraryUploadHint")}</p>
      {error && (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      )}
    </div>
  );
}

const cardStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  borderRadius: 16,
  padding: 22,
  boxShadow: "var(--shadow-sm)",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  color: "var(--text)",
};

const descStyle: CSSProperties = {
  margin: "4px 0 16px",
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--text-muted)",
};

const uploadBtnStyle: CSSProperties = {
  padding: "11px 20px",
  fontSize: 14,
  fontWeight: 700,
  borderRadius: 10,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  fontFamily: "inherit",
};

const hintStyle: CSSProperties = {
  margin: "10px 0 0",
  fontSize: 12.5,
  lineHeight: 1.5,
  color: "var(--text-muted)",
};

const errorStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--danger, #b91c1c)",
};
