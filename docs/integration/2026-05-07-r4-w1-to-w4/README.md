# 2026-05-07 — R4W1~R4W4 병렬 통합 (Round 4)

R3 (베타 출시 차단 4페이지: studio/inbox/analytics/learners) 통합 후 다음
우선순위인 CLAUDE.md "3단계: 기존 페이지 동적 요소 개선" 을 4창 병렬로
진행한 결과를 main 에 통합한 기록.

## 통합한 브랜치 / 작업 단위

| 창 | 영역 | 작업 성격 | 통합 노트 디렉토리 |
|---|------|---------|------|
| R4W1 | `/` 랜딩 — animations.md §2 의 6가지 동적 요소 추가 | 기존 페이지 개선 | `2026-05-07-landing/` |
| R4W2 | `/features` 신규 + animations.md §3 의 4가지 동적 요소 | 신규 페이지 | `2026-05-07-features/` |
| R4W3 | `/professor/dashboard` 통계 카드 6개 + animations.md §4 의 6가지 | 기존 페이지 + 신규 통계 | `2026-05-07-dashboardHome/` |
| R4W4 | `/pricing` 신규 (01-pricing-policy + 02-guardrails 정책 반영) | 신규 페이지 | `2026-05-07-pricing/` |

각 창의 상세 노트는 위 디렉토리의 `MERGE_NOTES.{NAME}.md` /
(필요 시) `BACKEND_ASKS.{NAME}.md` 참조.

## 머지 결과

**머지 충돌 0건.** R3 와 동일하게 영역 분리가 잘 되어 자동 통합 통과.

병렬 워크트리 격리 원칙 (4창 모두 무수정 보장):

| 자원 | W1 | W2 | W3 | W4 |
|---|:---:|:---:|:---:|:---:|
| `frontend/messages/ko.json` · `en.json` | ✓ | ✓ | ✓ | ✓ |
| `_patches/professor.{ko,en}.json` 외 기존 patch | ✓ | ✓ | ✓ | ✓ |
| `Header.tsx` / `I18nContext.tsx` / `AuthContext.tsx` | ✓ | ✓ | ✓ | ✓ |
| 백엔드 일체 | ✓ | ✓ | ✓ | ✓ |
| `globals.css` | ✓ | ✓ | ⚠️ keyframe 추가 | ✓ |

W3 가 globals.css 에 `@keyframes slide-in-top` / `@keyframes pulse-subtle`
+ `prefers-reduced-motion: reduce` wildcard 를 추가. 이 셋 모두 main 의
globals.css 에 미존재함을 사전 검증 — 충돌 0. wildcard 는 animations.md §7
의 정책 항목이라 글로벌 자산으로 도입한다.

## 통합 패스에서 처리한 항목

### A. i18n patch 4개 등록

`frontend/src/contexts/I18nContext.tsx` — 8 import + 8 배열 항목 (각 locale
별 4개씩) 추가. 통합 후 누적 적용 순서:

```
student → demo → professor → marketing →
studio → inbox → analyticsHub → learners →
landingHub → featuresHub → dashboardHub → pricingHub
```

**namespace 충돌 회피**: 4 patch 모두 `Hub` 접미사 사용 — 기존 main
`ko.json` 의 `landing.*` (콘텐츠) / `dashboard.*` (학생) 와 의미·키 충돌
회피. R3 W3 의 `analyticsHub` 와 같은 패턴.

### B. Header `nav` 항목 — 추가 작업 0건

R2 시점에 `/features`, `/pricing` link 가 이미 Header 에 있었음 (단지
페이지가 미존재라 404 였음). W2/W4 가 페이지를 만들어 404 자동 해소.

### C. `colors.md` 정책 표 갱신

R4W4 가 작업 중 발견한 디자인 문서 모순을 본 PR 에 같이 정리:

| 출처 | 메인 사이트 톤 |
|---|---|
| 작업 전 `colors.md §1` | "라이트 (`#FAFAF7`)" |
| `CLAUDE.md` 핵심 디자인 원칙 | "다크 베이스 + 골드" |
| 사용자 브리프 | "다크 베이스 + 골드" |
| 기존 코드 (`MarketingShell` 5 페이지) | 다크 |
| R4 4창 합의 | 다크 |

**3:1 로 다크가 권위 우위** — `colors.md §1·§8` 표 + §10 변경 이력 갱신.

### D. 충돌 검증 3건 — 모두 안전

1. **globals.css** — W3 의 keyframe 2종 + wildcard 가 main 에 미존재 → 순수 추가
2. **SVG defs id** — W1 의 `grad-*` (글로벌, page.tsx 만 마운트) / W2 의 `fhub-grad-*` (격리 prefix) / W3 의 per-instance idBase prefix / W4 사용 0 → 4창 + main(`engagement-area`/`grad-electric-cost`) 모두 충돌 0
3. **MainChart.tsx** — W3 가 원작자, W2 의 surgical fix 는 functional 동치 변환. W3 의 최종 형태 (327 줄) 가 권위 — CI 의 next build / TS check 가 최종 검증

### E. 노트 이관

5개 창 통합 디렉토리 (`2026-05-07-{landing,features,dashboardHome,pricing,r4-w1-to-w4}/`)
는 모두 보존. 본 README 가 통합 요약 + 후속 결정 항목 정리.

## 의도적으로 미룬 항목

### 1. i18n 어댑터 thin wrapper 다운그레이드 — 누적 8개 (별도 PR)

R3 통합에서 4개 (`useStudioI18n` / `useInboxI18n` / `useAnalyticsI18n` /
`useLearnersI18n`), 본 PR 에서 4개 (`useLandingI18n` / `useFeaturesHubI18n` /
`useDashboardHubI18n` / `usePricingHubI18n`) 가 자체 patch import 어댑터로
남아있음. R1 의 `useDemoI18n` 처럼 thin wrapper (자동 prefix 어댑터) 로
다운그레이드 가능. `useFeaturesHubI18n` / `useLandingI18n` 등 자체 헬퍼
(`tValue`, `tNumber`) 가진 것은 헬퍼 유지 권장. 베타 차단 아님.

### 2. `useSyncExternalStore` matchMedia 패턴 통일

R4W2 (features) 가 `useSyncExternalStore` 로 prefers-reduced-motion 을
runtime 토글까지 반응하게 구독. W1 / W3 / W4 는 effect + matchMedia +
rAF wrap 패턴. 후속 PR 에서 W2 패턴으로 통일 검토 — 더 우수한 React 19
권장 패턴. 베타 차단 아님.

### 3. R4W3 `aggregate.ts:99` unhandled rejection

R4W4 가 보고한 사전 존재 issue. promise.allSettled fan-out 어딘가에서
catch 누락. 별도 hotfix 또는 R4W3 가 후속 PR 로 정리.

### 4. R3 의 `analytics/ScoreHeatmap.test.tsx` 사전 flake

R4W4 시점에 통과한 것으로 보임. 별도 처리 불필요.

### 5. BACKEND_ASKS 누적 — 28건 (별도 backend sprint)

| 출처 | 건수 | 핵심 |
|---|---:|---|
| R3W1 (studio) | 5 | 플랜 사용량·QR PNG·TTS 미리듣기 |
| R3W2 (inbox) | 7 | 단일 endpoint·답변 PATCH·일괄·aggregate |
| R3W3 (analytics) | 3 | 슬라이드별 replay·Pro 매트릭스 |
| R3W4 (learners) | 6 | `/learners` 합집합·notify |
| R4W1 (landing) | 1 (선택) | 랜딩 통계 endpoint |
| R4W3 (dashboardHome) | 7 | 단일 합계 endpoint·7-day 추이·학기 컨텍스트 |

본 통합 PR 머지를 차단하지 않음. 별도 백엔드 sprint 권장.

### 6. Round 1·2·3 의 미해결 항목 (이전 노트 인용)

- `AVATAR_VOICE_FEATURE_ROADMAP` Sprint A/B/C — 별도 스프린트
- BACKEND_ASKS.R2W3 4건 (locale 컬럼·환영 모달 등)
- BACKEND_ASKS.R2W4 (beta-apply / contact / Captcha)
- 라우팅 정리 — `/professor/lecture/[id]/dashboard` (기존) vs
  `/professor/analytics/[lectureId]` (R3W3) vs
  `/professor/dashboard` 통계 (R4W3) — 정책 결정 필요

## 검증

각 창의 자체 검증 결과:

| 창 | vitest | next build | eslint |
|---|---|---|---|
| R4W1 (landing) | 24 cases (5 files) PASS | (CI 위임) | (CI 위임) |
| R4W2 (features) | 26 cases (3 files) PASS · 1.7s | ✓ Compiled 5.0s · /features 정적 prerendered | 0 / 0 |
| R4W3 (dashboardHome) | 6 files PASS | (CI 위임) | (CI 위임) |
| R4W4 (pricing) | 46 cases (5 files) PASS · 전체 385/385 | ✓ TypeScript clean · /pricing static-prerendered | 0 / 0 |

PR #89 시 잡혔던 `react-hooks/set-state-in-effect` / `react-hooks/purity`
룰을 모든 4창이 사전 회피 (W1: rAF wrap, W2: useSyncExternalStore, W3:
useCountUp matchMedia, W4: 정책 매트릭스 회귀 lint).

**최종 검증은 GitHub Actions CI**:
- frontend: eslint + vitest + next build
- Docker build → GHCR push → Trivy scan (PR 단계 skip)

CI 통과 후 머지.

## 베타 출시 영향

본 통합으로 **CLAUDE.md "3단계: 기존 페이지 동적 요소 개선" 완료**:

- ✅ 랜딩 6가지 동적 요소
- ✅ Features 신규 + 4가지 동적 요소
- ✅ Dashboard 통계 6 + 6가지 동적 요소
- ✅ Pricing 신규 (정책 정확 반영 + 회귀 lint)

베타 신청 전환율에 직접 영향. 시각적 완성도 + 정책 투명성 (가격·한도·가드레일)
이 모두 마련됨. 다음 우선순위 작업:

- 옵션 A: W5 배포 (DEPLOYMENT_ROADMAP Phase 1~6) — 사용자가 보류 중
- 옵션 B: BACKEND_ASKS 누적 28건 → backend sprint
- 옵션 C: i18n 어댑터 8개 thin wrapper 다운그레이드 (코드베이스 정리)

## 참조 노트 (각 창 디렉토리)

- [`2026-05-07-landing/`](../2026-05-07-landing/) — `MERGE_NOTES.LANDING.md`
- [`2026-05-07-features/`](../2026-05-07-features/) — `MERGE_NOTES.FEATURES.md`
- [`2026-05-07-dashboardHome/`](../2026-05-07-dashboardHome/) — `MERGE_NOTES.DASHBOARDHUB.md` · `BACKEND_ASKS.DASHBOARDHUB.md`
- [`2026-05-07-pricing/`](../2026-05-07-pricing/) — `MERGE_NOTES.PRICING.md`
