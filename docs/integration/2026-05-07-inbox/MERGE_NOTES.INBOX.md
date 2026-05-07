# MERGE_NOTES — feat/inbox (2026-05-07)

> 워크트리: **feat/inbox**
> 담당 화면: 교수자 Q&A 인박스 (`/professor/inbox`)
> 백엔드 의존성: `BACKEND_ASKS.INBOX.md` 참조

---

## 1. 추가된 파일

### 페이지 (App Router)
- `frontend/src/app/professor/inbox/page.tsx` — 인박스 진입점 (라이트 베이스 + 골드)

### 컴포넌트 (`frontend/src/components/professor/inbox/`)
- `FilterBar.tsx` — 좌측 강의 사이드바 + 상단 탭(3개 status) + 검색 + 정렬 + 미답변 토글
- `InboxList.tsx` — 중앙 Gmail-style 목록 + 행 단위 체크박스 (일괄 선택)
- `QAThread.tsx` — 우측 상세: 학생/강의/슬라이드 컨텍스트 + RAG 초안 + 클러스터링 + 교수자 확정 답변
- `AnswerComposer.tsx` — 답변 작성기 (RAG 초안 채택 / 다듬기 / 확정 전송)
- `BulkAnswerBar.tsx` — sticky 일괄 처리 바 + 확정 모달
- `inboxTypes.ts` — 도메인 타입 (`InboxItem`, `InboxFilters`, …)
- `inboxFilters.ts` — `applyFilters` / `sortItems` / `aggregateByCourse` 등 순수 함수
- `inboxApi.ts` — `/api/v1/inbox` → `dashboard fan-out` → mock 의 3단 fallback
- `inboxMock.ts` — i18n 키 기반 프리뷰 시드 (8건, 3개 status 골고루)
- `useInboxI18n.ts` — i18n 어댑터 (§2 참조)

### i18n 패치
- `frontend/messages/_patches/inbox.ko.json`
- `frontend/messages/_patches/inbox.en.json`

### 테스트 (vitest)
- `frontend/__tests__/inbox/inboxFilters.test.ts` — 필터/정렬/집계 (10 케이스)
- `frontend/__tests__/inbox/inboxApi.test.ts` — 3단 fallback + deferred 저장 (5 케이스)
- `frontend/__tests__/inbox/InboxPage.test.tsx` — 페이지 통합 (12 케이스)

총 **27 케이스 / 1.7s** PASS, `next build` 성공, ESLint 0 error.

---

## 2. i18n 통합 — **필수 후속 작업**

본 워크트리 작업 제약상 `frontend/src/contexts/I18nContext.tsx` 는 수정하지
않았습니다. 따라서 새 namespace patch (`_patches/inbox.{ko,en}.json`) 는
`useDemoI18n` / `useMarketingI18n` / `useLearnersI18n` 와 동일한 자체 어댑터
패턴 (`useInboxI18n.ts`) 으로 로딩됩니다.

### 머지 시 권장 후속

`I18nContext.tsx` 에 두 줄 추가:

```ts
import inboxKo from "../../messages/_patches/inbox.ko.json";
import inboxEn from "../../messages/_patches/inbox.en.json";
// ...
const koPatches: Messages[] = [
  studentKo as Messages,
  demoKo as Messages,
  professorKo as Messages,
  marketingKo as Messages,
  inboxKo as Messages,       // ← 추가
];
const enPatches: Messages[] = [
  studentEn as Messages,
  demoEn as Messages,
  professorEn as Messages,
  marketingEn as Messages,
  inboxEn as Messages,       // ← 추가
];
```

`inbox` 최상위 namespace 는 ko.json/en.json 어디에서도 사용되지 않으므로 충돌 없음. 추가 후 `useInboxI18n` 어댑터는 `useProfessorI18n` 패턴(자동 prefix 만 처리하는 thin wrapper)으로 단순화할 수 있습니다.

---

## 3. 데이터 소스 (백엔드)

| UI 요소 | 사용 endpoint | 상태 |
|---|---|---|
| 인박스 항목 리스트 | `GET /api/v1/inbox` | **미구현** — 1순위 백엔드 작업 (`BACKEND_ASKS.INBOX.md §1.1`) |
| 미구현 시 fallback | `GET /api/courses` + `GET /api/courses/:id/lectures` + `GET /api/v1/dashboard/:lecture_id/qa` | 기존, 정상 동작 |
| 단건 답변 확정 | `PATCH /api/v1/inbox/{id}/answer` | **미구현** (`§2.1`) — fallback: sessionStorage |
| 일괄 RAG 초안 확정 | `POST /api/v1/inbox/bulk-confirm` | **미구현** (`§2.2`) — fallback: sessionStorage |
| 강의별 미답변 카운트 | `GET /api/v1/inbox/aggregate` | **미구현** (`§3`) — fallback: 클라이언트 합산 |
| 답변 알림 발송 | (위 답변/일괄 endpoint 의 `notify` 플래그) | 백엔드 미구현 시 무시됨 |
| 인박스 진입 시 mock 사용 여부 | `inboxApi.list().deferred === true` | 페이지 상단에 베너 노출 |

`inboxApi.ts` 는 `404`/`501` 등의 backend 미구현 오류를 정상 흐름으로 처리하고
다음 단계로 자동 진행하도록 설계됨. 따라서 본 PR 머지 즉시 mock 데이터로 UI 평가
가능, 백엔드 도착 후에는 코드 수정 없이 자동으로 실데이터 경로로 전환됩니다.

---

## 4. 디자인 시스템 적합성

| 항목 | 결정 |
|---|---|
| 베이스 모드 | 라이트 (`bg-white` 카드 + `bg-gray-50` 배경) — `colors.md §1` |
| 시그니처 컬러 | 골드 (`amber-500`, `amber-50`/200 outline) |
| 의미적 컬러 | rose (액션·미답변 카운트), emerald (교수자 확정·정상) — 데이터 시각화 한정 (`colors.md §5`) |
| 폰트 | Pretendard (모든 텍스트), 숫자는 `tabular-nums` (`typography.md §1`) |
| 마스코트·이모지 | 사용 안 함 (교수자 영역) |
| 모션 | 100~150ms 짧은 transition + `motion-reduce:transition-none` (`animations.md §1.2`, §7) |
| 아이콘 | 본 PR 은 텍스트·배지 위주. 도입 시 `icons.md` 의 카테고리 매핑(`chat`, `document`) 사용 예정 |
| 그림자 | `shadow-sm` (카드), `shadow-lg` (sticky 일괄 바) — `colors.md §7` |

라이트 모드에서 골드는 `text-amber-800` / `bg-amber-50` 계열로 적용 (`colors.md §3`
의 라이트 배경 골드는 `#B88308`/`#FFE6A8` 톤 — Tailwind 의 amber-800/amber-50 와 매핑).

---

## 5. 페이지 동작 요약

```
┌─ 헤더: 제목 · 부제 · 우측 "전체 N건 · 미답변 M건" (tabular-nums)
├─ deferred 배너 (mock 모드일 때만)
├─ 12-col 그리드
│   ├─ 좌 (3): FilterBar
│   │     ├─ 강의별 사이드 (강의 카드 + 미답변 rose 배지)
│   │     ├─ 강의 영상 셀렉트 (활성 강의 선택 시)
│   │     ├─ 3-탭 (auto / needs / off-topic) + 카운트
│   │     └─ 검색 · 정렬 · 미답변 토글
│   ├─ 중 (5): InboxList
│   │     ├─ 전체선택 헤더
│   │     └─ 행: [✓] [상태 배지] [질문] [학생·강의·슬라이드] [상대시각]
│   └─ 우 (4): QAThread
│         ├─ 학생/강의/슬라이드 컨텍스트
│         ├─ RAG 초안 또는 out-of-scope 안내
│         ├─ 교수자 확정 답변 (있다면) + RAG 원본 토글
│         └─ AnswerComposer (RAG 채택 / 직접 작성 / 전송)
└─ sticky BulkAnswerBar (선택 1+ 시)
      ├─ 선택 카운트
      ├─ "검토 완료로 표시" (RAG 미사용)
      └─ "선택한 RAG 초안 모두 확정" → 모달 → 확정
```

---

## 6. 알려진 한계 / 후속 작업

1. **학생 이름·학번** — 현재 백엔드 dashboard fan-out 응답에는 user_id 없이 익명
   처리됨. mock 시드는 i18n 키로 학생 이름을 갖지만 실데이터 경로에선 "익명 학습자"
   로 표시. `BACKEND_ASKS.INBOX.md §1.1` 의 `student.name` 필드가 도착하면 자동 해소.

2. **슬라이드 썸네일** — 기획서 §6.3 에는 "학생이 본 슬라이드 미리보기" 가 있으나
   현재는 슬라이드 번호 칩 (`#3`, `#4-5`) 만 노출. 백엔드가 슬라이드 이미지 URL 을
   포함해 보내면 `QAThread` 의 `slide` 영역에 합성 (코드 변경 1곳, ~10줄).

3. **유사 질문 클러스터링** — Pro 기능. 시드 일부에 `similarQuestionCount` 만 있고
   클릭 시 "다음 강의 보강 추천 메모" 라우팅이 미구현. R3 에서 `/professor/lecture/:id/notes`
   페이지가 도착하면 연결 예정.

4. **알림(이메일/푸시) 발송** — `composer` 와 `bulk` 의 `notify` 플래그는 백엔드
   답변 endpoint 가 받기로 정의됨 (`BACKEND_ASKS §2.1`). 별도 엔드포인트 분리 안 함.

5. **`localStorage` 미사용** — CLAUDE.md 정책에 따라 `inboxApi` 의 deferred
   override 는 `sessionStorage` (탭 닫으면 휘발) + 메모리 fallback. 영속이 필요한
   경우에도 백엔드 도착이 답이라 의도적 설계.

6. **i18n 검색 매칭** — `applyFilters` 의 `search` 는 `question` + `aiDraft`
   문자열 contains. 학생 이름·강의명 검색은 `BACKEND_ASKS §1.2` 의 서버측 필터로
   넘기는 것이 효율적.

---

## 7. 충돌 가능성 (다른 워크트리)

- ✅ `messages/ko.json` / `en.json`: 미수정.
- ✅ `_patches/professor.{ko,en}.json`: 미수정.
- ✅ `Header.tsx`, `I18nContext.tsx`, `AuthContext.tsx`: 미수정.
- ✅ `professor/layout.tsx`: 미수정 (기존 `<main>` 안에 자연스럽게 들어감).
- ⚠️ Header 메뉴에 인박스 링크 추가는 **별도 PR 권장** (Header 가 머지 충돌 다발 영역).
  추후 추가 시 `t("nav.inbox")` 키와 함께 `_patches/professor.*` 또는 `messages/*` 에 추가.

---

## 8. 검증 결과

```
$ vitest run __tests__/inbox/
 Test Files  3 passed (3)
      Tests  27 passed (27)

$ NEXT_PUBLIC_API_URL=http://localhost:8000 next build
✓ Compiled successfully in 4.2s
✓ /professor/inbox  (Static, prerendered)

$ eslint src/**/inbox/**/*.{ts,tsx} __tests__/inbox/**/*.{ts,tsx}
(0 errors, 0 warnings)
```
