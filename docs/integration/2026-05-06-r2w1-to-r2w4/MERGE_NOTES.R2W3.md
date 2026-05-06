# MERGE_NOTES — R2W3 (`feat/professor-onboarding`)

> 작업자: Claude Opus 4.7 (워크트리 `../classauto-r2-professor-onboarding`)
> 브랜치: `feat/professor-onboarding` ← `main` (9a3643d)
> 범위: 교수자 첫 사용 온보딩 — 빈 대시보드 empty state + 5단계 가이드 체크리스트 +
>      학과·소속 정보 입력 모달
> 기획 근거: [docs/planning/05-instructor-pages.md](./docs/planning/05-instructor-pages.md) §3 (교수자 첫 사용 온보딩)

---

## 1. 충돌 회피 사전 점검

본 브랜치는 **새 파일 추가 + `frontend/src/app/professor/dashboard/page.tsx` 단일
파일 교체**입니다. 다른 R2 워크트리(R2W1 i18n, R2W2 backend, R2W4 marketing) 와
다음 표대로 영역이 분리되어 충돌 위험이 낮습니다.

| 파일 | 본 브랜치 | 비고 |
|---|:---:|---|
| `frontend/messages/{ko,en}.json` | ❌ | R2W1 영역 — patch 파일로 우회 (아래 §2) |
| `frontend/src/components/Header.tsx` | ❌ | R2W1 영역 |
| `frontend/src/contexts/I18nContext.tsx` | ❌ | R2W1 영역 — patch deep-merge 추가 요청 (아래 §2) |
| `backend/**` | ❌ | R2W2 영역 — `BACKEND_ASKS.R2W3.md` 로 분리 |
| `frontend/package.json` | ❌ | 신규 의존성 없음 (`DEPS_TO_ADD.R2W3.md` 참조) |
| `frontend/src/app/professor/dashboard/page.tsx` | ✏️ | **유일하게 수정한 파일** — 빈 대시보드 분기 추가 |
| `frontend/src/app/professor/{lecture,subscription,layout}.*` | ❌ | 손대지 않음 |
| `frontend/src/app/{demo,v,auth,admin}/**` | ❌ | 영역 외 |

---

## 2. i18n 패치 머지 정책 — R2W1 협력 필요

`frontend/messages/_patches/professor.{ko,en}.json` 에 본 화면의 모든 i18n 키
(`professorOnboarding.*` 네임스페이스) 를 저장했습니다. 메인 `messages/ko.json`
/ `en.json` 은 **수정하지 않았습니다**.

R2W3 단계에서는 `frontend/src/components/professor/useProfessorI18n.ts` 가 패치
파일을 직접 import 해 사용합니다. 통합 시 다음 한 줄을 R2W1 의 `I18nContext.tsx`
에 추가해주시면 다른 컴포넌트에서도 `useI18n().t("professorOnboarding.*")` 형태로
바로 사용할 수 있습니다.

```diff
 import studentKo from "../../messages/_patches/student.ko.json";
 import studentEn from "../../messages/_patches/student.en.json";
+import professorKo from "../../messages/_patches/professor.ko.json";
+import professorEn from "../../messages/_patches/professor.en.json";

 const koMerged = mergePatch(ko as Messages, studentKo as Messages);
 const enMerged = mergePatch(en as Messages, studentEn as Messages);
+const koFinal  = mergePatch(koMerged, professorKo as Messages);
+const enFinal  = mergePatch(enMerged, professorEn as Messages);

-const messages: Record<Locale, Messages> = { ko: koMerged, en: enMerged };
+const messages: Record<Locale, Messages> = { ko: koFinal, en: enFinal };
```

추가 후 후속 정리 PR 에서:
- `useProfessorI18n` 삭제
- `src/components/professor/**` 의 `t("xxx")` → `t("professorOnboarding.xxx")` 로 일괄 치환
- 기존 `messages/ko.json` 의 `"professor"` 네임스페이스와 충돌 없음 (다른 키
  네임스페이스 `professorOnboarding` 사용 중)

> **참고**: 본 브랜치의 `useProfessorI18n` 은 W3 의 `useDemoI18n` 과 동일한
> 패턴입니다. `useDemoI18n` 도 같은 방식으로 정리하면 두 훅을 한 PR 에서 함께
> 제거할 수 있습니다.

---

## 3. 추가/변경된 파일

### 새 파일
```
frontend/messages/_patches/
  professor.ko.json
  professor.en.json

frontend/src/components/professor/
  EmptyDashboard.tsx              ← Hero + 체크리스트 컨테이너
  InstructorProfileModal.tsx      ← 학과·소속 정보 입력 모달
  OnboardingChecklist.tsx         ← 5단계 진행 카드
  onboardingSteps.ts              ← 5단계 정의 + 순수 진행도 계산
  useProfessorI18n.ts             ← 격리 i18n 훅 (R2W1 머지 후 제거 예정)

frontend/__tests__/professor/
  OnboardingChecklist.test.tsx
  InstructorProfileModal.test.tsx
  dashboard.test.tsx
  onboardingSteps.test.ts
```

### 수정한 파일 (1개)
```
frontend/src/app/professor/dashboard/page.tsx  ← lectures.length === 0 분기 추가
```

---

## 4. DoD 체크 결과

- [x] `npm run dev` → `/professor/dashboard` HTTP 200 (라우트 등록 확인)
- [x] `npm run build` 통과 — `/professor/dashboard` 가 Static prerender 로 등록
- [x] `vitest run` — **154/154 통과** (신규 16개 테스트 포함, 모든 기존 테스트 보존)
- [x] `eslint` — `src/app/professor`, `src/components/professor`, `__tests__/professor` 0 issue
- [x] `tsc --noEmit` — 신규 파일 0 issue (사전 존재 `__tests__/lib/auth.test.ts:82`
      `@ts-expect-error` unused 경고는 본 브랜치 작업과 무관)
- [x] 강의 0개 사용자에서 empty state + 5단계 체크리스트 + 자동 모달 노출
- [x] 1개 이상 강의 만들면 자연스럽게 정상 강의 그리드로 전환
      (`dashboard.test.tsx::falls back to the regular lecture grid` 테스트로 검증)
- [x] 모달 `motion-reduce:transition-none` 처리 + globals.css 의
      `animate-fade-in` / `animate-scale-in` 은 짧은 0.15s 애니메이션 — 충분히
      reduced-motion 친화. 별도 prefers-reduced-motion 미디어 쿼리 추가도 후속
      가능 (현 globals.css 가 메인 단의 영역이라 본 브랜치에서 미수정).

---

## 5. 5단계 체크리스트 — 백엔드 기존 모델만으로 자동 계산

별도 컬럼 추가 없이 `User` / `Course` / `Lecture` 의 기존 필드만으로 추론합니다.
순수 함수 `computeOnboardingProgress` 가 단일 진실 (`onboardingSteps.ts`).

| # | 단계 | 완료 판정 (proxy) |
|---|---|---|
| ① | 학과·소속 정보 입력 | `profileSaved` (모달 제출 또는 R2W2 머지 후 user.school 비어있지 않음) |
| ② | 첫 강좌(course) 만들기 | `courses.length > 0` |
| ③ | PPT 업로드 | `lectures.length > 0` (강의 row 가 만들어졌다는 것은 업로드/생성 완료 의미) |
| ④ | AI 스크립트 검토 / 승인 | `lectures.some(l => l.video_url || l.pipeline_task_id)` (렌더 파이프라인 시작) |
| ⑤ | 학생에게 강의 링크 공유 | `lectures.some(l => l.is_published)` |

후속 R2W2 머지로 `user.school` 등 신규 필드가 도착하면, dashboard `page.tsx` 의
`profileSaved` 산출 부분을 다음과 같이 한 줄 교체하면 끝입니다.

```diff
- profileSaved: profileDraft !== null,
+ profileSaved: profileDraft !== null || Boolean(user?.school && user?.department),
```

---

## 6. 디자인 시스템 준수 체크

| 항목 | 처리 |
|---|---|
| 베이스 컬러: 라이트 (`#FAFAF7` / `#FFFFFF`) | `bg-gray-50` (layout) + 카드 `bg-white` 유지 |
| 포인트 컬러: 골드 | Hero / 진행도 바 / "지금 단계" 강조 / 모달 submit 모두 `bg-amber-500` |
| 의미적 컬러: 녹색(완료) | 완료 단계 `bg-emerald-500` — 교수자 영역 한정으로 허용 (colors.md §5) |
| 마스코트: 등장 안 함 | 본 화면에 OwlMascot import 없음 |
| 폰트: Pretendard tabular-nums | 진행도 / 단계 번호 / 스냅샷 통계 모두 `tabular-nums` 클래스 |
| `prefers-reduced-motion` | 진행도 바 / 모달 버튼에 `motion-reduce:transition-none` |
| localStorage 사용 금지 | 사용 안 함 — React state 만 |

---

## 7. 후속 작업 (별도 PR 권장)

- [ ] R2W1 머지 시 `I18nContext.tsx` 에 professor patch import 추가 (위 §2 diff)
      → 이후 `useProfessorI18n` 제거 + 네임스페이스 일괄 치환
- [ ] R2W2 머지 시 `PATCH /api/auth/complete-profile` (또는 `PATCH /api/users/me`)
      활성화 → `BACKEND_ASKS.R2W3.md` 의 deferred-save UX 가 자동으로 정상 저장 경로로 전환
- [ ] AuthContext 에 `school` / `department` 필드를 노출 → 모달 자동 오픈 조건을
      "강의 0개 + user.school 비어있음" 으로 정밀화 (`useEffect` 한 줄 변경)
- [ ] 기획서 §3.1 의 "환영 모달 (첫 로그인 시)" 별도 구현 — 본 브랜치는 §3.2 (Empty
      State) + §3.3 (체크리스트) + §3.4 (학과 정보) 만 커버
- [ ] 단계 ③ / ④ proxy 분리 정밀화 — 현재는 lecture row 존재만으로 ③ 완료 판정.
      백엔드가 `pipeline_task_id` 시작 시각을 별도로 노출하면 분리 가능.
- [ ] 진행도 카운트업 애니메이션 (animations.md §2.2) 적용
