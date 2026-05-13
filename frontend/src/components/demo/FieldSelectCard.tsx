"use client";

import { type ReactNode } from "react";
import { type DemoField } from "./demoTypes";
import { useDemoI18n } from "./useDemoI18n";

interface Props {
  field: DemoField;
  onSelect: (field: DemoField) => void;
}

/**
 * 분야 선택 카드 (인문계열 / 자연계열) v3 — 라이트 베이지 표면.
 *
 * 디자인 근거: docs/prototypes/04-demo-page.html.html (standalone, 2026-05-13)
 *   - 라이트 카드 (`#FFFFFF`) on 라이트 베이지 (`#FAFAF7`)
 *   - 코너 그라데이션 mesh: social = violet/cyan, science = gold/pink
 *   - 64px 라운드 아이콘 박스, A·Liberal Arts / B·Natural Science 태그
 *   - hover: -4px translateY + gold-medium 외곽선 + field-go 골드 채움
 *
 * 이전 v2 카드(다크 톤)는 폐기. 숫자(분·슬라이드 수)에는 `.num` 클래스(tabular-nums)
 * 를 입히기 위해 `{placeholder}` 자리에서 분할 후 `<span>` 으로 감싼다 — 다른
 * 페이지에서도 같은 패턴을 쓰면 헬퍼로 승격할 수 있다.
 */
export default function FieldSelectCard({ field, onSelect }: Props) {
  const { t } = useDemoI18n();

  const meta =
    field === "social"
      ? {
          taglineKey: "fieldSelectV3.social.tagline",
          metaLineKey: "fieldSelectV3.social.metaLine",
          minutesKey: "fieldSelectV3.social.minutes",
          titleKey: "fieldSelectV3.social.title",
          subtitleKey: "fieldSelectV3.social.subtitle",
          statSlidesKey: "fieldSelectV3.social.statSlides",
          statSlidesCountKey: "fieldSelectV3.social.statSlidesCount",
          statSecondaryKey: "fieldSelectV3.social.statSecondary",
          startKey: "fieldSelectV3.social.start",
          a11yKey: "a11y.fieldCardSocial",
          dataField: "social",
          glyph: <GlobeGlyph />,
        }
      : {
          taglineKey: "fieldSelectV3.natural.tagline",
          metaLineKey: "fieldSelectV3.natural.metaLine",
          minutesKey: "fieldSelectV3.natural.minutes",
          titleKey: "fieldSelectV3.natural.title",
          subtitleKey: "fieldSelectV3.natural.subtitle",
          statSlidesKey: "fieldSelectV3.natural.statSlides",
          statSlidesCountKey: "fieldSelectV3.natural.statSlidesCount",
          statSecondaryKey: "fieldSelectV3.natural.statSecondary",
          startKey: "fieldSelectV3.natural.start",
          a11yKey: "a11y.fieldCardNatural",
          dataField: "natural",
          glyph: <AtomGlyph />,
        };

  return (
    <button
      type="button"
      onClick={() => onSelect(field)}
      aria-label={t(meta.a11yKey)}
      data-testid={`demo-field-${field}`}
      data-field={meta.dataField}
      className="ca-field-card"
    >
      <span className="ca-field-card-bg" aria-hidden="true" />

      <div className="ca-field-card-top">
        <div className="ca-field-icon" aria-hidden="true">
          {meta.glyph}
        </div>
        <span className="ca-field-tag">{t(meta.taglineKey)}</span>
      </div>

      <div>
        <p className="ca-field-meta-line">
          {renderWithSpan(t(meta.metaLineKey), "{minutes}", t(meta.minutesKey), "num")}
        </p>
        <h3 className="ca-field-name">{t(meta.titleKey)}</h3>
        <p className="ca-field-desc">{t(meta.subtitleKey)}</p>
      </div>

      <div className="ca-field-card-bottom">
        <div className="ca-field-stats">
          <span>
            {renderWithSpan(
              t(meta.statSlidesKey),
              "{count}",
              t(meta.statSlidesCountKey),
              "ca-field-stat-num num",
            )}
          </span>
          <span>{t(meta.statSecondaryKey)}</span>
        </div>
        <span className="ca-field-go">
          {t(meta.startKey)}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </button>
  );
}

/**
 * 템플릿 문자열의 `placeholder` 위치를 `<span className={spanClass}>{value}</span>`
 * 으로 치환해 JSX 노드로 반환. placeholder 가 없으면 원문을 그대로 돌려준다.
 *
 * `t()` 가 `{key}` placeholder 를 보존하도록 params 없이 호출한 결과를 받는다
 * (I18nContext §211: params 미지정 시 placeholder 그대로 반환).
 */
function renderWithSpan(
  template: string,
  placeholder: string,
  value: string,
  spanClass: string,
): ReactNode {
  const parts = template.split(placeholder);
  if (parts.length !== 2) return template;
  return (
    <>
      {parts[0]}
      <span className={spanClass}>{value}</span>
      {parts[1]}
    </>
  );
}

/** 인문계열 글리프 — 위도/경도 globe (grad-globe). */
function GlobeGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="url(#ca-grad-globe)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18" />
      <path d="M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

/** 자연계열 글리프 — 원자 (grad-atom). */
function AtomGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="url(#ca-grad-atom)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="2" />
      <ellipse cx="12" cy="12" rx="10" ry="4" />
      <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-60 12 12)" />
    </svg>
  );
}
