"use client";

import type { CSSProperties } from "react";
import type { Avatar } from "./avatarsTypes";
import AvatarCard from "./AvatarCard";

interface AvatarLibraryProps {
  /** 가장 최근에 고른 아바타/룩 (서버에 영속화된 선택 또는 이번 세션 선택). */
  recent: Avatar | null;
  /** 라이브러리 항목 — 교수자가 만든 본인 아바타 + ready 룩. */
  items: Avatar[];
  selectedId: string | null;
  /** 카드 클릭 → 즉시 선택(재생성 없음). 부모가 최근 선택으로 영속화한다. */
  onSelect: (id: string) => void;
  /**
   * "최근 선택한 아바타" 를 아바타 제작에 쓸 룩으로 확정한다.
   * (강의에 바로 적용하지 않는다 — 아바타 = 룩 + 음성이므로 음성과 함께
   * 상단 "룩과 목소리 아바타 제작"에서 최종 제작·적용한다.)
   */
  onUseForBuild: () => void;
  /** 강의 컨텍스트에서 카드 인라인 이름 변경 허용 여부. */
  renameEnabled: boolean;
  onRename: (avatarId: string, name: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * "최근 선택한 아바타" 큰 박스 + "저장된 아바타·룩 라이브러리" 그리드.
 *
 * 재방문 교수자가 이미 만든 본인 아바타·룩을 한눈에 보고, 재생성 없이(비용 0)
 * 바로 골라 강의에 적용하도록 돕는다(docs/planning/05 아바타 선택 흐름). 최근
 * 선택은 서버(users.recent_avatar_id)에 영속화되어 다음 방문에도 복원된다.
 *
 * 만든 아바타·룩이 하나도 없으면(둘 다 비면) 아무것도 렌더하지 않는다 —
 * 첫 사용자는 위쪽 "내 사진으로 아바타 만들기" 카드부터 시작한다.
 */
export default function AvatarLibrary({
  recent,
  items,
  selectedId,
  onSelect,
  onUseForBuild,
  renameEnabled,
  onRename,
  t,
}: AvatarLibraryProps) {
  if (!recent && items.length === 0) return null;

  return (
    <section data-testid="avatar-library" style={cardStyle}>
      <h2 style={headingStyle}>{t("libraryTitle")}</h2>
      <p style={descStyle}>{t("libraryDescription")}</p>

      {/* 최근 선택한 아바타 — 크게 보여 주고 우측에서 바로 적용 */}
      {recent && (
        <div data-testid="recent-avatar-box" style={recentBoxStyle}>
          <div style={recentThumbStyle}>
            {recent.preview_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={recent.preview_image_url}
                alt={recent.name}
                style={fillStyle}
              />
            ) : recent.preview_video_url ? (
              <video
                src={recent.preview_video_url}
                muted
                playsInline
                preload="metadata"
                aria-hidden="true"
                style={fillStyle}
              />
            ) : (
              <span aria-hidden="true" style={initialStyle}>
                {recent.name.slice(0, 1)}
              </span>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <span style={recentEyebrowStyle}>{t("recentTitle")}</span>
            <span style={recentNameStyle} title={recent.name}>
              {recent.name}
            </span>
            <p style={recentNoteStyle}>{t("useForBuildNote")}</p>

            <div style={{ marginTop: "auto", paddingTop: 12 }}>
              <button
                type="button"
                onClick={onUseForBuild}
                data-testid="recent-use-build"
                style={applyBtnStyle}
              >
                {t("useForBuild")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 라이브러리 그리드 — 클릭 시 재생성 없이 즉시 선택 */}
      {items.length > 0 && (
        <div data-testid="avatar-library-grid" style={gridStyle}>
          {items.map((a) => (
            <AvatarCard
              key={a.id}
              avatar={a}
              selected={a.id === selectedId}
              onSelect={onSelect}
              renameEnabled={renameEnabled}
              onRename={(name) => onRename(a.id, name)}
              t={t}
            />
          ))}
        </div>
      )}
    </section>
  );
}

const cardStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  borderRadius: 16,
  padding: 20,
  boxShadow: "var(--shadow-sm)",
};

const headingStyle: CSSProperties = {
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

const recentBoxStyle: CSSProperties = {
  display: "flex",
  gap: 16,
  alignItems: "stretch",
  padding: 16,
  borderRadius: 14,
  background: "var(--gold-soft)",
  border: "1px solid var(--gold-medium)",
  marginBottom: 18,
};

const recentThumbStyle: CSSProperties = {
  position: "relative",
  width: 108,
  flexShrink: 0,
  aspectRatio: "3 / 4",
  borderRadius: 12,
  overflow: "hidden",
  background: "var(--bg-card)",
  border: "1px solid var(--gold-medium)",
};

const fillStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const initialStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  fontSize: 40,
  fontWeight: 700,
  color: "var(--text-faint)",
};

const recentEyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--gold-on-light)",
};

const recentNameStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 17,
  fontWeight: 700,
  color: "var(--text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const recentNoteStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--text-muted)",
};

const applyBtnStyle: CSSProperties = {
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 10,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  fontFamily: "inherit",
  cursor: "pointer",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  gap: 14,
};
