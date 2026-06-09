"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { useToast } from "@/components/ui/Toast";
import { registerStandardAvatar } from "./avatarsApi";
import type { StandardAvatar } from "./avatarsTypes";

interface StandardAvatarRegisterCardProps {
  /** 등록 성공 시 — 페이지가 라이브러리를 즉시 다시 불러온다. */
  onRegistered?: (avatar: StandardAvatar) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/** 백엔드 오류 응답의 detail 문구를 꺼낸다(없으면 null). */
function backendDetail(err: unknown): string | null {
  const e = err as { response?: { data?: { detail?: unknown } } } | undefined;
  const d = e?.response?.data?.detail;
  return typeof d === "string" && d.trim() ? d : null;
}

/**
 * "표준 아바타 등록" — HeyGen 웹 스튜디오에서 만든 Video Avatar 의 avatar_id 를
 * 등록한다.
 *
 * Pay-As-You-Go 등급은 커스텀 Video Avatar 를 API 로 생성할 수 없으므로(Enterprise
 * 전용), 교수자가 웹 스튜디오에서 본인 영상으로 Video Avatar 를 1회 만든 뒤 그
 * avatar_id 를 여기 붙여 넣어 등록한다. 등록하면 갤러리에 "표준 아바타"로 나타나
 * 포토 아바타(Talking Photo)와 자연스러움을 비교하고 강의에 적용할 수 있다.
 */
export default function StandardAvatarRegisterCard({
  onRegistered,
  t,
}: StandardAvatarRegisterCardProps) {
  const { toast } = useToast();
  const [avatarId, setAvatarId] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    const id = avatarId.trim();
    if (!id) return;
    setSubmitting(true);
    try {
      const avatar = await registerStandardAvatar(id, name.trim() || null);
      toast(t("standardRegisterSuccess"), "success");
      setAvatarId("");
      setName("");
      onRegistered?.(avatar);
    } catch (err) {
      // 서버가 사유(미발견·HeyGen 오류 등)를 주면 그대로 보여 준다 — 더 행동 가능.
      toast(backendDetail(err) ?? t("standardRegisterError"), "error");
    } finally {
      setSubmitting(false);
    }
  }, [avatarId, name, toast, t, onRegistered]);

  return (
    <div data-testid="standard-avatar-register" style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <FilmIcon />
        <h3 style={titleStyle}>{t("standardRegisterTitle")}</h3>
      </div>
      <p style={descStyle}>{t("standardRegisterDescription")}</p>

      {/* avatar_id 찾는 법 안내 */}
      <ol style={guideStyle}>
        <li>{t("standardRegisterStep1")}</li>
        <li>{t("standardRegisterStep2")}</li>
        <li>{t("standardRegisterStep3")}</li>
      </ol>

      <div style={fieldsStyle}>
        <label style={labelStyle}>
          {t("standardRegisterIdLabel")}
          <input
            value={avatarId}
            onChange={(e) => setAvatarId(e.target.value)}
            placeholder={t("standardRegisterIdPlaceholder")}
            data-testid="standard-avatar-id-input"
            maxLength={255}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
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
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !avatarId.trim()}
        data-testid="standard-avatar-register-submit"
        style={{
          ...submitBtn,
          opacity: submitting || !avatarId.trim() ? 0.5 : 1,
          cursor: submitting || !avatarId.trim() ? "not-allowed" : "pointer",
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

const guideStyle: CSSProperties = {
  margin: "14px 0 0",
  padding: "12px 14px 12px 30px",
  borderRadius: 12,
  background: "var(--bg-subtle)",
  border: "1px solid var(--line)",
  fontSize: 12.5,
  lineHeight: 1.7,
  color: "var(--text-muted)",
};

const fieldsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginTop: 16,
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
  padding: "9px 11px",
  fontSize: 13,
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontFamily: "inherit",
  outline: "none",
};

const submitBtn: CSSProperties = {
  marginTop: 16,
  padding: "11px 20px",
  fontSize: 14,
  fontWeight: 700,
  borderRadius: 12,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  fontFamily: "inherit",
};
