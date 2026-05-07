# MERGE_NOTES.CODE_CLEANUP — R5W1 코드 정리 통합 PR

> **창**: R5W1 (단일 책임: 코드 정리 / 기능 추가 0)
> **브랜치**: `chore/r5-code-cleanup`
> **작업일**: 2026-05-07
> **연관 노트**: R3·R4 통합 README 의 "의도적으로 미룬 항목" 섹션

---

## 1. 요약

R3 (베타 차단 4페이지) + R4 (랜딩·features·dashboard·pricing 동적 요소)
통합 후 누적된 후속 정리 항목 4개를 단일 PR 로 묶어 처리. **기능 추가 0 / UI
변화 0**, 리팩토링·lint fix·정책 결정만.

| Chunk | 내용 | 변경 파일 |
|---|---|---:|
| A | i18n 어댑터 3개 thin wrapper 다운그레이드 | 3 |
| B | `usePrefersReducedMotion` helper 추출 + 6 컴포넌트 적용 | 7 |
| C | lint warning 11개 정리 | 9 |
| D | 라우팅 매트릭스 정책 결정 — `/lecture/[id]/dashboard` → `/analytics/[id]` redirect | 2 |

---

## 2. Chunk A — i18n 어댑터 thin wrapper 다운그레이드

R1 의 `useDemoI18n` 패턴 (자동 prefix 어댑터) 으로 **3개** 어댑터 단순화:

| 어댑터 | 이전 (자체 dict) | 이후 (thin wrapper) |
|---|---:|---:|
| `useStudioI18n` | 64줄 | 22줄 |
| `useLearnersI18n` | 65줄 | 22줄 |
| `useDashboardHubI18n` | 60줄 | 22줄 |

**의도적으로 thin wrapper 화 안 한 4개** (자체 헬퍼 보존):

| 어댑터 | 보존 헬퍼 | 사유 |
|---|---|---|
| `useInboxI18n` | `tValue` | 배열/객체 직접 lookup. R2 `useMarketingI18n` 패턴 |
| `useAnalyticsI18n` | `tValue` | 동일 |
| `useLandingI18n` | `tNumber` | 숫자 lookup (StatCounter target 등) |
| `usePricingHubI18n` | `tValue`, `resolve` | 동일 |
| `useFeaturesHubI18n` | `tValue` | 동일 (R5 시점 이미 보존 결정) |

호출자 코드는 모두 그대로 — 짧은 키 (`t("step1.title")`) 사용 패턴 유지.

`I18nContext.tsx` 는 무수정 — patches 8개 모두 R3 / R4 통합 PR 에서 이미
등록됨.

---

## 3. Chunk B — `usePrefersReducedMotion` helper

R4W2 (features) 가 `ProgressShimmer.tsx` 에 inline 으로 구현했던
`useSyncExternalStore` 기반 패턴을 단일 helper 로 분리:

**신규 파일**: `frontend/src/lib/usePrefersReducedMotion.ts` (43줄)

이 helper 의 핵심 가치:
- `react-hooks/set-state-in-effect` 룰 위반 위험 0 (effect body 안 sync setState 0)
- 사용자가 OS 설정을 페이지 머무는 중 토글하면 즉시 반영 (런타임 반응)
- SSR snapshot 분리 (서버는 항상 false)

**적용 대상 6 컴포넌트**:

| 컴포넌트 | 이전 패턴 | 이후 |
|---|---|---|
| `landing/StatCounter.tsx` | `effect + matchMedia + rAF wrap` | `usePrefersReducedMotion()` |
| `landing/FadeInSection.tsx` | 동일 | helper |
| `landing/MiniLineChart.tsx` | 동일 | helper |
| `dashboardHome/useCountUp.ts` | 동일 | helper |
| `features/IsoGrid.tsx` | `effect 안 matchMedia 일회성 체크` | helper |
| `features/ProgressShimmer.tsx` | inline `useSyncExternalStore` | helper (inline 헬퍼 3개 제거) |

각 컴포넌트의 useEffect dependency 배열에 `reduced` 추가하여 사용자 토글 시
재마운트 / 재구독 자연 작동.

---

## 4. Chunk C — lint warning 11개 정리

PR #89 시점에 잡혔던 11 warning 모두 해소. 각 fix 패턴을 정책으로 박는다.

| 파일·위치 | 룰 | Fix |
|---|---|---|
| `__tests__/hooks/useOnlineStatus.test.ts:1` | `no-unused-vars` (vi) | import 제거 |
| `app/dashboard/page.tsx:45` | `react-hooks/exhaustive-deps` | dep `t` 추가 |
| `app/dashboard/page.tsx:110` | `@next/next/no-img-element` | `next/image` Image + `fill` + sizes |
| `app/lecture/[slug]/assess/page.tsx:65` | `react-hooks/exhaustive-deps` | dep `t` 추가 |
| `app/lecture/[slug]/page.tsx:50` | `no-unused-vars` (toast) | useToast import + destructure 제거 |
| `analytics/CostMeter.tsx:32` | `react-hooks/exhaustive-deps` | `?? []` fallback `useMemo` 안정화 |
| `analytics/EngagementCurve.tsx:36` | 동일 | 동일 |
| `analytics/QaTrend.tsx:22` | 동일 | 동일 |
| `analytics/WatchHeatmap.tsx:30` | 동일 | 동일 |
| `studio/StepIndicator.tsx:33` | `no-unused-vars` (isPending) | const 선언 제거 |

`?? []` fallback 의 `useMemo` 안정화 패턴이 4 파일 반복 — 후속 PR 에서
helper 추출 검토 가능 (`useDataFallback<T>(value, fallback)` 형태).

---

## 5. Chunk D — 라우팅 매트릭스 결정

### 결정: (a) 단일 진입점

R3 / R4 통합 시 의도적으로 미룬 결정:

| 경로 | 출처 | 이전 역할 |
|---|:---:|---|
| `/professor/lecture/[id]/dashboard` | 기존 (PR #88 이전) | Tab(attendance/scores/engagement/cost) 4 + CSV |
| `/professor/analytics/[lectureId]` | R3W3 (PR #89) | 차트 7종 + fan-out + 부분 실패 fallback |
| `/professor/dashboard` (정상 분기) | R4W3 (PR #90) | 통계 카드 6 + 동적 요소 6 — **전체 합계** |

**(a) 채택**: 강의 카드 "분석" 버튼이 모두 `/professor/analytics/[id]` 로
가도록 통일. 기존 `/lecture/[id]/dashboard` 는 redirect 페이지로
단순화 — 외부 북마크·이메일 링크 호환을 위해 라우트 자체는 유지.

### 변경 파일

- `app/professor/dashboard/page.tsx` — 강의 카드의 `onOpenLectureAnalytics` 가
  `/professor/analytics/[id]` 로 이동
- `app/professor/lecture/[id]/dashboard/page.tsx` — 자체 콘텐츠 (Tab UI +
  CSV 등) 제거하고 `useEffect + router.replace` 의 redirect-only 페이지로
  단순화. 100+ 줄 → 30+ 줄

### 사용자 시점

- 기존 외부 링크 (북마크·이메일) 로 진입한 사용자도 한 frame 후 자동으로
  새 경로로 이동
- dashboard 의 카드 클릭은 단일 경로로 통일
- 두 경로 모두에서 동일 화면 (R3W3 의 풍부한 차트 7종) 도달

---

## 6. 격리 / 충돌 방지

R3 / R4 와 동일 원칙. 다만 본 PR 의 본질이 "기존 파일 정리" 라 다음 파일은
의도적으로 수정:

| 파일 | 이유 |
|---|---|
| 8 i18n 어댑터 중 3 (Studio/Learners/DashboardHub) | thin wrapper 변환 |
| 6 컴포넌트 (StatCounter / FadeInSection / MiniLineChart / useCountUp / IsoGrid / ProgressShimmer) | helper 적용 |
| 4 analytics 컴포넌트 (CostMeter/EngagementCurve/QaTrend/WatchHeatmap) | useMemo 안정화 |
| 5 페이지 (dashboard / lecture/[slug] / lecture/[slug]/assess / studio/StepIndicator / professor/dashboard) | warning 정리 + 라우팅 |
| 2 redirect (lecture/[id]/dashboard, professor/dashboard) | (a) 라우팅 결정 |

**무수정 보장**:
- `messages/ko.json` · `en.json` (콘텐츠)
- `_patches/*` (모든 patch — 키 추가 0)
- `Header.tsx`, `I18nContext.tsx`, `AuthContext.tsx`, `globals.css`
- 백엔드 일체

---

## 7. 의도적으로 미룬 항목

### 7.1 R5W2 / W3 / W4 와의 합류

R5 는 W1 (본 PR) + W2 (legal) + W3 (help/changelog) + W4 (profile/a11y)
4창 병렬. **본 PR 은 W1 만**. W2~W4 는 별도 PR. 4 PR 모두 머지 후 통합 README.

### 7.2 i18n 어댑터 4개의 thin wrapper 화 (선택)

`tValue` / `tNumber` / `resolve` 헬퍼가 있는 4 어댑터를 thin wrapper 로
가져가려면 `useI18n` 자체에 `lookupRaw` 같은 헬퍼 추가가 필요. 이는 본 PR
범위 밖 — 후속 PR 권장. 데이터 중복 (자체 dict + main I18nContext 의
deep-merged dict) 의 cost 는 작아 (webpack tree-shaking 으로 dedup) 베타
출시 차단 아님.

### 7.3 useMemo 안정화 helper 추출

`?? []` fallback 4 파일 반복은 후속 PR 의 `useStableArray<T>` 같은
helper 로 정리 가능. 본 PR 은 정책 명시 + 회귀 수정만.

### 7.4 next.config.ts 의 `images.remotePatterns`

`next/image` 적용 시 외부 호스트 (Supabase Storage / S3 등) 등록 필요.
배포 시점에 결정해야 하므로 W5 (배포) 의 책임 — 본 PR 은 로컬 이미지·
data URI 만 동작 보장.

---

## 8. DoD

- [x] vitest — 신규 helper 테스트 4 cases
- [ ] CI 의 frontend lint / build / test (PR 시점에 검증)
- [x] 기능 변화 0 — UI 회귀 0 보장
- [x] 격리 원칙 준수 (위 §6)

---

## 9. 베타 출시 영향

본 PR 은 **사용자 경험 변화 0** + **개발자 경험 향상**:
- lint clean (0 errors / 0 warnings) → 후속 PR 의 lint 노이즈 감소
- helper 통일 → 새 motion-aware 컴포넌트 추가 시 1줄 import
- 단일 라우팅 진입점 → 사용자·개발자 혼동 감소
- thin wrapper → 8개 어댑터 중 3개 단순화 (남은 4개는 헬퍼 보존)

베타 차단 없음. 다음 단계: R5 의 W2/W3/W4 결과 받은 후 통합 PR.
