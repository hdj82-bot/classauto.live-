# MERGE_NOTES — feat/pricing-page (2026-05-07)

> 워크트리: **feat/pricing-page**
> 담당 화면: 공개 `/pricing` (Free/Basic/Pro 3-tier + 한도 비교표 + FAQ + 기관 라이선스)
> 백엔드 의존성: 없음 (Stripe Checkout 흐름은 기존 `/professor/subscription` 이 처리)

---

## 1. 추가된 파일

### 페이지 (App Router)
- `frontend/src/app/pricing/page.tsx` — 메타데이터 + `<PricingContent />` 래퍼

### 컴포넌트 (`frontend/src/components/pricing/`)
- `plans.ts` — **단일 진실의 원천**. `PLANS`, `PLAN_ORDER`, `formatKrw`. 정책 §2 가격과 §5.1 한도가 모두 이 파일에 박혀있고, 매트릭스 lint 테스트가 docs 와 비교한다.
- `usePricingHubI18n.ts` — patches 자체-import 어댑터 (legacy `useDemoI18n` 패턴)
- `PriceDisplay.tsx` — Pretendard tabular-nums 600 가격 한 줄
- `BillingToggle.tsx` — 월/연 결제 세그먼트 (연 결제 기본값)
- `PlanCard.tsx` — 3-tier 카드 (Basic 만 골드 강조)
- `LimitsTable.tsx` — 6행 × 3열 한도 매트릭스
- `LimitsModal.tsx` — "세부 한도 보기 ⓘ" 모달 (호출 플랜 컬럼 골드 강조)
- `FaqAccordion.tsx` — details 스타일 아코디언 (가드레일 관련 Q 2개 포함 보장)
- `EnterpriseSection.tsx` — 기관 라이선스 별도 섹션
- `PricingContent.tsx` — 8 섹션 합성 (`MarketingShell` 위에 렌더)

### i18n 패치
- `frontend/messages/_patches/pricingHub.ko.json`
- `frontend/messages/_patches/pricingHub.en.json`

### 테스트 (`frontend/__tests__/pricing/`)
- `plans-matrix.test.ts` — `02-guardrails.md` §5.1 + `01-pricing-policy.md` §2 → `plans.ts` + i18n patch lint
- `PlanCard.test.tsx` — 가격·하이라이트·CTA·세부 한도 모달 트리거
- `LimitsTable.test.tsx` — 6×3 셀 1:1 정확도
- `FaqAccordion.test.tsx` — 토글 동작 + 가드레일 Q 2개 존재
- `PricingPage.test.tsx` — 전체 페이지 합성 + 골드 채움 CTA 1개 정책 + localStorage 0건 정책

---

## 2. i18n 통합 — **필수 후속 작업**

본 워크트리는 작업 제약상 `frontend/src/contexts/I18nContext.tsx` 무수정.
`_patches/pricingHub.{ko,en}.json` 은 자체 어댑터 (`usePricingHubI18n`) 가
직접 import 한다 (legacy `useDemoI18n` / `useMarketingI18n` 패턴과 동일).

### 머지 시 권장 후속

`I18nContext.tsx` 에 두 줄 추가하면 본 어댑터를 thin wrapper 로 단순화 가능:

```ts
import pricingKo from "../../messages/_patches/pricingHub.ko.json";
import pricingEn from "../../messages/_patches/pricingHub.en.json";
// ...
const koPatches: Messages[] = [
  studentKo, demoKo, professorKo, marketingKo, pricingKo,
];
const enPatches: Messages[] = [
  studentEn, demoEn, professorEn, marketingEn, pricingEn,
];
```

호출자(컴포넌트) 시그니처는 변하지 않으므로 무수정 마이그레이션.

---

## 3. 정책 매트릭스 정합성

### 3.1 `plans.ts` ↔ `02-guardrails.md` §5.1

| 항목 | Free | Basic | Pro |
|---|:---:|:---:|:---:|
| 영상당 채팅 Q&A | 20건 | 100건 | 무제한 |
| 학생당 일일 Q&A | — | 30건 | 100건 |
| 학생당 월 Q&A 총량 | — | 500건 | 2,000건 |
| 학생 입력 글자 한도 | 500자 | 500자 | 500자 |
| 영상당 24h 동시 시청 | 30명 | 80명 | 무제한 |
| 학생당 동시 재생 | 1개 | 1개 | 1개 |

`__tests__/pricing/plans-matrix.test.ts` 가:
1. `docs/planning/02-guardrails.md` 본문에서 위 6행을 정규식 매칭 (정책 행 자체가 변하면 즉시 깨짐)
2. `PLANS.{free,basic,pro}.limits.*` 가 정확히 매칭되는지 검증
3. `pricingHub.ko.json` 의 `limitsTable.values.*.*` 표시 문자열도 6×3 = 18셀 모두 검증

### 3.2 `plans.ts` ↔ `01-pricing-policy.md` §2 (가격)

| | Free | Basic | Pro |
|---|---|---|---|
| 월 결제 | ₩0 | ₩19,000 | ₩45,000 |
| 연 결제 (월 환산) | ₩0 | ₩15,200 | ₩36,000 |
| 연간 절약 | — | ₩45,600 | ₩108,000 |
| 월 영상 생성 | 2편 | 8편 | 20편 |
| MAU | 30명 | 80명 | 150명 |
| 워터마크 | 포함 | 없음 | 없음 |

`plans-matrix.test.ts` 의 두 번째 describe 블록이 정책 본문에서 위 가격
행들을 정규식으로 매칭한다.

### 3.3 정책 변경 시 절차

1. `docs/planning/01-pricing-policy.md` 또는 `docs/planning/02-guardrails.md` 를 먼저 수정
2. `frontend/src/components/pricing/plans.ts` 의 숫자 갱신
3. `frontend/messages/_patches/pricingHub.{ko,en}.json` 의 `limitsTable.values.*` 와 가격 안내 문구 갱신
4. `__tests__/pricing/plans-matrix.test.ts` 의 정규식·기댓값 갱신 → 통과 확인

---

## 4. 디자인 시스템 준수

### 4.1 다크 + 골드 (요청 사양 + colors.md §3)

기존 `MarketingShell` (`frontend/src/components/marketing/MarketingShell.tsx`)
을 그대로 재사용 — 다크 베이스 (`#0A0A0A`) + 오로라 배경 + 상단 logo + locale
토글 + footer 까지 일관. `/use-cases`, `/trust`, `/security`, `/beta-apply`,
`/contact` 와 동일 chrome.

### 4.2 ⚠️ 디자인 문서 내부 모순 발견 (사용자 확인 요청)

`docs/design-system/colors.md` §1 표는 "메인 사이트 (랜딩·features·pricing)"
의 베이스를 **`#FAFAF7` 라이트** + 그라데이션 메쉬로 명시한다. 반면
`CLAUDE.md` 의 핵심 디자인 원칙 + 본 PR 의 사용자 브리프는 "메인 사이트는
다크 베이스 + 골드"라고 명시한다.

본 PR 은 **사용자 브리프 + CLAUDE.md + 코드베이스 사실** (이미 `MarketingShell`
이 다크로 구현되어 `/use-cases` 등 5개 마케팅 페이지를 호스트 중) 을 따라
다크 + 골드로 구현했다. 추후 둘 중 한 곳을 바로잡는 별도 PR 을 권장한다 —
가장 가벼운 정정은 `colors.md` §1 표의 "메인 사이트" 행을 "`#0A0A0A` 다크"
로 갱신하고 §8 매트릭스에서도 `pricing` 행의 베이스를 다크로 통일하는 것.

### 4.3 골드 채움 CTA 1개만 (colors.md §3)

`PricingPage.test.tsx` 의 마지막 테스트가 페이지 본문(header/footer 제외) 안에
**bg-amber-400 채움 + 비-outline** 인 a/button 요소가 정확히 1개 (Basic 카드의
"Basic 시작하기" CTA) 만 존재함을 검증한다. 추가로 골드를 도입하려면 outline
스타일 (`border-amber-400/...`) 을 사용해야 한다 — 본 PR 의 기관 라이선스 CTA·
세부 한도 보기 ⓘ·footer link 들이 모두 outline 또는 텍스트-only 골드.

(`MarketingShell` 의 topCta 도 `bg-amber-400` 이지만 chrome 영역으로 페이지
컨텐츠 정책에 포함하지 않는다.)

### 4.4 폰트 (typography.md §1)

가격 표시 (`PriceDisplay`, `LimitsTable` 셀, `LimitsModal`) 는 모두
`tabular-nums` (`fontVariantNumeric: "tabular-nums"` + Tailwind `tabular-nums`
유틸) 적용. Pretendard 본문 폰트는 root layout 에서 이미 로드 중.

### 4.5 동적 요소

- 카드 hover transition + 가격 토글 시 `transition-opacity 0.3s ease-out`
- 모든 transition 에 `motion-reduce:transition-none` 동반 (prefers-reduced-motion)
- localStorage 사용 0건 — `PricingPage.test.tsx` 마지막 테스트가 `setItem`
  호출을 monkey-patch 로 감시해 회귀 차단

---

## 5. Stripe 연동 (본 PR 범위 외)

- Free CTA → `/auth/signup` (회원가입)
- Basic / Pro CTA → `/professor/subscription` (기존 결제 흐름)
- 기관 라이선스 CTA → `/contact` (영업 폼)

`/professor/subscription` 은 Stripe Customer Portal + Checkout 으로 이미
연결되어 있어 (`frontend/src/app/professor/subscription/page.tsx`),
본 페이지의 CTA 는 라우팅만 담당한다.

---

## 6. 절대 건드리지 않은 파일 (요청 제약 준수)

- `frontend/messages/ko.json`, `frontend/messages/en.json`
- `frontend/messages/_patches/professor.{ko,en}.json`
- `frontend/src/components/Header.tsx` (이미 `nav.pricing` 키로 `/pricing` 링크 보유 — 본 PR 가 페이지를 채워 404 해소)
- `frontend/src/contexts/I18nContext.tsx`, `frontend/src/contexts/AuthContext.tsx`
- 백엔드 일체

---

## 7. DoD 체크리스트

- [x] `vitest run __tests__/pricing` — 5 파일, 46 테스트 모두 통과
- [x] `next build` — `/pricing` 라우트 정상 등록 ([Verification] 섹션 참조)
- [x] 정책 매트릭스 정확 일치 — `plans-matrix.test.ts` 가 docs 본문과 직접 grep 비교
- [x] FAQ 가드레일 Q 2개 포함 (학습 외 질문 / 자리비움)
- [x] 디자인 시스템 준수
  - [x] 다크 + 골드 (`MarketingShell` 호스트)
  - [x] 골드 채움 CTA 본문 1개 (Basic) — 자동 lint
  - [x] Pretendard tabular-nums (가격·한도 셀)
  - [x] 마스코트 미등장 (학습자 화면 전용 정책)
  - [x] localStorage 0건 — 자동 lint
  - [x] prefers-reduced-motion 지원 — 모든 transition 에 `motion-reduce:transition-none`
- [x] 기존 테스트 무회귀 (385/385 본 PR 와 무관한 사전 존재 unhandled rejection 1건은 dashboardHome/aggregate.ts:99 → 본 PR 미관여)
