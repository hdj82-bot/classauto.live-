"use client";

import {
  useEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import type { Avatar } from "./avatarsTypes";

interface AvatarViewerModalProps {
  avatar: Avatar;
  /**
   * "이 룩으로 아바타 제작" — 이 룩/아바타를 상단 "룩" 슬롯으로 선택한다(제작 대상).
   * 강의에 바로 적용하지 않는다 — 음성을 고른 뒤 "룩과 목소리 아바타 제작"에서
   * (본인 얼굴=Hedra / 표준=HeyGen) 합성한다.
   */
  onUseForBuild: (id: string) => void;
  /** 룩 이름 저장(연필). avatar.isLook 일 때만 노출. */
  onRename: (id: string, name: string) => void;
  onClose: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * 라이브러리 룩/아바타를 **가로형 그대로 크게** 보는 모달. 카드/최근 박스를
 * 클릭하면 열린다(2026-06-03 사용자 요청: 세로 크롭이 답답 → 16:9 전체 노출).
 *
 * 룩(avatar.isLook)이면 제목 옆 연필로 표시 이름을 직접 붙일 수 있다(영어 프롬프트
 * 노출 대체). 이미지는 ``object-fit: contain`` 으로 가로형 원본을 잘리지 않게 보여준다.
 */
export default function AvatarViewerModal({
  avatar,
  onUseForBuild,
  onRename,
  onClose,
  t,
}: AvatarViewerModalProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(avatar.name);

  // Esc 닫기 + body 스크롤 잠금.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const commit = () => {
    const next = draft.trim();
    if (next !== avatar.name) onRename(avatar.id, next);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(avatar.name);
    setEditing(false);
  };
  const onEditKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={avatar.name}
      onClick={onClose}
      style={overlayStyle}
      data-testid="avatar-viewer-modal"
    >
      <div onClick={(e) => e.stopPropagation()} style={dialogStyle}>
        <header style={headerStyle}>
          {/* 제목 = 룩 이름(연필 편집). 영어 프롬프트는 더 이상 노출하지 않는다. */}
          {editing ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1, minWidth: 0 }}>
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onEditKey}
                maxLength={80}
                aria-label={t("renameLabel")}
                placeholder={t("renamePlaceholder")}
                data-testid="viewer-name-input"
                style={nameInput}
              />
              <button type="button" onClick={commit} style={miniBtn(true)} data-testid="viewer-name-save">
                {t("renameSave")}
              </button>
              <button type="button" onClick={cancel} style={miniBtn(false)}>
                {t("renameCancel")}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
              <h3 style={titleStyle} title={avatar.name}>
                {avatar.name}
              </h3>
              {avatar.isLook && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(avatar.name);
                    setEditing(true);
                  }}
                  style={pencilBtn}
                  aria-label={t("renameEdit")}
                  title={t("renameEdit")}
                  data-testid="viewer-name-edit"
                >
                  <PencilIcon />
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            style={closeBtn}
            aria-label={t("viewerClose")}
            data-testid="avatar-viewer-close"
          >
            ×
          </button>
        </header>

        <div style={bodyStyle}>
          <div style={frameStyle}>
            {/* 미리보기 영상이 있으면 바로 재생한다("클릭하면 크게 재생"). 자동재생은
                브라우저 정책상 muted 로만 가능 — 컨트롤로 소리를 켤 수 있다. 영상이
                없을 때만 정지 이미지로 폴백한다. 이전엔 이미지가 있으면 영상이 있어도
                정지 이미지를 보여 줘 "재생"이 되지 않았다(2026-06-09 사용자 피드백). */}
            {avatar.preview_video_url ? (
              <video
                src={avatar.preview_video_url}
                poster={avatar.preview_image_url ?? undefined}
                controls
                autoPlay
                muted
                loop
                playsInline
                aria-label={avatar.name}
                style={imgStyle}
              />
            ) : avatar.preview_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar.preview_image_url} alt={avatar.name} style={imgStyle} />
            ) : (
              <span style={{ color: "var(--text-faint)", fontSize: 13 }}>
                {t("viewerNoImage")}
              </span>
            )}
          </div>
        </div>

        <footer style={footerStyle}>
          <button type="button" onClick={onClose} style={secondaryBtn} data-testid="avatar-viewer-cancel">
            {t("viewerClose")}
          </button>
          {/* "이 룩으로 아바타 제작" — 강의에 바로 적용하지 않고, 상단 "룩" 슬롯으로
              선택한다(클릭 시 부모가 선택 + 모달 닫기). 이후 음성 선택 → 제작. */}
          <button
            type="button"
            onClick={() => onUseForBuild(avatar.id)}
            data-testid="avatar-viewer-apply"
            style={primaryBtn}
          >
            {t("viewerUseForBuild")}
          </button>
        </footer>
      </div>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(10, 10, 10, 0.72)",
  display: "grid",
  placeItems: "center",
  padding: 24,
  zIndex: 1000,
  animation: "studio-fade-in 140ms var(--ease-out)",
};

const dialogStyle: CSSProperties = {
  width: "min(1120px, 100%)",
  maxHeight: "94vh",
  display: "flex",
  flexDirection: "column",
  background: "var(--bg-card)",
  borderRadius: 18,
  border: "1px solid var(--line-strong)",
  boxShadow: "0 24px 64px rgba(0, 0, 0, 0.32)",
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 20px",
  borderBottom: "1px solid var(--line)",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  color: "var(--text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const pencilBtn: CSSProperties = {
  flexShrink: 0,
  width: 30,
  height: 30,
  borderRadius: 8,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--gold-on-light, #B88308)",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  fontFamily: "inherit",
};

const nameInput: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "7px 10px",
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 8,
  border: "1px solid var(--line-strong)",
  background: "var(--bg)",
  color: "var(--text)",
  fontFamily: "inherit",
  outline: "none",
};

function miniBtn(primary: boolean): CSSProperties {
  return {
    flexShrink: 0,
    padding: "6px 12px",
    fontSize: 12.5,
    fontWeight: 700,
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "inherit",
    border: `1px solid ${primary ? "transparent" : "var(--line-strong)"}`,
    color: primary ? "#0A0A0A" : "var(--text-muted)",
    background: primary ? "var(--gold)" : "var(--bg-card)",
  };
}

const closeBtn: CSSProperties = {
  flexShrink: 0,
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "none",
  background: "transparent",
  fontSize: 22,
  lineHeight: 1,
  color: "var(--text-muted)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const bodyStyle: CSSProperties = {
  padding: 20,
  overflowY: "auto",
  flex: "1 1 auto",
  minHeight: 0,
};

const frameStyle: CSSProperties = {
  width: "100%",
  borderRadius: 12,
  background: "#0A0A0A",
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
};

// 가로형 원본을 잘리지 않게 — contain + 16:9 톤, 화면 높이 초과 방지.
const imgStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "auto",
  maxHeight: "74vh",
  objectFit: "contain",
};

const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  padding: "14px 20px",
  borderTop: "1px solid var(--line)",
  background: "var(--bg-subtle)",
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
