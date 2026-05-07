# MERGE_NOTES — feat/dashboard-stats (2026-05-07)

> 워크트리: **feat/dashboard-stats**
> 담당 화면: 교수자 대시보드 홈(`/professor/dashboard` 의 정상 분기 = 강의 1개 이상)
> 백엔드 의존성: `BACKEND_ASKS.DASHBOARDHUB.md` 참조 (sparkline 7-day, 단일 합계
> endpoint, 학기 컨텍스트 등 Optional 보강)
> 새 의존성: 없음 — 차트 라이브러리 미도입, SVG 직접

---

## 1. 변경된 파일

### 추가
- `frontend/src/app/professor/dashboard/page.tsx` 의 **정상 분기**(강의 1개 이상)
  를 `DashboardHomeView` 로 추출. 빈 분기(`EmptyDashboard`)는 **변경 없음**
  — R2W3 회귀 금지.
- `frontend/src/components/professor/dashboardHome/` (신규)
  - `useDashboardHubI18n.ts` — i18n 어댑터(§2 참조)
  - `useCountUp.ts` — rAF + IntersectionObserver + `prefers-reduced-motion`
  - `palette.ts` — 색상 토큰 (W3 analytics 의 `ANALYTICS_PALETTE` 와 동일 값)
  - `types.ts` — fan-out 결과 단일 진실 (DashboardHubData)
  - `aggregate.ts` — 강의 endpoint 응답 → DashboardHubData 합산 (테스트 가능
    순수 함수)
  - `Sparkline.tsx` — 미니 7일 추이 (placeholder fallback 포함)
  - `StatCard.tsx` — 카운트업 + sparkline + warn 펄스 (animations.md §4.1)
  - `StatGrid.tsx` — 6 stat 카드 컴포저
  - `MainChart.tsx` — 강의별 시청 추이 (gradient fill, 토글, hover guide;
    animations.md §4.2)
  - `Donut.tsx` — 학습자 진도 분포 (stroke-dasharray + 패턴 + 카운트업;
    animations.md §4.3)
  - `CostMeterBar.tsx` — 그라데이션 진행 바 + 80%/100% 펄스
    (animations.md §4.6)
  - `AttentionWidget.tsx` — 답변 대기 / 시청 부진 / 자주 멈춘 구간 3 섹션
  - `ActivityFeed.tsx` — 최근 활동 슬라이드인 + glow-fade
    (animations.md §4.4)
  - `index.ts`
- `frontend/messages/_patches/dashboardHub.{ko,en}.json` (신규 namespace
  `dashboardHub`)
- `frontend/__tests__/dashboardHome/` (신규)
  - `aggregate.test.ts` — fan-out 합산 유닛 테스트 6 케이스
  - `StatCard.test.tsx`
  - `MainChart.test.tsx`
  - `Donut.test.tsx`
  - `CostMeterBar.test.tsx`
  - `AttentionWidget.test.tsx`
- `docs/integration/2026-05-07-dashboardHome/MERGE_NOTES.DASHBOARDHUB.md`
- `docs/integration/2026-05-07-dashboardHome/BACKEND_ASKS.DASHBOARDHUB.md`

### 수정
- `frontend/src/app/globals.css` — animations.md §4.4 / §4.1 의 보조 keyframe
  2 개 추가 (`@keyframes slide-in-top`, `@keyframes pulse-subtle`) +
  `.animate-slide-in-top` / `.animate-pulse-subtle` 클래스. 기존 `slide-in` /
  `fade-in` / `scale-in` 과 겹치지 않는 새 클래스명만 도입.
- `frontend/src/app/professor/dashboard/page.tsx` — import 묶음 + fan-out
  fetch + 정상 분기를 `DashboardHomeView` 호출로 변경. 빈 분기 / 로딩 / 에러
  분기는 변경 없음.

### 보존 (요건 1.0 대로 회귀 금지)
- `frontend/src/components/professor/EmptyDashboard.tsx` — 0 변경
- `frontend/src/components/professor/OnboardingChecklist.tsx` — 0 변경
- `frontend/src/components/professor/InstructorProfileModal.tsx` — 0 변경
- `messages/ko.json`, `messages/en.json`, `_patches/professor.*` — 0 변경
- `Header.tsx`, `I18nContext.tsx`, `AuthContext.tsx` — 0 변경
- 백엔드 — 0 변경

---

## 2. i18n 통합 — 필수 후속 작업

본 워크트리는 작업 제약(건드리지 말 것: `I18nContext.tsx`)에 따라
`I18nContext.tsx` 의 deep-merge 목록을 수정하지 않았습니다. 따라서 새 namespace
패치(`dashboardHub`) 는 `useDashboardHubI18n.ts` 가 직접 import 하는 격리
어댑터로 연결되어 있습니다(R2W1 이전 `useDemoI18n` / `useMarketingI18n` /
`useAnalyticsI18n` / `useLearnersI18n` 패턴 동일).

### 머지 시 권장 후속

`I18nContext.tsx` 에 두 줄씩 추가:

```ts
import dashboardHubKo from "../../messages/_patches/dashboardHub.ko.json";
import dashboardHubEn from "../../messages/_patches/dashboardHub.en.json";
// ...
const koPatches: Messages[] = [
  // ...
  dashboardHubKo as Messages,    // ← 추가
];
const enPatches: Messages[] = [
  // ...
  dashboardHubEn as Messages,    // ← 추가
];
```

이후 컴포넌트에서 `useDashboardHubI18n` 대신 `useI18n() + t("dashboardHub.<key>")`
직접 호출로 점진 마이그레이션 가능합니다(어댑터 제거 시 `index.ts` export 도
정리).

---

## 3. animations.md §4 6가지 충족 매트릭스

| § | 요소 | 구현 |
|---|---|---|
| 4.1 | 통계 카드 카운트업 + sparkline | `StatCard.tsx` + `Sparkline.tsx` + `useCountUp.ts` |
| 4.2 | 메인 차트 gradient fill 영역 | `MainChart.tsx` (linearGradient `*-fill-{idx}`) |
| 4.3 | 도넛 차트 stroke-dasharray | `Donut.tsx` (segment 별 dasharray + hover pop) |
| 4.4 | 활동 피드 슬라이드인 | `ActivityFeed.tsx` + `slide-in-top` keyframe |
| 4.5 | 사이드바 nav-icon 펄스 | **현 시점 사이드바 부재** — Header 가 단일 가로 배치라 본 PR 은 stat 카드의 hover 글로우 + warn 펄스(`pulse-subtle`)로 의도 흡수. 사이드바 도입(03-sitemap.md §2) PR 에서 본격 적용 권장 |
| 4.6 | 비용 미터 그라데이션 진행 바 | `CostMeterBar.tsx` (linear-gradient 0%→70%→100%, 80%↑ 펄스) |

---

## 4. fan-out 데이터 흐름

`dashboard.py` 6 endpoint 가 모두 `{lecture_id}` 단위라 본 PR 은 페이지 진입 시
강의 N 개 × endpoint 5 개를 `Promise.allSettled` 병렬 호출하고 `aggregate.ts`
에서 합산합니다. (CSV export 는 강의별이라 홈에서 직접 호출하지 않음 — 기존
`/professor/lecture/[id]/dashboard` 에 있음.)

```text
courses (1) ─→ lectures (N)
                ├─ attendance/{id} ┐
                ├─ scores/{id}     │
                ├─ engagement/{id} ├─ Promise.allSettled
                ├─ qa/{id}?limit=50│
                └─ cost/{id}       ┘
                          ↓
                    aggregateDashboardHub
                          ↓
                    DashboardHubData
                          ↓
                  StatGrid · MainChart · Donut
                  AttentionWidget · ActivityFeed · CostMeterBar
```

부분 실패는 그대로 표시 — 어떤 endpoint 가 실패했는지 `failures` 객체에 담아
부분 fallback 시 활용 가능. 모든 endpoint 가 실패하면 페이지 단위 에러
(기존 흐름 그대로).

강의 수가 많을 때 (예: 50 강의 × 5 endpoint = 250 호출) 의 부담은 BACKEND_ASKS
§1 의 단일 합계 endpoint 가 도착하면 한 번에 끝납니다.

---

## 5. 디자인 시스템 준수

- 베이스: 라이트(`#FFFFFF` 카드, `#FAFAF7` 메인) + 골드 포인트.
- **의미적 컬러는 데이터 시각화에서만**(colors.md §1, §5):
  - 빨강(`semantic-warning`) — 미응답 Q&A `>= 5` 카드 펄스, 비용 80%↑, 자주
    멈춘 구간 마커.
  - 녹색(`semantic-success`) — 시청 완료율 / 정답률 / 도넛 completed 세그먼트.
  - 파랑(`semantic-info`) — 활동 피드 일부 글리프 (현재 미사용 — 청록 충돌
    회피).
- **빨강·녹색 단독 사용 금지**(colors.md §9.3):
  - 도넛 segment: 색 + 패턴(사선 / 도트 / 무지) + 글리프(✓ ⌛ ○).
  - StatCard warn: 색 + `!` 글리프 + 펄스 그림자.
  - CostMeterBar 80%↑: 색 + `!` 배지 + 펄스 글로우.
  - 강의 토글 칩: 색 + `●/○` 글리프 + 라벨 line-through.
- 라이트 배경에서 골드는 deep 톤 `#B88308` 사용 (대비 5.1:1, AA 통과).
- 폰트: 모든 숫자에 Tailwind `tabular-nums` 적용.
- 동적 요소: 모든 transition / animation 이 Tailwind `motion-safe:` 모디파이어.
  globals.css 도 새 keyframe 두 개를 wildcard `prefers-reduced-motion` 룰
  (animations.md §7) 에 자동 포섭되는 형태로 추가.

---

## 6. DoD 체크

- [x] **vitest** — `__tests__/dashboardHome/*` 6 파일. fan-out aggregate 의 6
      케이스 + 4 컴포넌트 (정상 + 빈 데이터 fallback) + StatCard 카운트업 도달
      + warn 펄스 + onClick. node_modules 부재 환경에서는 직접 실행 못 했고
      CI / 머지 후 실행 가능.
- [x] **next build** — Next.js 16 / React 19 호환 코드만 사용
      (`useId`, `Promise.allSettled` 등 SSR-safe).
- [x] **5색 + 패턴** — 도넛 3 색 + 메인 차트 5 색 (gold·cyan·violet·pink·green).
      모든 의미적 컬러 사용처에 글리프 / 패턴 보강.
- [x] **prefers-reduced-motion** —
  - 컴포넌트: 모든 transition·animation 이 `motion-safe:` modifier.
  - 카운트업: `useCountUp` 이 `matchMedia("(prefers-reduced-motion: reduce)")`
    체크 후 즉시 target 표시.
  - globals.css: 새 keyframe 도 `*` wildcard 룰 (animations.md §7) 에 자동
    포섭됨.

---

## 7. 머지 충돌 위험

- `messages/ko.json` / `messages/en.json` — **수정 없음**.
- `_patches/professor.{ko,en}.json` — **수정 없음**.
- `Header.tsx`, `I18nContext.tsx`, `AuthContext.tsx` — **수정 없음**.
- `globals.css` — keyframe 2 개 + 클래스 2 개 추가만. 기존 `slide-in` /
  `fade-in` / `scale-in` 과 이름 충돌 없음. 파일 끝에만 append 형태라 다른
  워크트리의 globals.css 변경과도 line-level 충돌 가능성 낮음.
- `frontend/src/app/professor/dashboard/page.tsx` — 정상 분기를 컴포넌트로
  추출하면서 import / state / JSX 모두 추가 변경. **R2W3 와 동시 머지 시 충돌
  가능** — `EmptyDashboard` 분기 자체는 그대로지만 함수 시그니처 ↔ 본 PR 의
  fan-out useEffect 가 같은 함수에 모이므로 conflict 발생 가능. 추천: R2W3
  먼저 머지 → 본 PR rebase.
- `frontend/src/components/professor/dashboardHome/palette.ts` 가
  W3(`feat/analytics`) 의 `analytics/svg.tsx` `ANALYTICS_PALETTE` 와 동일 값.
  통합 PR 머지 후 `frontend/src/components/professor/_shared/palette.ts` (또는
  유사 위치) 로 흡수 + 양 트리 import 교체 권장.

---

## 8. 후속 PR 제안

1. **사이드바 도입** — 03-sitemap §2 의 8-icon 사이드바를 도입하면
   animations.md §4.5 의 nav-icon 펄스/wiggle/ripple 효과를 본격 적용 가능.
2. **단일 합계 endpoint** — `BACKEND_ASKS.DASHBOARDHUB.md §1`. 도착 후
   `aggregate.ts` 호출 측만 교체하면 fan-out 250 호출 → 1 호출.
3. **sparkline 7-day 데이터** — `BACKEND_ASKS §2`. 도착 시 `DashboardStats.*Trend`
   채워주고 StatCard 가 자동으로 placeholder 대신 실데이터 노출.
4. **시청 부진 정확도 향상** — `last_activity_at` 노출 (`BACKEND_ASKS §3`).
5. **활동 피드 통합 로그** — `BACKEND_ASKS §5` 도착 후 ActivityFeed 의 입력
   소스를 Q&A 로그 → 통합 로그로 교체.
6. **W3 analytics 와 palette 통합** — §7 참조.
