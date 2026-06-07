"use client";

import type { CSSProperties } from "react";
import type { SavedAvatar } from "./avatarsTypes";
import SavedAvatarCard from "./SavedAvatarCard";

interface SavedAvatarGalleryProps {
  /** 저장된 아바타(룩 + 음성 조합) 목록 — 최신순. */
  items: SavedAvatar[];
  /** look_id → 룩 썸네일 URL 해석기(없으면 이니셜 폴백). */
  resolveLookImage: (lookId: string) => string | null;
  /** voice_id → 음성 표시 이름 해석기(없으면 기본 보이스 라벨). */
  resolveVoiceName: (voiceId: string | null) => string | null;
  /** 강의 컨텍스트(?lecture=)가 있어 "강의에 적용"이 가능한지. */
  canApply: boolean;
  /** 현재 강의에 적용 중인 카드 id(해당 카드만 비활성). */
  applyingId: string | null;
  onApply: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onPreview: (id: string) => void;
  reducedMotion: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * "내 아바타 갤러리" — 저장된 룩 + 음성 조합 카드 그리드 + 빈 상태.
 *
 * 교수자가 스크립트 테스트에서 "이 아바타 저장"으로 만든 조합을 모아 두고,
 * 강의마다 재생성 없이 바로 적용한다(비용 0). AvatarLibrary 의 섹션·그리드
 * 스타일 토큰(라이트 베이지 + 골드)을 그대로 재사용한다.
 */
export default function SavedAvatarGallery({
  items,
  resolveLookImage,
  resolveVoiceName,
  canApply,
  applyingId,
  onApply,
  onRename,
  onDelete,
  onPreview,
  reducedMotion,
  t,
}: SavedAvatarGalleryProps) {
  return (
    <section data-testid="saved-avatar-gallery" style={cardStyle}>
      <h2 style={headingStyle}>{t("savedTitle")}</h2>
      <p style={descStyle}>{t("savedDescription")}</p>

      {items.length === 0 ? (
        <div data-testid="saved-avatar-empty" style={emptyStyle}>
          {t("savedEmpty")}
        </div>
      ) : (
        <div data-testid="saved-avatar-grid" style={gridStyle}>
          {items.map((a) => (
            <SavedAvatarCard
              key={a.id}
              avatar={a}
              lookImageUrl={resolveLookImage(a.look_id)}
              voiceName={resolveVoiceName(a.voice_id)}
              canApply={canApply}
              applying={applyingId === a.id}
              onApply={onApply}
              onRename={onRename}
              onDelete={onDelete}
              onPreview={onPreview}
              reducedMotion={reducedMotion}
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

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: 14,
};

const emptyStyle: CSSProperties = {
  padding: "24px 16px",
  borderRadius: 12,
  border: "1px dashed var(--line-strong)",
  background: "var(--bg-subtle)",
  textAlign: "center",
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--text-muted)",
};
