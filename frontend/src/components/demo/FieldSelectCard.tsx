"use client";

import { type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { type DemoField } from "./demoTypes";
import { useDemoI18n } from "./useDemoI18n";

/**
 * 카드 텍스트를 i18n mock 대신 실제 값으로 덮어쓰는 옵션. 대문(/)에서 좌측
 * 인문계열 카드를 교수자가 실제 제작한 공개 강의로 교체할 때 쓴다(클릭 라우팅은
 * 호출자 onSelect 가 처리). /demo 등 override 미지정 시 기존 mock 그대로.
 */
export interface FieldCardOverride {
  tagline?: string;
  metaLine?: string;
  title?: string;
  subtitle?: string;
  statSlides?: string;
  statSecondary?: string;
  /** 카드 아이콘 교체(미지정 시 분야 기본 글리프). 예: 실제 강의 카드 = 책. */
  glyph?: ReactNode;
}

interface Props {
  field: DemoField;
  onSelect: (field: DemoField) => void;
  override?: FieldCardOverride;
  /**
   * 클릭 시 직행할 강의 경로. 지정하면 `onSelect(field)` 분야 라우팅을 무시하고
   * 이 href 로 곧장 이동한다(대문 하단에 분야 로직과 무관한 실제 강의 카드를
   * 추가할 때 사용). 미지정 시 기존처럼 onSelect 가 라우팅한다.
   */
  href?: string;
  /**
   * data-testid 오버라이드. 같은 분야(field) 카드가 한 페이지에 둘 이상 존재할 때
   * `demo-field-{field}` testid 충돌을 피하기 위해 고유 값을 부여한다.
   */
  testId?: string;
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
export default function FieldSelectCard({
  field,
  onSelect,
  override,
  href,
  testId,
}: Props) {
  const { t } = useDemoI18n();
  const router = useRouter();

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
      onClick={() => (href ? router.push(href) : onSelect(field))}
      aria-label={t(meta.a11yKey)}
      data-testid={testId ?? `demo-field-${field}`}
      data-field={meta.dataField}
      className="ca-field-card"
    >
      <span className="ca-field-card-bg" aria-hidden="true" />

      <div className="ca-field-card-top">
        <div className="ca-field-icon" aria-hidden="true">
          {override?.glyph ?? meta.glyph}
        </div>
        <span className="ca-field-tag">
          {override?.tagline ?? t(meta.taglineKey)}
        </span>
      </div>

      <div>
        <p className="ca-field-meta-line">
          {override?.metaLine ??
            renderWithSpan(t(meta.metaLineKey), "{minutes}", t(meta.minutesKey), "num")}
        </p>
        <h3 className="ca-field-name">{override?.title ?? t(meta.titleKey)}</h3>
        <p className="ca-field-desc">{override?.subtitle ?? t(meta.subtitleKey)}</p>
      </div>

      <div className="ca-field-card-bottom">
        <div className="ca-field-stats">
          <span>
            {override?.statSlides ??
              renderWithSpan(
                t(meta.statSlidesKey),
                "{count}",
                t(meta.statSlidesCountKey),
                "ca-field-stat-num num",
              )}
          </span>
          <span>{override?.statSecondary ?? t(meta.statSecondaryKey)}</span>
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

/** 책 글리프 — 펼친 책(grad-globe 그라데이션 재사용). 실제 강의 카드용. */
export function BookGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="url(#ca-grad-globe)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 6.5C10.4 5.1 7.6 4.6 4 5.2v12.6c3.6-.6 6.4-.1 8 1.3" />
      <path d="M12 6.5c1.6-1.4 4.4-1.9 8-1.3v12.6c-3.6-.6-6.4-.1-8 1.3" />
      <path d="M12 6.5v12.9" />
    </svg>
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
