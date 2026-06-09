"use client";

import { useState, type CSSProperties, type KeyboardEvent } from "react";
import type { Avatar } from "./avatarsTypes";
import AvatarCard from "./AvatarCard";

interface AvatarLibraryProps {
  /** 가장 최근에 고른 아바타/룩 (서버에 영속화된 선택 또는 이번 세션 선택). */
  recent: Avatar | null;
  /** 라이브러리 항목 — 교수자가 만든 본인 아바타 + ready 룩. */
  items: Avatar[];
  selectedId: string | null;
  /** 카드/최근 박스 클릭 → 큰 보기(뷰어) 열기. 부모가 선택·영속화도 함께 처리한다. */
  onOpen: (avatar: Avatar) => void;
  /** 룩 이름 저장(연필). avatar.isLook 일 때만 노출. */
  onRenameLook: (id: string, name: string) => void;
  /**
   * "최근 선택한 아바타" 를 아바타 제작에 쓸 룩으로 확정한다.
   * (강의에 바로 적용하지 않는다 — 아바타 = 룩 + 음성이므로 음성과 함께 상단
   * "룩과 목소리 아바타 제작"에서 최종 제작·적용한다.)
   */
  onUseForBuild: () => void;
  /** 강의 컨텍스트에서 카드 인라인 이름 변경 허용 여부. */
  renameEnabled: boolean;
  onRename: (avatarId: string, name: string) => void;
  /** 라이브러리 항목을 ⋮ 메뉴로 삭제(라이브러리에서 제거). */
  onDelete?: (avatarId: string) => void;
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
  onOpen,
  onRenameLook,
  onUseForBuild,
  renameEnabled,
  onRename,
  onDelete,
  t,
}: AvatarLibraryProps) {
  if (!recent && items.length === 0) return null;

  return (
    <section data-testid="avatar-library" style={cardStyle}>
      <h2 style={headingStyle}>{t("libraryTitle")}</h2>
      <p style={descStyle}>{t("libraryDescription")}</p>

      {/* 최근 선택한 아바타 — 클릭하면 크게 보기, 연필로 이름 지정.
          key={recent.id} 로 항목이 바뀌면 내부 편집 상태가 자연히 초기화된다. */}
      {recent && (
        <RecentAvatarBox
          key={recent.id}
          recent={recent}
          onOpen={onOpen}
          onRenameLook={onRenameLook}
          onUseForBuild={onUseForBuild}
          t={t}
        />
      )}

      {/* 라이브러리 그리드 — 클릭 시 큰 보기(뷰어) */}
      {items.length > 0 && (
        <div data-testid="avatar-library-grid" style={gridStyle}>
          {items.map((a) => (
            <AvatarCard
              key={a.id}
              avatar={a}
              selected={a.id === selectedId}
              onSelect={() => onOpen(a)}
              renameEnabled={renameEnabled}
              onRename={(name) => onRename(a.id, name)}
              onDelete={onDelete}
              t={t}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** 최근 선택 박스 — 큰 보기 + 연필 인라인 이름. key={recent.id} 로 마운트되어
 *  항목 전환 시 편집 상태가 자동 초기화된다(setState-in-effect 회피). */
function RecentAvatarBox({
  recent,
  onOpen,
  onRenameLook,
  onUseForBuild,
  t,
}: {
  recent: Avatar;
  onOpen: (avatar: Avatar) => void;
  onRenameLook: (id: string, name: string) => void;
  onUseForBuild: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(recent.name);

  const commit = () => {
    const next = draft.trim();
    if (next !== recent.name) onRenameLook(recent.id, next);
    setEditing(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    }
  };

  return (
    <div data-testid="recent-avatar-box" style={recentBoxStyle}>
      <button
        type="button"
        onClick={() => onOpen(recent)}
        style={recentThumbStyle}
        aria-label={recent.name}
        data-testid="recent-open"
      >
        {recent.preview_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={recent.preview_image_url} alt={recent.name} style={fillStyle} />
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
      </button>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={recentEyebrowStyle}>{t("recentTitle")}</span>
          {(recent.kind === "photo" || recent.kind === "standard") && (
            <span
              data-testid="recent-kind-badge"
              style={{
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                color: "#0A0A0A",
                background:
                  recent.kind === "standard" ? "var(--gold)" : "var(--bg-card)",
                border: `1px solid ${recent.kind === "standard" ? "var(--gold)" : "var(--gold-medium)"}`,
              }}
            >
              {recent.kind === "standard" ? t("kindStandard") : t("kindPhoto")}
            </span>
          )}
        </div>

        {/* 이름 줄 — 영어 프롬프트 대신 사용자 지정 이름. 룩이면 연필로 편집. */}
        {editing ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              maxLength={80}
              aria-label={t("renameLabel")}
              placeholder={t("renamePlaceholder")}
              data-testid="recent-name-input"
              style={recentNameInput}
            />
            <button type="button" onClick={commit} style={miniBtn(true)} data-testid="recent-name-save">
              {t("renameSave")}
            </button>
            <button type="button" onClick={() => setEditing(false)} style={miniBtn(false)}>
              {t("renameCancel")}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
            <button
              type="button"
              onClick={() => onOpen(recent)}
              style={recentNameBtn}
              title={recent.name}
            >
              {recent.name}
            </button>
            {recent.isLook && (
              <button
                type="button"
                onClick={() => {
                  setDraft(recent.name);
                  setEditing(true);
                }}
                style={recentPencilBtn}
                aria-label={t("renameEdit")}
                title={t("renameEdit")}
                data-testid="recent-name-edit"
              >
                <PencilIcon />
              </button>
            )}
          </div>
        )}

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
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function miniBtn(primary: boolean): CSSProperties {
  return {
    flexShrink: 0,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "inherit",
    border: `1px solid ${primary ? "transparent" : "var(--line-strong)"}`,
    color: primary ? "#0A0A0A" : "var(--text-muted)",
    background: primary ? "var(--gold)" : "var(--bg-card)",
  };
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
  // 가로형 룩을 16:9 로 넓게(세로 크롭 답답함 해소). 클릭하면 큰 보기.
  width: 200,
  flexShrink: 0,
  aspectRatio: "16 / 9",
  borderRadius: 12,
  overflow: "hidden",
  background: "var(--bg-card)",
  border: "1px solid var(--gold-medium)",
  padding: 0,
  cursor: "pointer",
  fontFamily: "inherit",
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

const recentNameBtn: CSSProperties = {
  marginTop: 4,
  padding: 0,
  border: "none",
  background: "transparent",
  textAlign: "left",
  fontSize: 17,
  fontWeight: 700,
  color: "var(--text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  cursor: "pointer",
  fontFamily: "inherit",
  minWidth: 0,
};

const recentNameInput: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "6px 9px",
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 8,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontFamily: "inherit",
  outline: "none",
};

const recentPencilBtn: CSSProperties = {
  flexShrink: 0,
  width: 26,
  height: 26,
  borderRadius: 7,
  border: "1px solid var(--gold-medium)",
  background: "var(--bg-card)",
  color: "var(--gold-on-light, #B88308)",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  fontFamily: "inherit",
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
