# MERGE_NOTES — W3 (`feat/demo-page`)

> 작업자: Claude Opus 4.7 (워크트리 `../classauto-w3-demo`)
> 브랜치: `feat/demo-page` ← `main` (a8c40a3)
> 범위: `/demo` 페이지 구현 (베타 신청 전환의 핵심 체험 페이지)
> 기획 근거: [docs/planning/04-demo-page.md](./docs/planning/04-demo-page.md)

---

## 1. 머지 시 충돌 가능성 사전 점검

본 브랜치는 **새 파일만 추가**하고 다음 파일을 의도적으로 건드리지 않았으므로
W4(학생 진입 흐름) 등 다른 워크트리와의 충돌 위험이 매우 낮습니다.

| 파일 | 본 브랜치 | 이유 |
|---|:---:|---|
| `frontend/messages/ko.json` / `en.json` | ❌ | 패치 파일로 우회 (아래 §2) |
| `frontend/src/components/Header.tsx` | ❌ | 메뉴 추가 메모만 ([Header.W3.patch.md](./Header.W3.patch.md)) |
| `frontend/middleware.ts` | ❌ | 변경 필요 없음 (인증 없는 공개 페이지) |
| `frontend/src/app/layout.tsx` | ❌ | `/demo/layout.tsx` 격리 레이아웃 사용 |
| `frontend/package.json` | ❌ | 새 라이브러리 도입 없음 ([DEPS_TO_ADD.W3.md](./DEPS_TO_ADD.W3.md)) |
| `frontend/src/app/v/`, `frontend/src/app/auth/` | ❌ | W4 영역 (불가침) |
| `backend/**` | ❌ | 백엔드 의존도 없음 (mock 응답) |

---

## 2. i18n 패치 파일 머지 정책

`frontend/messages/_patches/demo.{ko,en}.json` 에 데모 페이지 전체 i18n 키를
저장했습니다. 메인 `messages/ko.json` / `en.json` 은 **수정하지 않았습니다**.

W3 단계에서는 `frontend/src/components/demo/useDemoI18n.ts` 가 패치 파일을
직접 import 해서 사용합니다.

머지 담당자는 다음 중 하나를 선택하세요.

### 옵션 A — 권장: 패치 파일 유지 + i18n 컨텍스트 확장 (별도 PR)

`I18nContext` 가 `messages/_patches/*.json` 도 자동 병합하도록 만들고
(`useDemoI18n` 제거 가능), 이후 모든 페이지가 동일한 패턴으로 격리 가능.

작업 범위(추정):
- `I18nContext.tsx` 의 `messages` 정의를 deep-merge 로 변경 (10줄)
- `messages/_patches/*.<locale>.json` 글롭 임포트 (Next 16의 정적 import 사용)
- `useDemoI18n` 삭제 후 `useI18n().t("demo.hero.headline2")` 형태로 일괄 치환

### 옵션 B — 즉시 머지: 패치 파일 내용을 본체에 합치기

```bash
# (의사 코드)
jq -s '.[0] * .[1]' frontend/messages/ko.json frontend/messages/_patches/demo.ko.json \
  > frontend/messages/ko.json.new && mv frontend/messages/ko.json.new frontend/messages/ko.json
# en.json 도 동일
git rm frontend/messages/_patches/demo.{ko,en}.json
```

이 경우 `useDemoI18n` 도 `useI18n` 으로 일괄 치환합니다. (sed 일괄 치환 가능)

---

## 3. 추가된 파일 목록

```
frontend/messages/_patches/
  demo.ko.json
  demo.en.json
  README.md

frontend/src/app/demo/
  page.tsx
  layout.tsx

frontend/src/components/demo/
  DemoCTAModal.tsx
  DemoFAQ.tsx
  DemoVideo.tsx
  FieldSelectCard.tsx
  OffTopicHint.tsx
  OwlMascot.tsx
  QASimulator.tsx
  demoTypes.ts
  useDemoI18n.ts

frontend/public/demo/
  social-science.poster.svg
  natural-science.poster.svg
  README.md

frontend/__tests__/demo/
  DemoPage.test.tsx
  FieldSelectCard.test.tsx
  QASimulator.test.tsx
  demoTypes.test.tsx
```

---

## 4. DoD 체크 결과

- [x] `npm run dev` 후 `/demo` 가 HTTP 200 으로 렌더 (실측 완료)
- [x] `npm run build` 통과 (Static prerender — Route /demo)
- [x] `vitest run` — **125/125 통과** (신규 데모 테스트 18개 포함)
- [x] `eslint` — `src/app/demo`, `src/components/demo`, `__tests__/demo` 0 issue
- [x] `tsc --noEmit` — 신규 파일 0 issue (사전 존재하던 `__tests__/lib/auth.test.ts:82` 의 `@ts-expect-error` unused 는 본 브랜치 작업과 무관)
- [x] 다크 모드 강제 (CSS 변수 오버라이드, 학습자 시점 시각 신호)
- [x] 반응형 — 모바일 / 태블릿 / 데스크톱 (lg breakpoint 기준)
- [x] 베타 CTA → `/beta-apply` (해당 페이지가 W5 단계에서 만들어지기 전까지는 404 가 정상)

---

## 5. 디자인 시스템 준수 사항

| 항목 | 처리 |
|---|---|
| 폰트: Pretendard + Paperlogy 만 사용 | Hero/H2 에 Paperlogy + tabular-nums (인라인 `style`). RootLayout 의 `Geist` 폰트 변수는 손대지 않음 — W4 단계에서 CDN 임베드 작업 권장 |
| 컬러: 다크 (`#0A0A0A`) + 골드 (`#FFB627`) + 그라데이션 메쉬 | 인라인 토큰으로 적용. 나중에 `globals.css` 의 `--gold` / `--bg-dark` 등 토큰을 도입하면 자연스럽게 마이그레이션 가능 |
| 마스코트: 회갈색 단색 올빼미, 학습자 영역에서만 등장 | `OwlMascot` SVG 컴포넌트 — CTA 모달에서 첫 등장 |
| RAG 범위 제한 차별점 시연 (Section 8) | `QASimulator` + `isOnTopic` 휴리스틱 + 거부 답변 UI 분기 |
| 무료 질문 3건 제한 (Section 10) | `DEMO_QUESTION_LIMIT = 3` 상수 + 한도 도달 시 CTA 변환 |
| `prefers-reduced-motion` 지원 | aurora 배경은 `60s` 매우 느린 무한 루프 — 기본 토글 가이드는 후속 작업 |

---

## 6. 후속 작업 (W3 → W4/W5)

- [ ] `/public/demo/social-science.mp4`, `natural-science.mp4` 실제 영상 추가
  - 추가 후 `DemoVideo.tsx` 의 `fetch HEAD` 가 자동으로 placeholder ↔ 실 영상 분기
- [ ] backend `/api/demo/qa` 연동 시 `QASimulator` 의 mock 응답 → 실 호출로 교체
  - 응답 형태는 `DemoAnswer` 타입에 이미 맞춰져 있음
- [ ] `/beta-apply` 페이지 (W5) 와 `/pricing` 페이지 작업
- [ ] Header 메뉴에 `/demo` 링크 추가 ([Header.W3.patch.md](./Header.W3.patch.md))
- [ ] Cloudflare Turnstile, Redis 세션 관리 (기획 Section 12)
- [ ] 인터스티셜 퀴즈, 1분 타임랩스 영상 (기획 Section 9, 14) — 본 PR 범위 외
