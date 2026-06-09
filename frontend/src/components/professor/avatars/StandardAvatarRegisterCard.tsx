"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { listHeyGenAccountAvatars, registerStandardAvatar } from "./avatarsApi";
import type { Avatar, StandardAvatar } from "./avatarsTypes";

interface StandardAvatarRegisterCardProps {
  /** 등록 성공 시 — 페이지가 라이브러리를 즉시 다시 불러온다. */
  onRegistered?: (avatar: StandardAvatar) => void;
  /** 강의 컨텍스트 — 전체 둘러보기 링크에 보존한다. */
  lectureId?: string | null;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/** 백엔드 오류 응답의 detail 문구를 꺼낸다(없으면 null). */
function backendDetail(err: unknown): string | null {
  const e = err as { response?: { data?: { detail?: unknown } } } | undefined;
  const d = e?.response?.data?.detail;
  return typeof d === "string" && d.trim() ? d : null;
}

// 검색 결과를 한 번에 너무 많이 그리지 않도록 캡(이미지 카드라 무겁다). 초과분은
// "검색으로 좁히세요" 안내로 대체한다.
const MAX_VISIBLE = 48;

/**
 * "표준 아바타 등록" — HeyGen 계정 아바타를 이름·썸네일로 골라 등록한다.
 *
 * Pay-As-You-Go 등급은 커스텀 Video Avatar 를 API 로 생성할 수 없으므로(Enterprise
 * 전용), 교수자가 HeyGen 웹 스튜디오에서 본인 영상으로 Video Avatar 를 1회 만든 뒤
 * 그 아바타를 여기서 고른다. avatar_id 를 직접 찾을 필요 없이, 계정 아바타 목록을
 * 불러와 스튜디오에서 지은 이름으로 검색·선택한다(고른 id 는 /v2/avatars 출처라
 * 등록 검증을 항상 통과). 목록을 못 불러오면 avatar_id 직접 입력으로 폴백한다.
 */
export default function StandardAvatarRegisterCard({
  onRegistered,
  lectureId,
  t,
}: StandardAvatarRegisterCardProps) {
  const browseHref = `/professor/avatars/browse${
    lectureId ? `?lecture=${lectureId}` : ""
  }`;
  const { toast } = useToast();

  // 계정 아바타 목록(피커). null = 아직 로드 전.
  const [accountAvatars, setAccountAvatars] = useState<Avatar[] | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // avatar_id 직접 입력(폴백). 목록을 못 불러왔거나 사용자가 펼치면 노출.
  const [manualOpen, setManualOpen] = useState(false);
  const [manualId, setManualId] = useState("");

  const loadAccount = useCallback(async () => {
    setLoadStatus("loading");
    try {
      const list = await listHeyGenAccountAvatars();
      setAccountAvatars(list);
      setLoadStatus("ready");
      // 목록이 비면(MOCK/미배포/계정에 아바타 없음) 수동 입력을 바로 펼친다.
      if (list.length === 0) setManualOpen(true);
    } catch {
      setAccountAvatars([]);
      setLoadStatus("error");
      setManualOpen(true);
    }
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const filtered = useMemo(() => {
    const list = accountAvatars ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) => a.name.toLowerCase().includes(q));
  }, [accountAvatars, search]);

  const visible = filtered.slice(0, MAX_VISIBLE);
  const overflow = filtered.length - visible.length;

  // 카드 선택 — 다른 아바타로 바꾸면 표시 이름도 그 아바타 이름으로 갱신한다
  // (사용자가 이후 수정 가능). 이전엔 비어 있을 때만 채워 전환 시 안 바뀌던 버그 수정.
  const handlePick = useCallback((a: Avatar) => {
    setSelectedId(a.id);
    setManualId("");
    setName(a.name);
  }, []);

  // 등록 대상 id — 수동 입력이 있으면 그것, 아니면 피커에서 고른 것.
  const usingManual = manualOpen && !!manualId.trim();
  const effectiveId = usingManual ? manualId.trim() : selectedId;
  // 피커에서 고른 아바타 — 등록 시 메타데이터를 함께 보내 서버 재조회(느림)를 건너뛴다.
  const picked = useMemo(
    () =>
      usingManual
        ? null
        : (accountAvatars ?? []).find((a) => a.id === selectedId) ?? null,
    [usingManual, accountAvatars, selectedId],
  );

  const handleSubmit = useCallback(async () => {
    const id = (effectiveId || "").trim();
    if (!id) return;
    setSubmitting(true);
    try {
      const avatar = await registerStandardAvatar(
        id,
        name.trim() || null,
        picked
          ? {
              preview_image_url: picked.preview_image_url,
              preview_video_url: picked.preview_video_url,
              gender: picked.gender,
            }
          : null,
      );
      toast(t("standardRegisterSuccess"), "success");
      setSelectedId(null);
      setManualId("");
      setName("");
      onRegistered?.(avatar);
    } catch (err) {
      toast(backendDetail(err) ?? t("standardRegisterError"), "error");
    } finally {
      setSubmitting(false);
    }
  }, [effectiveId, name, picked, toast, t, onRegistered]);

  return (
    <div data-testid="standard-avatar-register" style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <FilmIcon />
        <h3 style={titleStyle}>{t("standardRegisterTitle")}</h3>
      </div>
      <p style={descStyle}>{t("standardRegisterDescription")}</p>
      <Link href={browseHref} data-testid="standard-browse-link" style={heygenLinkStyle}>
        {t("standardBrowseLink")} →
      </Link>

      {/* 계정 아바타 피커 — 이름으로 검색해 본인 스튜디오 아바타를 고른다. */}
      {loadStatus !== "error" && (accountAvatars?.length ?? 0) > 0 && (
        <div style={{ marginTop: 16 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("standardPickerSearchPlaceholder")}
            data-testid="standard-picker-search"
            style={inputStyle}
          />
          {filtered.length === 0 ? (
            <p style={mutedNote}>{t("standardPickerSearchEmpty")}</p>
          ) : (
            <>
              <div style={gridStyle} data-testid="standard-picker-grid">
                {visible.map((a) => {
                  const selected = a.id === selectedId;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => handlePick(a)}
                      aria-pressed={selected}
                      data-testid={`standard-picker-item-${a.id}`}
                      style={pickStyle(selected)}
                    >
                      <span style={thumbWrap}>
                        {a.preview_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.preview_image_url}
                            alt={a.name}
                            loading="lazy"
                            style={fillStyle}
                          />
                        ) : (
                          <span aria-hidden="true" style={thumbInitial}>
                            {a.name.slice(0, 1)}
                          </span>
                        )}
                        {selected && (
                          <span aria-hidden="true" style={checkBadge}>
                            ✓
                          </span>
                        )}
                      </span>
                      <span style={pickName} title={a.name}>
                        {a.name}
                      </span>
                    </button>
                  );
                })}
              </div>
              {overflow > 0 && (
                <p style={mutedNote}>
                  {t("standardPickerMoreHint", { count: overflow })}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {loadStatus === "loading" && (
        <p style={mutedNote} data-testid="standard-picker-loading">
          {t("standardPickerLoading")}
        </p>
      )}
      {loadStatus === "error" && (
        <p role="alert" style={errorNote} data-testid="standard-picker-error">
          {t("standardPickerError")}
        </p>
      )}

      {/* 표시 이름(선택) — 고른 아바타 이름이 기본값. */}
      <label style={{ ...labelStyle, marginTop: 16 }}>
        {t("standardRegisterNameLabel")}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("standardRegisterNamePlaceholder")}
          data-testid="standard-avatar-name-input"
          maxLength={80}
          style={inputStyle}
        />
      </label>

      {/* avatar_id 직접 입력(폴백) — 목록에서 못 찾거나 id 를 이미 아는 경우. */}
      <button
        type="button"
        onClick={() => setManualOpen((v) => !v)}
        data-testid="standard-manual-toggle"
        style={manualToggleBtn}
      >
        {manualOpen ? t("standardManualHide") : t("standardManualToggle")}
      </button>
      {manualOpen && (
        <div style={{ marginTop: 10 }}>
          <input
            value={manualId}
            onChange={(e) => {
              setManualId(e.target.value);
              if (e.target.value.trim()) setSelectedId(null);
            }}
            placeholder={t("standardRegisterIdPlaceholder")}
            data-testid="standard-avatar-id-input"
            maxLength={255}
            style={inputStyle}
          />
          <ol style={guideStyle}>
            <li>{t("standardRegisterStep1")}</li>
            <li>{t("standardRegisterStep2Api")}</li>
          </ol>
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !effectiveId}
        data-testid="standard-avatar-register-submit"
        style={{
          ...submitBtn,
          opacity: submitting || !effectiveId ? 0.5 : 1,
          cursor: submitting || !effectiveId ? "not-allowed" : "pointer",
        }}
      >
        {submitting ? t("standardRegistering") : t("standardRegisterSubmit")}
      </button>
    </div>
  );
}

function FilmIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--gold-on-light, #B88308)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
    </svg>
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
  margin: "2px 0 0",
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--text-muted)",
};

const heygenLinkStyle: CSSProperties = {
  display: "inline-block",
  marginTop: 8,
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--gold-on-light, #B88308)",
  textDecoration: "none",
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--text)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  fontSize: 13,
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontFamily: "inherit",
  outline: "none",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
  gap: 10,
  marginTop: 12,
  maxHeight: 360,
  overflowY: "auto",
  padding: 2,
};

function pickStyle(selected: boolean): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 8,
    borderRadius: 12,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
    background: selected ? "var(--gold-soft)" : "var(--bg-card)",
    border: `2px solid ${selected ? "var(--gold)" : "var(--line)"}`,
    boxShadow: selected ? "0 0 0 3px var(--gold-medium)" : "none",
    transition: "border-color 140ms var(--ease-out)",
  };
}

const thumbWrap: CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "3 / 4",
  borderRadius: 8,
  overflow: "hidden",
  background: "var(--bg-subtle)",
  display: "block",
};

const fillStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const thumbInitial: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  fontSize: 28,
  fontWeight: 700,
  color: "var(--text-faint)",
};

const checkBadge: CSSProperties = {
  position: "absolute",
  top: 5,
  right: 5,
  width: 20,
  height: 20,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  background: "var(--gold)",
  color: "#0A0A0A",
  fontSize: 11,
  fontWeight: 800,
};

const pickName: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const mutedNote: CSSProperties = {
  margin: "10px 0 0",
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--text-muted)",
};

const errorNote: CSSProperties = {
  margin: "12px 0 0",
  padding: "10px 12px",
  borderRadius: 10,
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--warning, #B45309)",
  background: "var(--gold-soft)",
  border: "1px solid var(--gold-medium)",
};

const manualToggleBtn: CSSProperties = {
  marginTop: 14,
  padding: 0,
  border: "none",
  background: "transparent",
  color: "var(--gold-on-light, #B88308)",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const guideStyle: CSSProperties = {
  margin: "10px 0 0",
  padding: "12px 14px 12px 30px",
  borderRadius: 12,
  background: "var(--bg-subtle)",
  border: "1px solid var(--line)",
  fontSize: 12.5,
  lineHeight: 1.7,
  color: "var(--text-muted)",
};

const submitBtn: CSSProperties = {
  display: "block",
  marginTop: 18,
  padding: "11px 20px",
  fontSize: 14,
  fontWeight: 700,
  borderRadius: 12,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  fontFamily: "inherit",
};
