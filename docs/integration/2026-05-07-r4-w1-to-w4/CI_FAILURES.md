# PR #90 CI 실패 진단 (2026-05-07)

> **상태**: 진단 완료, fix 미진행 — 사용자 결정 후 다음 commit 에서 처리.
> **해당 워크플로 run**: `25470970527`
> **HEAD commit**: `43e18c5`

---

## 결과 요약

| Job | 상태 |
|---|:---:|
| Frontend Build | ✅ |
| Frontend Lint | ❌ 4 errors |
| Frontend Test | ❌ 1 unhandled error (82 test files passed) |
| Backend Lint | ✅ |
| Backend Test | ✅ |

빌드는 통과 — 코드 자체는 동작. eslint 룰 위반 + vitest unhandled async error.

---

## 1. Frontend Lint 실패 — 4 errors (모두 R4W3 영역)

PR #89 와 동일 패턴 (`react-hooks/set-state-in-effect`) + 추가 룰
(`react-hooks/refs`).

### 1.1 `frontend/src/components/professor/dashboardHome/ActivityFeed.tsx:37:7`
```
Calling setState synchronously within an effect can trigger cascading renders
```
useEffect 안에서 sync setState 호출. R4W1 / R4W2 가 사전 회피했던 패턴.

### 1.2 `frontend/src/components/professor/dashboardHome/CostMeterBar.tsx:66:25` + `69:52`
```
Cannot access refs during render
```
컴포넌트 본문 (render phase) 에서 `ref.current` 접근. React 19 의 새
`react-hooks/refs` 룰. ref 는 effect 또는 event handler 안에서만 read.

### 1.3 `frontend/src/components/professor/dashboardHome/useCountUp.ts:40:7`
```
Calling setState synchronously within an effect can trigger cascading renders
```
1.1 과 동일 패턴.

---

## 2. Frontend Test 실패 — 1 unhandled error

```
TypeError: Cannot read properties of undefined (reading 'filter')
Test Files: 82 passed (82)
Errors:     1 error
```

**Test 자체는 82개 파일 모두 통과**. 다만 Unhandled async error 1건이
프로세스 exit code 를 1로 만들어 CI fail. R4W4 의 보고서에서 언급한
"사전 존재 unhandled rejection 1건은 `professor/dashboardHome/aggregate.ts:99`"
와 동일 가능성 높음.

해당 위치 (vitest 가 정확한 stack trace 출력 안 함) 추적 필요.

---

## 3. fix 방향 (참고)

### 3.1 set-state-in-effect 2건
- R4W1 의 rAF wrap 패턴 또는
- R4W2 의 `useSyncExternalStore` 패턴 (더 견고)

### 3.2 refs during render 2건
- `ref.current` 를 컴포넌트 본문에서 직접 read 하지 말고,
  `useEffect` 안에서 한 번 읽어 local state 또는 다른 ref 에 보관
- 또는 layout 측정 같은 sync read 가 정말 필요하면 `useLayoutEffect`

### 3.3 unhandled error 1건
- `aggregate.ts` 의 `Promise.allSettled` 결과를 `.filter()` 하기 전
  `Array.isArray()` 가드 또는 `?? []` fallback
- 비동기 cleanup 누락 (component unmount 후 setState 시도) 가능성도 점검

---

## 4. 영향 범위

본 PR 머지 차단 — 4 lint errors + 1 unhandled error 모두 해결 필요.

PR #89 의 fix commit (`e6d4d77`) 패턴 그대로 — fix 후 push 하면 동일
브랜치에 추가 commit 으로 쌓이고 CI 재실행.

---

## 5. 우선순위

베타 출시 차단 항목은 아니지만 **본 PR 자체는 차단**. 본 commit 으로 진단을
영구 기록한 뒤, 사용자 결정 후 fix commit 진행.
