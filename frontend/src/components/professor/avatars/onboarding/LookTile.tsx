"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LOOK_ETA_MS, type Look } from "./photoAvatarTypes";
import { CheckIcon, PersonIcon } from "./PhotoAvatarIcons";

interface LookTileProps {
  look: Look;
  selected?: boolean;
  reducedMotion?: boolean;
  /** 제공되면 클릭으로 선택 가능. 기본은 ready 타일만 클릭 가능. */
  onSelect?: (lookId: string) => void;
  /**
   * true 면 generating·failed 타일도 클릭 가능하게 한다(정체·실패 룩을 정리하기
   * 위함). 생성 단계에서만 켠다 — 선택 단계는 ready 타일만 골라야 하므로 기본 false.
   */
  allowOpenAnyStatus?: boolean;
  /** ⋮ 메뉴의 '삭제'. 제공 시 우상단 ⋮ 메뉴가 뜬다(크게 열지 않고 바로 삭제). */
  onDelete?: (lookId: string) => void;
  /** ⋮ 메뉴의 '라이브러리에 저장'. ready·미저장 룩에만 노출. */
  onSave?: (lookId: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * 룩 1개 타일 — 생성 진행(generating) / 완료(ready) / 실패(failed) 상태를
 * 3:4 썸네일로 표현. 선택 가능하면 골드 링으로 강조한다. onDelete/onSave 가
 * 주어지면 우상단 ⋮ 메뉴로 모달을 열지 않고 바로 저장/삭제할 수 있다.
 */
export default function LookTile({
  look,
  selected,
  reducedMotion,
  onSelect,
  allowOpenAnyStatus,
  onDelete,
  onSave,
  t,
}: LookTileProps) {
  const isReady = look.status === "ready";
  const isGenerating = look.status === "generating";
  // ready 는 "선택", non-ready 는 "정리(삭제)" 용도로 클릭을 연다(opt-in).
  const interactive = !!onSelect && (isReady || !!allowOpenAnyStatus);
  const Wrapper = interactive ? "button" : "div";

  // 생성 중 진행 막대 — 1초마다 현재 시각을 상태에 담아 ETA 막대를 채운다.
  // Date.now() 는 렌더가 아닌 effect 안에서만 호출한다(react-hooks/purity 준수).
  // 시작 시각은 서버 created_at(탭을 닫았다 열어도 정확) 우선, 없으면 effect 가
  // 처음 본 시각(fallbackStart)으로 폴백한다. 렌더에서 ref 를 읽지 않도록(=
  // react-hooks/refs) 둘 다 state 로 둔다.
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [fallbackStart, setFallbackStart] = useState<number | null>(null);
  useEffect(() => {
    if (!isGenerating) return;
    const tick = () => {
      const t = Date.now();
      setFallbackStart((prev) => prev ?? t);
      setNowMs(t);
    };
    tick(); // 즉시 1회 — 첫 렌더 직후 바로 막대가 차게.
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isGenerating]);

  const parsedCreated = look.createdAt ? Date.parse(look.createdAt) : NaN;
  const startMs = !Number.isNaN(parsedCreated) ? parsedCreated : fallbackStart;
  const elapsed =
    nowMs != null && startMs != null ? Math.max(0, nowMs - startMs) : 0;
  // 막대는 92%까지만 차오른다 — 완료는 폴링이 확정하므로 끝까지 차면 거짓 완료처럼 보인다.
  const progressPct = Math.min(0.92, elapsed / LOOK_ETA_MS);
  const remainingSec = Math.max(0, Math.ceil((LOOK_ETA_MS - elapsed) / 1000));

  // ⋮ 메뉴 — '저장'은 ready·미저장에만, '삭제'는 onDelete 가 있으면 항상.
  const canSave = !!onSave && isReady && !look.saved;
  const hasMenu = !!onDelete || canSave;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div style={{ position: "relative" }}>
      <Wrapper
        type={interactive ? "button" : undefined}
        onClick={interactive ? () => onSelect?.(look.look_id) : undefined}
        // 선택 토글 의미는 ready 타일에만 부여(non-ready 는 정리용 버튼).
        aria-pressed={interactive && isReady ? !!selected : undefined}
        disabled={interactive ? false : undefined}
        data-testid={`look-tile-${look.look_id}`}
        data-status={look.status}
        style={{
          ...tileStyle,
          cursor: interactive ? "pointer" : "default",
          borderColor: selected ? "var(--gold)" : "var(--line)",
          boxShadow: selected ? "0 0 0 3px var(--gold-medium)" : "var(--shadow-sm)",
        }}
      >
        <span style={thumbStyle}>
          {look.status === "ready" && (look.image_url || look.preview_image_url) ? (
            // v0.2 gpt 룩은 image_url(S3) 우선, 레거시는 preview_image_url 폴백.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={look.image_url ?? look.preview_image_url ?? ""}
              alt={look.categoryLabel || t("looks.tileAlt")}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : look.status === "failed" ? (
            <span style={centerBox}>
              <PersonIcon size={30} mono style={{ color: "var(--text-faint)" }} />
              <span style={{ fontSize: 11, color: "var(--warning)", marginTop: 6 }}>
                {t("looks.tileFailed")}
              </span>
            </span>
          ) : (
            // generating — 막대형 진행률 + 남은 시간 추정.
            <span style={centerBox}>
              {!reducedMotion ? (
                <span style={ringStyle} aria-hidden="true" />
              ) : (
                <PersonIcon size={28} mono style={{ color: "var(--text-faint)" }} />
              )}
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                {t("looks.tileGenerating")}
              </span>
              <span
                style={progressTrack}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progressPct * 100)}
                aria-label={t("looks.tileGenerating")}
              >
                <span
                  style={{
                    ...progressFill,
                    width: `${Math.round(progressPct * 100)}%`,
                    // reduced-motion 이면 폭 전환 애니메이션을 끈다.
                    transition: reducedMotion ? "none" : "width 1s linear",
                  }}
                />
              </span>
              <span style={progressLabel}>
                {remainingSec > 0
                  ? t("looks.tileEta", { sec: remainingSec })
                  : t("looks.tileFinishing")}
              </span>
            </span>
          )}

          {/* 선택 체크는 좌상단(우상단은 ⋮ 메뉴 자리). */}
          {selected && (
            <span style={selectedBadge} aria-hidden="true">
              <CheckIcon size={14} mono style={{ color: "#0A0A0A" }} />
            </span>
          )}
          {/* 라이브러리 저장됨 표시 */}
          {look.saved && (
            <span style={savedBadge}>{t("looks.menu.saved")}</span>
          )}
        </span>

        {/* 캡션: 영어 프롬프트 대신 한국어 카테고리 조합만 노출(2026-06-02).
            입력을 모르는 룩(새로고침 후 등)은 캡션을 그리지 않는다. */}
        {look.categoryLabel && (
          <span style={captionStyle} title={look.categoryLabel}>
            {look.categoryLabel}
          </span>
        )}
      </Wrapper>

      {/* 우상단 ⋮ 메뉴 — Wrapper(button) 바깥 형제로 둬 버튼 중첩을 피한다. */}
      {hasMenu && (
        <div ref={menuRef} style={menuAnchor}>
          <button
            type="button"
            aria-label={t("looks.menu.open")}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-testid={`look-menu-${look.look_id}`}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            style={menuButton}
          >
            <DotsIcon />
          </button>
          {menuOpen && (
            <div role="menu" style={menuDropdown}>
              {canSave && (
                <button
                  type="button"
                  role="menuitem"
                  data-testid={`look-menu-save-${look.look_id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onSave?.(look.look_id);
                  }}
                  style={menuItem}
                >
                  {t("looks.menu.save")}
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  role="menuitem"
                  data-testid={`look-menu-delete-${look.look_id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onDelete(look.look_id);
                  }}
                  style={{ ...menuItem, color: "var(--danger, #C0392B)" }}
                >
                  {t("looks.menu.delete")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

const tileStyle: CSSProperties = {
  display: "block",
  width: "100%",
  padding: 8,
  borderRadius: 14,
  border: "2px solid",
  background: "var(--bg-card)",
  textAlign: "left",
  fontFamily: "inherit",
  transition: "box-shadow 140ms var(--ease-out), border-color 140ms var(--ease-out)",
};

const thumbStyle: CSSProperties = {
  display: "block",
  position: "relative",
  width: "100%",
  // 백엔드가 룩을 16:9 로 출력한다(3:2 생성 후 선명 크롭). 프레임도 16:9 로 맞춰
  // cover 가 잘라내지 않게 한다(이전 3:4 세로 프레임이 하단을 잘랐던 문제 해소).
  aspectRatio: "16 / 9",
  borderRadius: 10,
  overflow: "hidden",
  background: "var(--bg-subtle)",
};

const centerBox: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
};

const ringStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  border: "3px solid var(--gold-soft)",
  borderTopColor: "var(--gold)",
  animation: "studio-spin 0.9s linear infinite",
};

const progressTrack: CSSProperties = {
  display: "block",
  width: "72%",
  maxWidth: 160,
  height: 6,
  marginTop: 10,
  borderRadius: 999,
  background: "var(--gold-soft, #FFE6A8)",
  overflow: "hidden",
};

const progressFill: CSSProperties = {
  display: "block",
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg, #FFB627, #E89E0E)",
};

const progressLabel: CSSProperties = {
  marginTop: 6,
  fontSize: 10.5,
  fontWeight: 600,
  color: "var(--text-faint)",
  fontVariantNumeric: "tabular-nums",
};

const selectedBadge: CSSProperties = {
  position: "absolute",
  top: 8,
  left: 8,
  width: 24,
  height: 24,
  borderRadius: "50%",
  background: "var(--gold)",
  display: "grid",
  placeItems: "center",
  boxShadow: "var(--shadow-sm)",
};

const savedBadge: CSSProperties = {
  position: "absolute",
  bottom: 8,
  left: 8,
  padding: "2px 7px",
  borderRadius: 999,
  fontSize: 10.5,
  fontWeight: 700,
  color: "#0A0A0A",
  background: "var(--gold-soft, #FFE6A8)",
  border: "1px solid var(--gold-medium, #F0C04B)",
};

const menuAnchor: CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  zIndex: 3,
};

const menuButton: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "rgba(255,255,255,0.9)",
  color: "var(--text)",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  boxShadow: "var(--shadow-sm)",
  fontFamily: "inherit",
};

const menuDropdown: CSSProperties = {
  position: "absolute",
  top: 32,
  right: 0,
  minWidth: 150,
  background: "var(--bg-card)",
  border: "1px solid var(--line-strong)",
  borderRadius: 10,
  boxShadow: "0 10px 28px rgba(0,0,0,0.16)",
  padding: 4,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const menuItem: CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  fontSize: 12.5,
  fontWeight: 600,
  borderRadius: 7,
  border: "none",
  background: "transparent",
  color: "var(--text)",
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};

const captionStyle: CSSProperties = {
  display: "block",
  marginTop: 8,
  fontSize: 11.5,
  lineHeight: 1.4,
  color: "var(--text-muted)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
