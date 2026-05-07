# MERGE_NOTES — feat/features-page (2026-05-07)

> 워크트리: **feat/features-page**
> 담당 화면: 공개 기능 페이지 (`/features`) — 기존엔 Header 에 link 만 있고
> 페이지 미존재(404) 였습니다.
> 백엔드 의존성: 없음 (정적 마케팅 페이지).

---

## 1. 추가된 파일

### 페이지 (App Router)
- `frontend/src/app/features/page.tsx` — 정적 라우트 + SEO metadata. 본체는 client component 로 위임.

### 컴포넌트 (`frontend/src/components/features/`)
- `FeaturesContent.tsx` — 7-section 페이지 본체 (hero / morph / modules / cards / progress / iso / cta).
- `FeatureCard.tsx` — 9-up capability 카드 (5종 accent gradient).
- `featureCards.ts` — README §주요 기능 9개의 정적 메타 (icon path + accent + i18n key).
- `MorphIcon.tsx` — §3.1 PPT ↔ 영상 모핑 (3s 루프 cross-fade).
- `ModuleQuad.tsx` — §3.2 4-quadrant 호버 분해 (콘텐츠/평가/분석/운영).
- `ProgressShimmer.tsx` — §3.3 6-step 학습세션 진도 바 + 100% ✓ drawing.
- `IsoGrid.tsx` — §3.4 isometric 그리드 + 스크롤 1/8 패럴랙스.
- `GradientDefs.tsx` — page-scoped SVG `<defs>` (`fhub-grad-electric/violet/cyan/pink`).
- `featuresStyles.tsx` — page-scoped `<style precedence="features-hub">` 으로 keyframe 일괄 주입 (globals.css 미수정).
- `useFeaturesHubI18n.ts` — i18n 어댑터 (§2 참조).

### i18n 패치
- `frontend/messages/_patches/featuresHub.ko.json`
- `frontend/messages/_patches/featuresHub.en.json`

### 테스트 (vitest, 26 케이스)
- `frontend/__tests__/features/FeaturesPage.test.tsx` (12) — 7-section 합성 / 9 cards / hero CTA / morph alt / module quad / progress 0%→100% / replay / reduced-motion.
- `frontend/__tests__/features/featureCards.test.ts` (11) — 9 카드 메타 검증 + ko/en 키 트리 동치 + namespace 충돌 없음.
- `frontend/__tests__/features/useFeaturesHubI18n.test.tsx` (3) — locale 전환·누락 키 fall-through·`{value}` 보간.

총 **26 케이스 / 1.7s** PASS, `next build` 성공, ESLint 0 error.

---

## 2. i18n 통합 — **필수 후속 작업**

본 워크트리는 작업 제약상 `frontend/src/contexts/I18nContext.tsx` 를 수정하지
않았습니다. 따라서 새 namespace patch (`_patches/featuresHub.{ko,en}.json`)
는 `useDemoI18n` / `useMarketingI18n` / `useInboxI18n` / `useLearnersI18n` 와
동일한 자체 어댑터(`useFeaturesHubI18n.ts`) 로 로딩됩니다.

### 머지 시 권장 후속

`I18nContext.tsx` 의 patch 목록에 두 줄 추가:

```ts
import featuresKo from "../../messages/_patches/featuresHub.ko.json";
import featuresEn from "../../messages/_patches/featuresHub.en.json";
// ...
const koPatches: Messages[] = [
  studentKo as Messages,
  demoKo as Messages,
  professorKo as Messages,
  marketingKo as Messages,
  featuresKo as Messages,    // ← 추가
];
const enPatches: Messages[] = [
  studentEn as Messages,
  demoEn as Messages,
  professorEn as Messages,
  marketingEn as Messages,
  featuresEn as Messages,    // ← 추가
];
```

`featuresHub` 최상위 namespace 는 ko.json/en.json/다른 패치 어디에서도
사용되지 않으므로 충돌 없음 (테스트로 검증됨). 추가 후 `useFeaturesHubI18n`
어댑터는 `useProfessorI18n` 처럼 자동 prefix 만 처리하는 thin wrapper 로
단순화 가능합니다.

> **메모**: namespace 이름은 `features` 가 아니라 `featuresHub` 입니다.
> 이미 `marketing.useCases.cards.*.features` 와 같은 nested 키가 존재해서
> 혼동을 피하려고 의도적으로 구분했습니다.

---

## 3. 4가지 동적 요소 — animations.md §3 적합성

| § | 항목 | 구현 위치 | 핵심 |
|:---:|---|---|---|
| 3.1 | Video-input-icon 모핑 (PPT → 영상, 3s 루프) | `MorphIcon.tsx` + `featuresStyles.tsx` `fhub-morph-fade*` | CSS `d:` keyframe 의 호환성 이슈를 피해 두 stage 를 opacity cross-fade 로 모핑. 화살표는 별도 펄스. |
| 3.2 | Module-icon 4개 호버 분해 재조립 | `ModuleQuad.tsx` + `fhub-module-part--{tl,tr,bl,br}` | `transition: transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1)`. `:hover` + `:focus-within` 둘 다 트리거 (키보드 접근). |
| 3.3 | Progress shimmer + 100% 도달 시 ✓ 그리기 | `ProgressShimmer.tsx` + `fhub-shimmer` / `fhub-check` | `IntersectionObserver` 로 자동 시작, 6초간 0→100% 단조증가. 100% 시 stroke-dasharray drawing 으로 ✓. 키보드용 "다시 재생" 버튼. |
| 3.4 | Isometric 그리드 패럴랙스 (스크롤 1/8) | `IsoGrid.tsx` + `fhub-iso` | scroll listener `requestAnimationFrame` throttle, GPU 가속 `translate3d`. 카드 중심 기준 (페이지 절대값 누적 회피). |

### prefers-reduced-motion 일관 처리

`featuresStyles.tsx` 의 마지막 `@media (prefers-reduced-motion: reduce)`
블록이 본 페이지의 4가지 애니메이션을 모두 무력화 + 정적 fallback 모습
유지를 보장합니다:

| 요소 | 정적 모습 |
|---|---|
| MorphIcon | 영상 stage 만 노출 (PPT stage opacity 0) |
| ModuleQuad | 4 part 가 모인 상태 그대로, 호버에도 이동 없음 |
| ProgressShimmer | 진입 즉시 100% + ✓ 완료 (RAF/setTimeout 미실행) |
| IsoGrid | parallax transform 미적용 |

ProgressShimmer 는 추가로 `useSyncExternalStore` 로 matchMedia 를 구독해
런타임 토글에도 즉시 반응합니다 (effect 안 sync-setState 회피, lint 통과).

---

## 4. 디자인 시스템 적합성

| 항목 | 결정 |
|---|---|
| 베이스 모드 | 다크 (`bg-[#0A0A0A]`) — `MarketingShell` 그대로 사용 (`colors.md §1`) |
| 시그니처 컬러 | 골드 (`amber-400` CTA 채움 + `amber-300` 호버) |
| 그라데이션 메쉬 | 4종 (`grad-electric/violet/cyan/pink`) — `colors.md §4`, `icons.md §3` |
| 의미적 컬러 | emerald (✓ 완료 체크) 만 — 데이터 시각화 한정 |
| 폰트 | Pretendard (전역) + tabular-nums 숫자 (`typography.md §1`) |
| 마스코트 | 사용 안 함 (공개 마케팅 영역) |
| 모션 | 200~400ms 부드러움 + `motion-reduce:transition-none` (`animations.md §1.2`) |
| 그림자 | 카드 hover 시 `bg-white/[0.04]` 글로우 — 다크 모드 전용 패턴 (`colors.md §7`) |

### 골드 사용 카운트 (페이지당 5곳 이내 — `colors.md §3`)
1. Hero CTA (`bg-amber-400`)
2. 섹션 eyebrow 라벨 (`text-amber-400/80`)
3. ModuleQuad — content quadrant accent
4. ProgressShimmer — 진행 바 (shimmer + 단계 마커)
5. 최종 CTA 카드 외곽선 (`border-amber-400/30`)

랜딩 페이지의 톤과 일관 (다크 + 골드).

---

## 5. README §주요 기능 ↔ 9 카드 매핑

본 페이지는 README 의 §주요 기능 표 9개 항목을 **source-of-truth** 로 둡니다.
카드 순서·문구는 README 와 1:1 (자동 회귀 검증: `featureCards.test.ts`).

| # | README | 카드 key | accent |
|:---:|---|---|---|
| 1 | PPT → 영상 파이프라인 | `pipeline` | electric |
| 2 | 평가 시스템 | `assess` | violet |
| 3 | 학습 세션 | `session` | cyan |
| 4 | 집중도 모니터링 | `attention` | pink |
| 5 | RAG Q&A | `rag` | electric |
| 6 | 구독/결제 | `billing` | success |
| 7 | 번역 | `translate` | cyan |
| 8 | 다국어 UI | `i18n` | violet |
| 9 | 교수자 대시보드 | `dashboard` | pink |

3×3 grid 로 데스크톱 노출, 모바일에서는 1열 stack.

---

## 6. 페이지 구조

```
[MarketingShell]
├─ aurora 배경 (radial gradient, 60s aurora-shift)
├─ 14h 헤더 (CA 로고 + 언어 셀렉트 + "베타 신청" topCta)
├─ <main>
│   ├─ §1. Hero               — eyebrow / title / subtitle / 2 CTA
│   ├─ §2. Pipeline morph     — MorphIcon + 4단계 텍스트 ol
│   ├─ §3. Modules quad       — ModuleQuad + 설명 (lg-order 교차)
│   ├─ §4. 9-card grid        — README 표 9개 카드 (3×3)
│   ├─ §5. Progress demo      — ProgressShimmer + 설명
│   ├─ §6. Iso grid analytics — IsoGrid (스크롤 패럴랙스)
│   └─ §7. CTA card           — 베타 / 데모 / 기관 문의 3-up
└─ 푸터 (use-cases / trust / security / beta / contact / privacy / terms)
```

---

## 7. 알려진 한계 / 후속 작업

1. **Header 메뉴에 `/features` 노출** — 본 PR 은 페이지 자체만 만든다는 작업
   범위에 따라 Header.tsx 미수정. 통합 PR 에서 `t("nav.features")` 와 함께
   `/features` 링크 추가 필요. 아무도 클릭하지 않아도 페이지 자체는 SEO·SNS
   카드 (`OpenGraph`) 로 살아있음.

2. **Studio·Dashboard 직접 스크린샷 미포함** — Iso grid 는 *데이터의 isometric
   추상화*. 실제 대시보드 미니뷰가 필요하면 R3 에서 `<DashboardMini>` 컴포넌트
   를 IsoGrid 좌측에 합성하는 후속 PR.

3. **언어 추가 (Phase 5 글로벌)** — `featuresHub.{zh,ja,...}.json` 패치 추가
   + `useFeaturesHubI18n` 의 `messages` 사전에 enum 한 줄 추가하면 자동
   적용. Locale 전환은 I18nContext 가 처리.

4. **Module quad 모바일 hover 불가** — 데스크톱 hover/focus 외에 모바일에선
   분해 효과를 볼 수 없음. R3 에서 IntersectionObserver 진입 시 1회 자동
   분해 → 재조립 시퀀스 추가 검토.

---

## 8. 사이드 이펙트 — `MainChart.tsx` 타입 좁힘 회귀 수정

본 워크트리 작업 중 sibling 워크트리가
`frontend/src/components/professor/dashboardHome/MainChart.tsx` 를 추가했고,
그 파일에 TS 5 의 closure-CFA narrowing 회귀가 있어 `next build` 의 TypeScript
체크가 실패했습니다 (`Property 'toFixed' does not exist on type 'never'`).

본 PR 은 `MainChart.tsx` 의 **fillD 빌드 로직만** 다음과 같이 surgical 하게 수정:

```diff
-    let startX: number | null = null;
-    let endX:   number | null = null;
+    const xCoords: number[] = [];
     points.forEach((p, i) => {
       ...
-      if (startX === null) startX = x;
-      endX = x;
+      xCoords.push(x);
     });
-    if (startX !== null && endX !== null) {
-      const baseline = PAD_Y + innerH;
-      fillParts.push(`L ${endX.toFixed(1)} ${baseline}`);
-      fillParts.push(`L ${startX.toFixed(1)} ${baseline}`);
+    if (xCoords.length > 0) {
+      const startX = xCoords[0];
+      const endX = xCoords[xCoords.length - 1];
+      const baseline = PAD_Y + innerH;
+      fillParts.push(`L ${endX.toFixed(1)} ${baseline}`);
+      fillParts.push(`L ${startX.toFixed(1)} ${baseline}`);
     }
```

기능 동치 (fillD path 결과 동일), TS narrowing 이슈 제거. **`dashboardHome` 워크트리
머지 시 충돌 가능성 있음** — 본 PR 머지 우선 시 dashboardHome 측에서 위 변경을
유지하거나 양쪽 동일 형태로 정렬 필요.

---

## 9. 충돌 가능성 (다른 워크트리)

- ✅ `messages/ko.json` / `en.json`: 미수정.
- ✅ `_patches/professor.{ko,en}.json`: 미수정.
- ✅ `Header.tsx`, `I18nContext.tsx`, `AuthContext.tsx`: 미수정.
- ✅ `globals.css`: 미수정 (모든 keyframe 은 page-scoped `<style>` 에 격리).
- ✅ 백엔드 일체: 미수정.
- ⚠️ `MainChart.tsx`: §8 의 surgical 수정.
- ⚠️ Header nav 추가는 별도 통합 PR.

---

## 10. 검증 결과

```
$ vitest run __tests__/features/
 Test Files  3 passed (3)
      Tests  26 passed (26)

$ NEXT_PUBLIC_API_URL=http://localhost:8000 next build
✓ Compiled successfully in 4.9s
✓ /features  (Static, prerendered)

$ eslint src/app/features/** src/components/features/** __tests__/features/**
(0 errors, 0 warnings)
```

전체 vitest 회귀 (`vitest run`) 는 81 passed / 1 failed 입니다. failed 1건은
sibling 워크트리의 `__tests__/professor/dashboard.test.tsx` 에서
`aggregate.ts:150` (`q.logs` undefined) unhandled rejection — 본 PR 무관.
