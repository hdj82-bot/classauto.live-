"use client";

import type { CSSProperties } from "react";
import { ONBOARDING_STEPS, type OnboardingStep } from "./photoAvatarTypes";
import { CheckIcon } from "./PhotoAvatarIcons";

interface OnboardingStepperProps {
  current: OnboardingStep;
  /** 이미 완료해 되돌아갈 수 있는 단계들(클릭 시 이동). */
  reachable: (step: OnboardingStep) => boolean;
  onJump: (step: OnboardingStep) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * 진행 스테퍼 (v0.2 = train 제거 4단계, docs §0.3). 라이트 베이지 + 골드.
 *
 * - 완료 단계: 골드 채움 + 체크, 클릭해 되돌아갈 수 있음.
 * - 현재 단계: 골드 링 강조.
 * - 미도달 단계: 옅은 라인.
 * 색 + 모양(체크/숫자)으로 상태를 이중 표시(색맹 친화, icons.md §7.3).
 */
export default function OnboardingStepper({
  current,
  reachable,
  onJump,
  t,
}: OnboardingStepperProps) {
  const currentIndex = ONBOARDING_STEPS.indexOf(current);

  return (
    <ol
      data-testid="onboarding-stepper"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 0,
        listStyle: "none",
        margin: 0,
        padding: 0,
      }}
    >
      {ONBOARDING_STEPS.map((stepKey, i) => {
        const state: "done" | "current" | "upcoming" =
          i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
        const canJump = state === "done" && reachable(stepKey);
        const isLast = i === ONBOARDING_STEPS.length - 1;

        return (
          <li
            key={stepKey}
            style={{ flex: isLast ? "0 0 auto" : "1 1 0", minWidth: 0 }}
            aria-current={state === "current" ? "step" : undefined}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <button
                type="button"
                onClick={canJump ? () => onJump(stepKey) : undefined}
                disabled={!canJump}
                data-testid={`stepper-node-${stepKey}`}
                title={t(`step.${stepKey}.label`)}
                style={{
                  ...nodeStyle,
                  cursor: canJump ? "pointer" : "default",
                  background:
                    state === "done"
                      ? "var(--gold)"
                      : state === "current"
                        ? "var(--bg-card)"
                        : "var(--bg-subtle)",
                  borderColor:
                    state === "upcoming" ? "var(--line)" : "var(--gold)",
                  boxShadow:
                    state === "current" ? "0 0 0 4px var(--gold-soft)" : "none",
                  color:
                    state === "done"
                      ? "#0A0A0A"
                      : state === "current"
                        ? "var(--gold-on-light)"
                        : "var(--text-faint)",
                }}
              >
                {state === "done" ? (
                  <CheckIcon size={16} mono />
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{i + 1}</span>
                )}
              </button>

              {!isLast && (
                <span
                  aria-hidden="true"
                  style={{
                    flex: 1,
                    height: 2,
                    margin: "0 6px",
                    borderRadius: 2,
                    background:
                      i < currentIndex ? "var(--gold)" : "var(--line)",
                  }}
                />
              )}
            </div>

            <span
              style={{
                ...labelStyle,
                color:
                  state === "upcoming" ? "var(--text-faint)" : "var(--text)",
                fontWeight: state === "current" ? 700 : 500,
              }}
            >
              {t(`step.${stepKey}.label`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const nodeStyle: CSSProperties = {
  flexShrink: 0,
  width: 34,
  height: 34,
  borderRadius: "50%",
  border: "2px solid",
  display: "grid",
  placeItems: "center",
  fontFamily: "inherit",
  padding: 0,
  transition: "box-shadow 140ms var(--ease-out), background 140ms var(--ease-out)",
};

const labelStyle: CSSProperties = {
  display: "block",
  marginTop: 8,
  fontSize: 11.5,
  lineHeight: 1.3,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  paddingRight: 6,
};
