# MERGE_NOTES.LANDING — `/` 랜딩 동적 요소 6가지 개선

> **창**: R4W1 (창 1) · CLAUDE.md "3단계: 기존 페이지 동적 요소 개선"
> **브랜치**: `feat/landing-animations`
> **작업일**: 2026-05-07
> **연관 기획**: `docs/design-system/animations.md` §2 (6가지 효과 spec)

---

## 1. 요약

기존 `frontend/src/app/page.tsx` 의 본문 콘텐츠를 100% 보존하면서
docs/design-system/animations.md §2 의 6가지 동적 요소를 적용. 자연스러운
흐름을 위해 콘텐츠 사이에 신규 섹션 2개 (Stats Strip / Platform Visual /
Adoption Chart) 를 삽입.

기존 `landing.*` i18n 키와 page.tsx 의 `t()` 호출은 그대로 유지. 신규 키는
`landingHub.*` 네임스페이스에 격리해 충돌을 원천 회피.

---

## 2. 추가된 파일

### 신규 디렉토리

```
frontend/src/components/landing/
  IconDefs.tsx                  # 그라데이션 SVG defs 6종 (페이지당 1회)
  AuroraBackground.tsx          # §2.1 — 히어로 배경 메쉬 (60s aurora-shift)
  StatCounter.tsx               # §2.2 — 카운트업 (IntersectionObserver + easeOutCubic)
  GradientFeatureIcon.tsx       # §2.3 — 그라데이션 stroke + hover rotate-(-8deg)
  MeshNetworkVisual.tsx         # §2.5 — 6 노드 + float + pulse-flow
  MiniLineChart.tsx             # §2.4 — stroke-dasharray draw-line + 데이터 점 stagger
  FadeInSection.tsx             # §2.6 — IntersectionObserver fade-up wrapper
  useLandingI18n.ts             # i18n 어댑터 (자체 patch import)

frontend/messages/_patches/
  landingHub.ko.json
  landingHub.en.json

frontend/__tests__/landing/
  StatCounter.test.tsx          (4 cases)
  FadeInSection.test.tsx        (5 cases)
  GradientFeatureIcon.test.tsx  (5 cases)
  useLandingI18n.test.tsx       (5 cases)
  page.test.tsx                 (5 cases — 통합)
```

### 수정 파일

- `frontend/src/app/page.tsx` — 컴포넌트 6종 + IconDefs 접목. 기존 콘텐츠
  (Hero / Features 6 / Steps 3 / CTA / Footer) 텍스트 / 링크 / 구조 보존.

총 **신규 13 파일 + 수정 1 파일**.

---

## 3. 6가지 동적 요소 매핑

| animations.md § | 컴포넌트 | 적용 위치 |
|:---:|---|---|
| §2.1 그라데이션 메쉬 | `AuroraBackground` | Hero 섹션 배경 (absolute, -z-10) |
| §2.2 카운트업 | `StatCounter` | NEW Stats Strip (3 카운터: 교수자·강의·시간) |
| §2.3 카드 아이콘 그라데이션 stroke | `GradientFeatureIcon` | Features 카드 6개 (4 그라데이션 cycling) |
| §2.4 차트 동적화 | `MiniLineChart` | NEW Adoption 섹션 (8주차 추이 라인 2개) |
| §2.5 Mesh-network | `MeshNetworkVisual` | NEW Platform 섹션 (6 노드 + 8 라인) |
| §2.6 스크롤 fade-up | `FadeInSection` | 모든 섹션 wrap |

---

## 4. 디자인 시스템 / 정책 적합성

| 항목 | 결과 |
|---|---|
| 폰트 | Pretendard 본문 + Paperlogy 헤드라인 (typography.md §2). Geist/Mono 0건 |
| 컬러 | colors.md §4.1 의 4 그라데이션 (violet/electric/cyan/pink) 사용. 메인 사이트라 라이트 베이스 + indigo 본문 톤 그대로. |
| 의미적 컬러 | 학습자 영역 / 마케팅 페이지 사용 0 (랜딩이라 사용 영역 아님) |
| 마스코트 | 등장 0 (교수자/메인 사이트 영역) |
| localStorage | 사용 0 |
| `prefers-reduced-motion` | 모든 컴포넌트 자체 분기 (matchMedia + rAF fallback) + Tailwind motion-safe / motion-reduce 유틸리티 |
| 60fps | transform / opacity / filter 만 애니메이션. layout 변경 0. |
| 색맹 친화 | chart 의 두 라인이 색상 외에 라벨 + 점 모양으로 구분 |
| `react-hooks/set-state-in-effect` | effect body 의 sync setState 0 — 모든 setState 는 IntersectionObserver callback 또는 rAF 안 |
| `react-hooks/purity` | 컴포넌트 본문에서 `Date.now()` / `Math.random()` 호출 0 |

---

## 5. 격리 원칙 — 건드리지 않은 파일

R3 와 동일 원칙 적용 — 통합 PR 에서 별도 등록만 하면 됨:

- `frontend/messages/ko.json` · `en.json`
- `frontend/messages/_patches/professor.{ko,en}.json` 외 기존 patch
- `frontend/src/components/Header.tsx`
- `frontend/src/contexts/I18nContext.tsx`
- `frontend/src/contexts/AuthContext.tsx`
- 백엔드 일체

---

## 6. 통합 PR 시 처리 항목

### 6.1 `I18nContext.tsx` 에 landingHub patch 등록 (4줄 추가)

R3 통합 패턴 그대로:

```diff
+import landingHubKo from "../../messages/_patches/landingHub.ko.json";
+import landingHubEn from "../../messages/_patches/landingHub.en.json";

 const koPatches: Messages[] = [
   ..., learnersKo as Messages,
+  landingHubKo as Messages,
 ];
 const enPatches: Messages[] = [
   ..., learnersEn as Messages,
+  landingHubEn as Messages,
 ];
```

### 6.2 (선택) `useLandingI18n` thin wrapper 다운그레이드

R3 의 `useStudioI18n` 등과 동일. 자체 patch import 를 제거하고 `useI18n` +
자동 `"landingHub."` prefix 어댑터로 단순화 가능. 다만 `tNumber` 헬퍼가
있어 thin wrapper 변환 시 수정 폭이 약간 더 큼 — R2W4 의 `useMarketingI18n`
처럼 자체 헬퍼 유지 권장.

---

## 7. 의도적으로 미룬 항목

### 7.1 Stats / Adoption 데이터 placeholder

- `landingHub.stats.educatorsValue` = 320, `lecturesValue` = 1840,
  `hoursValue` = 12000 — 모두 **합리적 placeholder 추정값**.
- `MiniLineChart` 의 completion / participation 시리즈도 8주차 가상 데이터.

실제 백엔드 통계 endpoint 가 도착하면 page.tsx 의 `tNumber("stats.*")` /
배열을 fetch 결과로 교체. `BACKEND_ASKS.LANDING.md` 참조.

### 7.2 디자인 톤 통째 변경 (다크 베이스 + 골드)

기획 문서 (colors.md) 는 메인 사이트를 "다크 베이스 + 골드"로 정의하지만
현재 page.tsx 는 라이트 베이스 + indigo 톤. 본 PR 의 "기존 페이지 동적 요소
개선" 범위를 넘어서므로 **별도 PR 로 분리**. animations.md §2 의 효과들은
라이트 베이스에서도 자연스럽게 동작하도록 opacity / 색상 조정 적용됨.

### 7.3 통계 섹션 클릭 → 상세 분석 화면

Stats Strip 카드 클릭 시 use-cases / about 같은 상세 화면으로 진입할 수
있으나, 현재는 정적 표시만. 후속 PR 에서 결정.

### 7.4 i18n 어댑터 통일 (R3 미해결 항목 인용)

R3 통합에서 `useStudioI18n` / `useInboxI18n` / `useAnalyticsI18n` /
`useLearnersI18n` 4개가 자체 import 어댑터로 남아있고, 본 PR 이
`useLandingI18n` 5번째를 추가. 통합 PR 시 일관성 위해 5개 모두 thin
wrapper 로 다운그레이드 (또는 자체 헬퍼 가진 것은 유지) 검토.

---

## 8. BACKEND_ASKS.LANDING (단순)

### §1 랜딩 통계 endpoint (선택, 우선순위 낮음)

```
GET /api/v1/public/landing-stats   # 인증 X, 캐시 hit OK

Response:
{
  "educators_count": 320,
  "lectures_count": 1840,
  "hours_saved": 12000,
  "completion_trend": [42, 48, 55, 61, 68, 74, 79, 82],
  "participation_trend": [18, 22, 31, 38, 44, 51, 58, 63],
  "updated_at": "2026-05-07T00:00:00Z"
}
```

마케팅 효과를 위해 동적 통계 표시. 현재는 placeholder 라 베타 출시 차단
아님. 해당 endpoint 가 없으면 placeholder 그대로 작동.

---

## 9. 검증

- [x] vitest test files 5개 (24 cases) — 컴포넌트 단위 + 페이지 통합
- [ ] CI 의 frontend lint / build / test (PR 시점에 검증)
- [x] 디자인 시스템 위반 0 (수동 점검)
- [x] PR #89 의 react-hooks 룰 위반 패턴 사전 회피 (모든 setState 가
  IntersectionObserver callback 또는 rAF 안)

CI 통과 후 머지.

---

## 10. 베타 출시 영향

본 PR 은 **베타 신청 전환율 개선**. 시각적 완성도가 올라가 첫인상이 좋아짐.
기존 콘텐츠는 100% 보존이므로 회귀 0. R3 통합 (교수자 4페이지) 가 베타
차단 해소했고, 본 PR 은 그 다음 단계인 마케팅 전환율 향상.

CLAUDE.md "3단계" 의 4페이지 중 1페이지 (랜딩) 완료. 나머지는 W2
(features) / W3 (dashboard 통계) / W4 (pricing).
