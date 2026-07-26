"use client";

import { useState } from "react";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import FeedbackDialog from "./FeedbackDialog";

/**
 * 인앱 피드백 진입점 — **레이아웃 흐름 안에** 놓는 트리거.
 *
 * `position: fixed` 를 쓰지 않는다. 종전 우하단 고정 버튼이 스튜디오 하단 ActionBar
 * CTA 를 덮어 2026-06-27 에 철회됐고(#575), 그 뒤 한 달간 제보가 0건이었다. 겹침의
 * 원인은 버튼의 존재가 아니라 고정 위치였으므로, 원인만 제거하고 진입점은 살린다.
 *
 * 배치(결정 2026-07-27):
 *   - 교수자 일반 화면 → 사이드바 **하단 슬롯**(내비게이션이 아니라 유틸리티라
 *     8개 메뉴에 9번째로 끼우지 않고 구분선 아래에 둔다)
 *   - 교수자 스튜디오 → 사이드바가 숨는 몰입 화면이라 **ActionBar 좌측 슬롯**
 *   - 학생 → **시청 중에는 띄우지 않는다.** 집중도 모니터링이 있는 서비스에서
 *     화면에 뜬 버튼은 방해이고 플레이어 컨트롤과 겹칠 위험도 있다. 시청을
 *     방해하지 않는 자리(내 강의·강좌 홈)에만 둔다.
 *
 * 비로그인에는 렌더하지 않는다 — 백엔드가 `get_current_user` 로 401 이다.
 */
export type FeedbackLauncherVariant = "sidebar" | "bar" | "card";

export default function FeedbackLauncher({
  variant = "card",
}: {
  variant?: FeedbackLauncherVariant;
}) {
  const auth = useOptionalAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  if (!auth?.user) return null;

  const label = t("feedback.buttonLabel");

  return (
    <>
      {variant === "card" ? (
        // 학생 화면 — 목록 아래 조용한 카드. 시청을 방해하지 않는 자리에만 놓는다.
        <div
          className="rounded-2xl border border-line bg-bg-card p-4 text-center"
          data-testid="feedback-launcher-card"
        >
          <p className="text-xs text-text-muted">{t("feedback.studentPrompt")}</p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            data-testid="feedback-launcher"
            className="mt-2 rounded-lg border border-line-strong bg-bg-card px-4 py-2 text-xs font-semibold text-text-muted transition hover:bg-bg-hover"
          >
            {label}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="feedback-launcher"
          aria-label={label}
          style={variant === "sidebar" ? sidebarTrigger : barTrigger}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.color = "var(--text)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background =
              variant === "sidebar" ? "transparent" : "var(--bg-card)";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          <MessageIcon />
          <span className="truncate">{label}</span>
        </button>
      )}

      {open && <FeedbackDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function MessageIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

/**
 * 사이드바 하단 슬롯. 내비게이션 항목과 같은 크기·간격이되 활성 상태(골드)를
 * 쓰지 않는다 — 페이지가 아니라 동작이라 "현재 위치"라는 개념이 없다.
 */
const sidebarTrigger = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "8px 12px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  color: "var(--text-muted)",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
  transition: "all 140ms var(--ease-out)",
} as const;

/** ActionBar 좌측 슬롯 — 같은 바의 ghost 버튼과 시각 언어를 맞춘다. */
const barTrigger = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "9px 16px",
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
  color: "var(--text-muted)",
  fontFamily: "inherit",
  transition: "all 140ms var(--ease-out)",
} as const;
