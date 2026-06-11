"use client";

import { useEffect, useRef, useState } from "react";
import { useProfileHubI18n } from "@/components/student/profile/useProfileHubI18n";
import { useA11y, type FontSize } from "./A11yContext";
import KeyboardShortcutsModal from "./KeyboardShortcutsModal";
import { useVideoShortcuts } from "./useVideoShortcuts";

/**
 * 접근성 floating panel.
 *
 * - 좌측 하단의 작은 버튼 → 클릭 시 본 패널이 슬라이드인.
 * - `A11yProvider` 는 lecture 페이지에서 PlayerV2 와 **함께** 감싼다(상위 mount).
 *   예전엔 본 컴포넌트가 자체 provider 를 들어 토글이 영상에 닿지 않았다 —
 *   이제 상위 단일 provider 를 공유해 패널 토글이 곧 영상 설정이 된다.
 * - 패널 박스 밖을 클릭하면 자동으로 닫힌다(아래 useEffect).
 * - lecture 페이지 video element 단축키도 본 panel 이 마운트되면 활성화된다.
 *
 * 학생 데이터 보호 정책:
 * - 모든 토글은 sessionStorage 에만 보존 (localStorage 사용 금지). 새 탭/창
 *   에서는 다시 기본값으로 시작 → 영구 트래킹 가능성 차단.
 * - 외부 공유·광고 슬롯 0.
 */
export default function AccessibilityPanel() {
  const { t } = useProfileHubI18n();
  const a11y = useA11y();
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  // 패널 박스(및 여는 버튼) 밖을 클릭하면 닫는다. pointerdown 으로 듣되
  // 패널·여는 버튼 내부 클릭은 무시 — 여는 버튼은 자체 토글을 유지한다.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (openerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // 단축키는 본 panel 이 마운트된 시점부터 활성화. 패널이 열려있는 동안에만
  // 활성화하면 학생이 패널을 닫고 영상으로 돌아갔을 때 단축키가 안 먹는
  // 직관-위배 동작이 되므로, 항상 켜둔다 (입력 필드 포커스 시 useVideoShortcuts
  // 가 자동으로 무시).
  useVideoShortcuts({
    enabled: true,
    onShowHelp: () => setHelpOpen(true),
  });

  return (
    <>
      {/* Floating opener — 페이드아웃 안 함 (학생이 항상 접근 가능해야 함) */}
      <button
        ref={openerRef}
        type="button"
        data-testid="a11y-open-button"
        aria-expanded={open}
        aria-controls="a11y-panel"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          open
            ? t("accessibilityHub.panel.closeLabel")
            : t("accessibilityHub.panel.openLabel")
        }
        className="fixed bottom-4 left-4 z-40 inline-flex items-center justify-center w-11 h-11 rounded-full bg-[#1A1A1A] border border-white/15 text-white/80 hover:text-white hover:border-white/30 shadow-lg transition motion-reduce:transition-none"
      >
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="4" r="2" strokeWidth="1.5" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M5 9h14M9 9v12M15 9v12M9 14h6"
          />
        </svg>
      </button>

      {open && (
        <aside
          ref={panelRef}
          id="a11y-panel"
          data-testid="a11y-panel"
          role="region"
          aria-label={t("accessibilityHub.panel.title")}
          className={`fixed bottom-20 left-4 z-40 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#141414] p-5 text-white shadow-2xl ${
            a11y.effectiveReduceMotion ? "" : "animate-[fadeIn_0.2s_ease-out]"
          }`}
        >
          <header className="mb-4">
            <h2 className="text-sm font-semibold">
              {t("accessibilityHub.panel.title")}
            </h2>
            <p className="text-[11px] text-white/45 mt-1 leading-relaxed">
              {t("accessibilityHub.panel.subtitle")}
            </p>
          </header>

          {/* 자막 토글 */}
          <ToggleRow
            id="a11y-captions"
            label={t("accessibilityHub.panel.captionsLabel")}
            hint={t("accessibilityHub.panel.captionsHint")}
            checked={a11y.captions}
            onChange={a11y.setCaptions}
          />

          {/* 글씨 크기 */}
          <fieldset className="mt-5">
            <legend className="text-xs font-medium text-white/80 mb-2">
              {t("accessibilityHub.panel.fontSizeLabel")}
            </legend>
            <div
              role="radiogroup"
              aria-label={t("accessibilityHub.panel.fontSizeLabel")}
              className="inline-flex rounded-lg border border-white/15 p-1 gap-1 bg-white/[0.02]"
            >
              {(
                [
                  ["normal", "fontSizeNormal"],
                  ["large", "fontSizeLarge"],
                  ["x-large", "fontSizeXLarge"],
                ] as Array<[FontSize, string]>
              ).map(([value, labelKey]) => {
                const active = a11y.fontSize === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    data-testid={`a11y-font-${value}`}
                    onClick={() => a11y.setFontSize(value)}
                    className={[
                      "px-2.5 py-1 text-[11px] font-medium rounded-md transition motion-reduce:transition-none",
                      active
                        ? "bg-amber-400 text-black"
                        : "text-white/60 hover:text-white",
                    ].join(" ")}
                  >
                    {t(`accessibilityHub.panel.${labelKey}`)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* 고대비 */}
          <ToggleRow
            id="a11y-high-contrast"
            label={t("accessibilityHub.panel.highContrastLabel")}
            hint={t("accessibilityHub.panel.highContrastHint")}
            checked={a11y.highContrast}
            onChange={a11y.setHighContrast}
            className="mt-5"
          />

          {/* 동작 줄이기 */}
          <ToggleRow
            id="a11y-reduce-motion"
            label={t("accessibilityHub.panel.reduceMotionLabel")}
            hint={t("accessibilityHub.panel.reduceMotionHint")}
            checked={a11y.reduceMotion}
            onChange={a11y.setReduceMotion}
            className="mt-5"
          />

          {/* 단축키 안내 */}
          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="text-xs text-white/80">
              {t("accessibilityHub.panel.shortcutsLabel")}
            </span>
            <button
              type="button"
              data-testid="a11y-shortcuts-open"
              onClick={() => setHelpOpen(true)}
              className="text-[11px] font-medium rounded-md border border-white/15 px-2.5 py-1 text-white hover:border-white/30 hover:bg-white/[0.04] transition"
            >
              {t("accessibilityHub.panel.shortcutsCta")}
            </button>
          </div>

          <p className="text-[10px] text-white/35 mt-5 leading-relaxed">
            {t("accessibilityHub.panel.footerNote")}
          </p>
        </aside>
      )}

      <KeyboardShortcutsModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}

interface ToggleRowProps {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  className?: string;
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
  className = "",
}: ToggleRowProps) {
  return (
    <label
      htmlFor={id}
      className={`flex items-start justify-between gap-3 cursor-pointer ${className}`}
    >
      <span className="min-w-0">
        <span className="block text-xs font-medium text-white/85">{label}</span>
        <span className="block text-[11px] text-white/45 mt-0.5 leading-relaxed">
          {hint}
        </span>
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        data-testid={id}
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        className="mt-1 w-9 h-5 appearance-none rounded-full bg-white/15 checked:bg-amber-400 transition relative motion-reduce:transition-none before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:w-4 before:h-4 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-4 motion-reduce:before:transition-none cursor-pointer"
      />
    </label>
  );
}
