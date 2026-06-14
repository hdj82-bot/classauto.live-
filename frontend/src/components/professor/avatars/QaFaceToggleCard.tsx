"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useToast } from "@/components/ui/Toast";
import {
  getQaUseOwnFace,
  setQaUseOwnFace,
} from "@/components/professor/avatars/avatarsApi";

interface QaFaceToggleCardProps {
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * Q&A 답변 얼굴 옵트인 스위치 — "Q&A 답변에 내 얼굴 사용".
 *
 * 기본은 OFF(표준 아바타). HeyGen "사진 아바타 3개 한도"는 계정 단위라 모든
 * 교수자에게 본인 얼굴을 줄 수 없어, 표준 아바타를 기본으로 두고 본인 얼굴은
 * 명시적으로 켜는 옵션으로 둔다(사용자 수와 무관하게 Q&A 가 막히지 않음). 켜도
 * 슬롯이 차 있으면 백엔드가 표준으로 폴백한다.
 *
 * 자체적으로 GET 으로 현재 값을 로드하고 PATCH 로 저장한다(페이지 상태와 분리).
 */
export default function QaFaceToggleCard({ t }: QaFaceToggleCardProps) {
  const { toast } = useToast();
  const [on, setOn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    getQaUseOwnFace()
      .then((v) => {
        if (alive) setOn(v);
      })
      .catch(() => {
        /* 조회 실패는 OFF 기본 유지 — 토글로 다시 시도 가능 */
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleToggle = useCallback(async () => {
    if (saving) return;
    const next = !on;
    setOn(next); // 낙관적 반영
    setSaving(true);
    try {
      const saved = await setQaUseOwnFace(next);
      setOn(saved);
      toast(t(saved ? "qaFaceOnToast" : "qaFaceOffToast"), "success");
    } catch {
      setOn(!next); // 롤백
      toast(t("qaFaceError"), "error");
    } finally {
      setSaving(false);
    }
  }, [on, saving, toast, t]);

  return (
    <div style={wrapStyle}>
      <span style={eyebrowStyle}>{t("qaFaceTitle")}</span>
      <div style={rowStyle}>
        <div style={textColStyle}>
          <span style={labelStyle}>{t("qaFaceLabel")}</span>
          <span style={descStyle}>{t("qaFaceDesc")}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t("qaFaceLabel")}
          data-testid="qa-face-toggle"
          disabled={!loaded || saving}
          onClick={handleToggle}
          style={switchStyle(on, !loaded || saving)}
        >
          <span style={knobStyle(on)} />
        </button>
      </div>
      <p style={hintStyle}>{t("qaFaceHint")}</p>
    </div>
  );
}

const wrapStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  borderRadius: 16,
  padding: 18,
  boxShadow: "var(--shadow-sm)",
};

const eyebrowStyle: CSSProperties = {
  display: "block",
  marginBottom: 12,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-faint)",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
};

const textColStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  minWidth: 0,
};

const labelStyle: CSSProperties = {
  fontSize: 14.5,
  fontWeight: 700,
  color: "var(--text)",
};

const descStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--text-muted)",
};

function switchStyle(on: boolean, disabled: boolean): CSSProperties {
  return {
    flexShrink: 0,
    width: 48,
    height: 28,
    borderRadius: 999,
    border: "none",
    cursor: disabled ? "default" : "pointer",
    padding: 3,
    background: on ? "var(--gold)" : "var(--line)",
    opacity: disabled ? 0.6 : 1,
    transition: "background 160ms var(--ease-out)",
  };
}

function knobStyle(on: boolean): CSSProperties {
  return {
    display: "block",
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "#fff",
    boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
    transform: on ? "translateX(20px)" : "translateX(0)",
    transition: "transform 160ms var(--ease-spring)",
  };
}

const hintStyle: CSSProperties = {
  margin: "12px 0 0",
  fontSize: 11.5,
  lineHeight: 1.55,
  color: "var(--text-faint)",
};
