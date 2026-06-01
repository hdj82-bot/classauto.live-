"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import {
  BACKGROUND_OPTIONS,
  EXPRESSION_OPTIONS,
  OUTFIT_OPTIONS,
  PERSONA_OPTIONS,
  defaultInputFor,
  type Option,
} from "./lookOptions";
import {
  LOOK_BATCH_DEFAULT,
  type BackgroundKey,
  type ExpressionKey,
  type LookGenerateInput,
  type OutfitKey,
  type PersonaKey,
} from "./photoAvatarTypes";

interface LookOptionFormProps {
  /** 구조화 옵션으로 룩 배치 생성을 시작한다. */
  onGenerate: (input: LookGenerateInput) => void;
  /** 생성 진행/한도 도달 등으로 막을 때 — 버튼 비활성. */
  disabled: boolean;
  /** 누적 상한 도달 — 생성 버튼 숨기고 소프트 안내(docs §0.5②). */
  capReached: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * v0.2 룩 생성 옵션 폼 — persona(필수)·outfit·background·expression 칩 선택.
 * persona 를 고르면 추천 조합(lookOptions.RECOMMENDED)으로 나머지를 채우고,
 * 사용자는 이후 칩으로 자유 변경한다. 출력은 계약 LookGenerateRequest 에
 * 대응하는 LookGenerateInput.
 *
 * 2026-06-01 정책 변경: "추가 요청(extra)" 필드는 첫 룩 생성에는 노출하지 않고,
 * 생성된 룩을 클릭해 열리는 16:9 상세 모달(LookDetailModal)에서만 활성화한다
 * (자신이 마음에 든 룩을 골라 표정·복장·색감 등 살짝 다듬을 때만 필요한 기능).
 */
export default function LookOptionForm({
  onGenerate,
  disabled,
  capReached,
  t,
}: LookOptionFormProps) {
  const [persona, setPersona] = useState<PersonaKey>("educator");
  const [outfit, setOutfit] = useState<OutfitKey | null>(
    defaultInputFor("educator").outfit ?? null,
  );
  const [background, setBackground] = useState<BackgroundKey | null>(
    defaultInputFor("educator").background ?? null,
  );
  const [expression, setExpression] = useState<ExpressionKey | null>(
    defaultInputFor("educator").expression ?? null,
  );

  // persona 변경 시 나머지를 그 추천 조합으로 재설정(빠른 시작 — 이후 자유 변경).
  const pickPersona = (key: PersonaKey) => {
    setPersona(key);
    const d = defaultInputFor(key);
    setOutfit(d.outfit ?? null);
    setBackground(d.background ?? null);
    setExpression(d.expression ?? null);
  };

  // v0.4 (2026-06-01): prop·pose 칩 행 제거 — 사용자 요청 "선택지 없이 자동으로
  // 각기 따로 적용". 백엔드가 N장에 대해 자세를 자동 분산한다(정자세·팔짱·제스처
  // 순환). prop/pose 는 모달의 미세 조정 경로(LookDetailModal)에서만 사용된다.
  const submit = () => {
    if (disabled || capReached) return;
    onGenerate({
      persona,
      outfit,
      background,
      expression,
      prop: null,
      pose: null,
      extra: null,
    });
  };

  return (
    <div data-testid="look-option-form">
      <FieldRow label={t("looks.options.personaLabel")}>
        <Chips
          options={PERSONA_OPTIONS}
          value={persona}
          onChange={(v) => pickPersona(v as PersonaKey)}
          required
        />
      </FieldRow>
      <FieldRow label={t("looks.options.outfitLabel")}>
        <Chips
          options={OUTFIT_OPTIONS}
          value={outfit}
          onChange={(v) => setOutfit(v as OutfitKey | null)}
          autoLabel={t("looks.options.auto")}
        />
      </FieldRow>
      <FieldRow label={t("looks.options.backgroundLabel")}>
        <Chips
          options={BACKGROUND_OPTIONS}
          value={background}
          onChange={(v) => setBackground(v as BackgroundKey | null)}
          autoLabel={t("looks.options.auto")}
        />
      </FieldRow>
      <FieldRow label={t("looks.options.expressionLabel")}>
        <Chips
          options={EXPRESSION_OPTIONS}
          value={expression}
          onChange={(v) => setExpression(v as ExpressionKey | null)}
          autoLabel={t("looks.options.auto")}
        />
      </FieldRow>

      {capReached ? (
        <p style={softNote} data-testid="look-cap-note" aria-live="polite">
          {t("looks.capReached")}
        </p>
      ) : (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button
            type="button"
            onClick={submit}
            disabled={disabled}
            data-testid="look-generate-btn"
            style={{
              ...primaryBtn,
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            {t("looks.generateCta", { count: LOOK_BATCH_DEFAULT })}
          </button>
        </div>
      )}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 12 }}>
      <span style={fieldLabel}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

/**
 * 옵션 칩 그룹. ``required`` 면 "자동" 없이 항상 1개 선택, 아니면 "자동"(null)을
 * 포함하고 같은 칩 재클릭 시 자동으로 해제된다.
 */
function Chips<K extends string>({
  options,
  value,
  onChange,
  required = false,
  autoLabel,
}: {
  options: Option<K>[];
  value: K | null;
  onChange: (value: K | null) => void;
  required?: boolean;
  autoLabel?: string;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} role="group">
      {!required && (
        <Chip active={value === null} onClick={() => onChange(null)}>
          {autoLabel ?? "자동"}
        </Chip>
      )}
      {options.map((o) => (
        <Chip
          key={o.key}
          active={value === o.key}
          onClick={() => onChange(required ? o.key : value === o.key ? null : o.key)}
        >
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        ...chipStyle,
        background: active ? "var(--gold)" : "var(--bg-card)",
        color: active ? "#0A0A0A" : "var(--text-muted)",
        borderColor: active ? "var(--gold)" : "var(--line-strong)",
        fontWeight: active ? 700 : 500,
      }}
    >
      {children}
    </button>
  );
}

const fieldLabel: CSSProperties = {
  flexShrink: 0,
  width: 52,
  paddingTop: 5,
  fontSize: 11.5,
  fontWeight: 700,
  color: "var(--text-muted)",
};

const chipStyle: CSSProperties = {
  padding: "4px 11px",
  fontSize: 11.5,
  borderRadius: 999,
  border: "1px solid",
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "background 120ms var(--ease-out), border-color 120ms var(--ease-out)",
};

const primaryBtn: CSSProperties = {
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 10,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  fontFamily: "inherit",
};

const softNote: CSSProperties = {
  margin: "14px 0 0",
  fontSize: 12,
  lineHeight: 1.55,
  color: "var(--text-muted)",
};
