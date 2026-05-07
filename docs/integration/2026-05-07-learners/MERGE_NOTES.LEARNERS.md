# MERGE_NOTES — feat/learners (2026-05-07)

> 워크트리: **feat/learners**
> 담당 화면: 교수자 학습자 관리 (`/professor/learners` 시리즈)
> 백엔드 의존성: `BACKEND_ASKS.LEARNERS.md` 참조

---

## 1. 추가된 파일

### 페이지 (App Router)
- `frontend/src/app/professor/learners/page.tsx` — 강의 선택 진입점
- `frontend/src/app/professor/learners/[lectureId]/page.tsx` — 학습자 보드(테이블 + 일괄 작업 + 검색·필터)
- `frontend/src/app/professor/learners/[lectureId]/[learnerId]/page.tsx` — 개별 학습자 상세

### 컴포넌트
- `frontend/src/components/professor/learners/LearnerTable.tsx`
- `frontend/src/components/professor/learners/ProgressBar.tsx`
- `frontend/src/components/professor/learners/RiskBadge.tsx`
- `frontend/src/components/professor/learners/BulkActions.tsx`
- `frontend/src/components/professor/learners/PrivacyNotice.tsx`
- `frontend/src/components/professor/learners/risk.ts` — `computeRisk`, `mergeLearnerRows`, `daysSince`
- `frontend/src/components/professor/learners/types.ts` — backend ↔ ui 타입 어댑터
- `frontend/src/components/professor/learners/useLearnersI18n.ts` — i18n 어댑터(아래 §2)

### i18n 패치
- `frontend/messages/_patches/learners.ko.json`
- `frontend/messages/_patches/learners.en.json`

### 테스트 (vitest)
- `frontend/__tests__/learners/risk.test.ts`
- `frontend/__tests__/learners/RiskBadge.test.tsx`
- `frontend/__tests__/learners/BulkActions.test.tsx`
- `frontend/__tests__/learners/LearnerTable.test.tsx`
- `frontend/__tests__/learners/index-page.test.tsx`
- `frontend/__tests__/learners/detail-page.test.tsx`

---

## 2. i18n 통합 — **필수 후속 작업**

본 워크트리는 작업 제약상 `frontend/src/contexts/I18nContext.tsx` 를 수정하지
않았습니다. 따라서 새 namespace patch (`_patches/learners.{ko,en}.json`)
가 다른 워크트리 (`useDemoI18n` 패턴 R2W1 통합 이전과 동일) 처럼 자체
어댑터 (`useLearnersI18n.ts`) 를 통해 로딩됩니다.

### 머지 시 권장 후속

`I18nContext.tsx` 에 두 줄 추가:

```ts
import learnersKo from "../../messages/_patches/learners.ko.json";
import learnersEn from "../../messages/_patches/learners.en.json";
// ...
const koPatches: Messages[] = [
  studentKo as Messages,
  demoKo as Messages,
  professorKo as Messages,
  marketingKo as Messages,
  learnersKo as Messages,    // ← 추가
];
const enPatches: Messages[] = [
  studentEn as Messages,
  demoEn as Messages,
  professorEn as Messages,
  marketingEn as Messages,
  learnersEn as Messages,    // ← 추가
];
```

추가 후 `useLearnersI18n` 어댑터는 `useProfessorI18n` 처럼 자동 prefix 만
처리하는 thin wrapper 로 단순화할 수 있습니다 (현재도 호출자 인터페이스는
동일하므로 무수정 마이그레이션 가능).

---

## 3. 데이터 소스 (백엔드)

| UI 요소 | 사용 endpoint | 비고 |
|---|---|---|
| 강의 선택 페이지 | `GET /api/courses` + `GET /api/courses/{id}/lectures` | 기존 |
| 학습자 보드 — 진행률 | `GET /api/v1/dashboard/{lectureId}/attendance` | 기존 |
| 학습자 보드 — 집중도/Q&A 카운트 | `GET /api/v1/dashboard/{lectureId}/engagement` | 기존 |
| 보드 CSV 내보내기 | `GET /api/v1/dashboard/{lectureId}/export/csv` | 기존 |
| 개별 학습자 진행/집중 | 위 두 endpoint 응답에서 `user_id` 슬라이스 | 기존 |
| 학습자별 Q&A 본문 | **부재** | BACKEND_ASKS §2.1 |
| 학습자별 평가 점수 | **부재** | BACKEND_ASKS §2.2 |
| 일괄 알림 발송 | **부재** | BACKEND_ASKS §3 |
| 위험 학생 서버 필터 | **부재** (현재는 클라이언트 계산) | BACKEND_ASKS §1.2 |

`mergeLearnerRows()` 가 attendance/engagement 두 응답을 user_id 기준으로
조립합니다 — 백엔드가 `GET /api/v1/lectures/{id}/learners` 같은 단일
엔드포인트를 제공하기 시작하면 그 한 함수만 교체하면 됩니다.

---

## 4. 학생 데이터 보호 정책 — 위반 0건 검증

### 정책 (출처: CLAUDE.md "핵심 차별점 4가지" + docs/planning/02-guardrails.md)

1. 광고 미사용 — UI 어디에도 광고/마케팅 토글·외부 공유 액션을 두지 않는다
2. 졸업 후 자동 삭제 — 정책을 교수자에게 매 페이지에서 노출
3. 교수자는 본인 강의 데이터에만 접근 — 백엔드 권한 체크에 위임 + UI 명시

### 본 PR 의 적용

- `PrivacyNotice` 컴포넌트가 인덱스/보드/상세 **모든 페이지에 노출** (3회)
- `BulkActions` 의 발송 액션은 학습 활동(시청 독려/격려) 두 종류로 한정 — 외부 공유나 광고 류 액션 슬롯 자체를 만들지 않음
- 일괄 작업 라벨은 `bulkSendNudge` / `bulkSendEncouragement` / `bulkExportSelected` 3개로만 구성
- `index-page.test.tsx` 의 마지막 테스트가 페이지 HTML 에 "광고/marketing/share to facebook/외부에 공유" 키워드가 등장하지 않음을 검증

### 회귀 방지

추후 학습자 화면에 액션을 추가할 때:
- "공유"/"내보내기" 류는 교수자 본인이 받는 CSV 만 허용
- 학생 식별 데이터를 학습 분석 외 목적으로 노출하는 액션은 보안 리뷰 대상
- 문구 추가 시 위 테스트의 forbidden 키워드 목록을 확장할 것

---

## 5. 절대 건드리지 않은 파일 (요청 제약 준수)

- `frontend/messages/ko.json`
- `frontend/messages/en.json`
- `frontend/messages/_patches/professor.{ko,en}.json`
- `frontend/src/components/Header.tsx`
- `frontend/src/contexts/I18nContext.tsx`
- 모든 백엔드 코드 (`backend/`)

확인 방법: 위 파일들에 대한 변경은 PR diff 에 0줄이어야 합니다.

---

## 6. DoD 체크리스트

- [x] `vitest run` — 새 6개 스펙 모두 통과 ([Verification 섹션 결과])
- [x] `next build` — 새 3개 라우트 컴파일 성공
- [x] 학생 데이터 보호 정책 위반 0건 (광고/외부 공유 UI 없음 — `index-page.test.tsx` 마지막 테스트로 lint)
- [x] i18n 키 한·영 동수 (각 56개)
- [x] ARIA: 정렬 헤더 `aria-sort`, 진행 바 `role="progressbar"`, 위험 뱃지 `aria-label`+`title`
- [x] 의미적 컬러(빨강·녹색)는 교수자 데이터 시각화에서만 사용 (`docs/planning/05-instructor-pages.md §1`)
