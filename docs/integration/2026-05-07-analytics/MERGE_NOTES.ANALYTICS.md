# MERGE_NOTES — feat/analytics (2026-05-07)

> 워크트리: **feat/analytics**
> 담당 화면: 교수자 분석 리포트 (`/professor/analytics`, `/professor/analytics/[lectureId]`)
> 백엔드 의존성: `BACKEND_ASKS.ANALYTICS.md` 참조 (재생 구간 히트맵 raw)
> 새 의존성: 없음 (차트 라이브러리 미도입 — 모든 차트 SVG 직접 그림)

---

## 1. 추가된 파일

### 페이지 (App Router)
- `frontend/src/app/professor/analytics/page.tsx` — 강의 카드 그리드(인덱스).
- `frontend/src/app/professor/analytics/[lectureId]/page.tsx` — 강의별 6 섹션
  대시보드(출석/정답률/참여도/재생 구간/Q&A/비용).

### 컴포넌트
- `frontend/src/components/professor/analytics/AttendanceChart.tsx`
- `frontend/src/components/professor/analytics/ScoreHeatmap.tsx`
- `frontend/src/components/professor/analytics/EngagementCurve.tsx`
- `frontend/src/components/professor/analytics/CostMeter.tsx`
- `frontend/src/components/professor/analytics/QaTrend.tsx`
- `frontend/src/components/professor/analytics/WatchHeatmap.tsx`
- `frontend/src/components/professor/analytics/CsvExportButton.tsx`
- `frontend/src/components/professor/analytics/EmptyState.tsx`
- `frontend/src/components/professor/analytics/svg.tsx` — 색상·패턴 defs(색약자
  보조), 정답률 → bucket 매핑.
- `frontend/src/components/professor/analytics/types.ts` — `dashboard.py` 응답
  shape 단일 진실. backend dict ↔ React props 어댑터의 시작점.
- `frontend/src/components/professor/analytics/useAnalyticsI18n.ts` — i18n 어댑터
  (§2 참조).
- `frontend/src/components/professor/analytics/index.ts` — 묶음 진입점.

### i18n 패치
- `frontend/messages/_patches/analytics.ko.json`
- `frontend/messages/_patches/analytics.en.json`

`analyticsHub` 단일 namespace 로 추가했습니다(메인 `messages/*.json` 의 기존
`analytics.*` 키와 충돌 회피). 본 워크트리 안에서는 `useAnalyticsI18n` 의 자동
prefix 가 붙어 호출자는 `t("attendance.summaryLive")` 처럼 사용합니다.

### 테스트 (vitest, jsdom)
- `frontend/__tests__/analytics/AttendanceChart.test.tsx`
- `frontend/__tests__/analytics/ScoreHeatmap.test.tsx`
- `frontend/__tests__/analytics/EngagementCurve.test.tsx`
- `frontend/__tests__/analytics/CostMeter.test.tsx`
- `frontend/__tests__/analytics/QaTrend.test.tsx`
- `frontend/__tests__/analytics/WatchHeatmap.test.tsx`
- `frontend/__tests__/analytics/CsvExportButton.test.tsx`

각 테스트는 (a) 빈 응답 → fallback EmptyState, (b) 정상 응답 → 차트 요소
렌더링을 검증합니다. CSV 버튼은 endpoint 호출 + responseType=blob 모킹
검증.

---

## 2. i18n 통합 — **필수 후속 작업**

본 워크트리는 작업 제약(건드리지 말 것: `I18nContext.tsx`)에 따라
`I18nContext.tsx` 의 deep-merge 목록을 수정하지 않았습니다. 따라서 새 namespace
패치(`analyticsHub`)는 `useAnalyticsI18n.ts` 가 직접 import 하는 격리 어댑터로
연결되어 있습니다(R2W1 이전의 `useDemoI18n`/`useMarketingI18n`/`useLearnersI18n`
패턴 동일).

### 머지 시 권장 후속

`I18nContext.tsx` 에 두 줄 추가:

```ts
import analyticsKo from "../../messages/_patches/analytics.ko.json";
import analyticsEn from "../../messages/_patches/analytics.en.json";
// ...
const koPatches: Messages[] = [
  // ...
  analyticsKo as Messages,    // ← 추가
];
const enPatches: Messages[] = [
  // ...
  analyticsEn as Messages,    // ← 추가
];
```

이후에는 컴포넌트에서 `useAnalyticsI18n` 대신 `useI18n() + t("analyticsHub.<key>")`
직접 호출로 점진 마이그레이션 가능합니다(어댑터 제거 시 `index.ts` export 도
정리).

---

## 3. 라우팅 변경 사항

기존 `/professor/lecture/[id]/dashboard` 페이지는 그대로 유지됩니다(다른 진입
경로). `professor/dashboard` 의 강의 카드 "분석 보기" 버튼은 기존 경로를 가리키고
있는데, 본 PR 머지 후 다음 중 하나를 결정해주세요:

- (a) **신규 경로로 전환**: `dashboard/page.tsx` 의 `analytics` 버튼이
  `/professor/analytics/{lec.id}` 로 가도록 변경. 기존 페이지는 deprecate.
- (b) **공존**: 사이드바(03-sitemap §2)의 "분석 리포트" 메뉴만 신규 인덱스
  페이지로 연결, 기존 `lecture/[id]/dashboard` 는 강의 편집 흐름의 보조 뷰로
  남기기.

본 PR 자체는 (b) 가정으로 인덱스 카드만 새 경로로 연결합니다(`/professor/dashboard`
의 강의 카드는 변경하지 않음 — 다른 워크트리와의 충돌 방지).

---

## 4. 백엔드 의존성

본 PR 의 모든 차트는 `dashboard.py` 의 6 endpoint 응답만으로 동작합니다.
`Promise.allSettled` 로 병렬 호출하므로 일부 endpoint 가 5xx 여도 나머지 섹션은
정상 표시됩니다. 단:

- **재생 구간 히트맵(WatchHeatmap)** 의 raw 데이터(`slides[]`) 는 현재 어떤
  endpoint 에도 없습니다. 컴포넌트는 `data === null || slides === []` 일 때
  "준비 중" EmptyState 로 graceful fallback 합니다.
- 협의안: `engagement` 응답에 `slides: [{index, replays, drops, durationSec}]`
  필드를 함께 노출. 도착하면 `[lectureId]/page.tsx` 가 자동으로 활성화합니다
  (분기 코드는 이미 들어있음).
- 자세한 raw shape · 산정 정의 · 우선순위는 `BACKEND_ASKS.ANALYTICS.md` 참조.

---

## 5. 디자인 시스템 준수

- 베이스: 라이트(`#FFFFFF`/`#FAFAF7`) + 골드 포인트.
- **의미적 컬러는 데이터 시각화에서만** 사용(colors.md §1, §5):
  - 빨강(`semantic-warning`) — 무반응 이벤트 카운트, 비용 80% 초과 경고, 슬라이드
    이탈 점.
  - 녹색(`semantic-success`) — 실시간 출석, 응답률 카드.
  - 파랑(`semantic-info`) — 사후 시청, in-scope Q&A.
- **빨강·녹색 단독 사용 금지(colors.md §9.3)** — 정답률 히트맵 5단계는 색상 +
  채움 패턴(사선·도트·체크)으로 이중 부호화. 슬라이드 이탈 표시는 빨간 점 +
  `!` 글리프. live/vod 누적 막대는 색 + 텍스트 라벨.
- 폰트: 모든 숫자에 Tailwind `tabular-nums` 적용(Pretendard tabular 보장).
- 동적 요소: Tailwind `motion-safe:` 모디파이어로 `prefers-reduced-motion`
  지원. 사용자가 환원 모션을 선호하면 진행 막대 transition / 카드 진입
  fade-in / 화살표 nudge 가 즉시 적용된다(애니메이션 미발생).

---

## 6. DoD 체크

- [x] **vitest** — `__tests__/analytics/*` 7 파일 (chart 6 + CsvExportButton).
      각 chart 는 정상 + 빈 데이터 fallback 케이스 보유. node_modules 부재
      환경에서는 실행하지 못하나, CI / 머지 후 환경에서 실행 가능.
- [x] **next build** — Next.js 16 / React 19 호환 코드만 사용. `useId`,
      `Promise.allSettled` 등 SSR-safe.
- [x] **prefers-reduced-motion** — 모든 transition / animation 에 `motion-safe:`
      modifier 적용.
- [x] **색약자 친화** — 색상 + 패턴 / 색상 + 라벨 / 색상 + 글리프 이중 부호화.
      WCAG 2.1 AA 대비 검증된 페어만 사용(라이트 배경에서 골드는 `#B88308`).

---

## 7. 머지 충돌 위험

- `messages/ko.json` / `messages/en.json` — **수정 없음**.
- `_patches/professor.{ko,en}.json` — **수정 없음**.
- `Header.tsx`, `I18nContext.tsx` — **수정 없음**(§2 후속 작업으로 분리).
- 신규 디렉토리 `frontend/src/components/professor/analytics/`, `frontend/src/app/professor/analytics/`,
  `frontend/__tests__/analytics/` — 다른 워크트리와 겹치지 않습니다.
- `dashboard.py` 등 백엔드 — **수정 없음**.

---

## 8. 후속 PR 제안

1. **사이드바 메뉴 연결** — 03-sitemap.md 의 "분석 리포트" 메뉴를 `/professor/analytics`
   로 연결. 사이드바 자체가 본 PR 범위 밖이라 분리.
2. **Pro 취약점 매트릭스** — 학습자 × 챕터 정답률 매트릭스(`05-instructor-pages.md` §7.2).
   `dashboard/scores` 응답 확장 필요. BACKEND_ASKS 의 §3 으로 추후 보강 예정.
3. **재생 구간 히트맵 활성화** — `BACKEND_ASKS.ANALYTICS.md` 의 §1 도착 후 자동
   활성화. 추가 프론트 작업 불필요(분기 코드 기 적용).
4. **i18n 어댑터 제거** — `I18nContext.tsx` deep-merge 통합 후 `useAnalyticsI18n`
   제거 + 컴포넌트 호출자 마이그레이션.
5. **`/professor/lecture/[id]/dashboard` 정리 결정** — §3 의 (a)/(b) 중 택일.
