# MERGE_NOTES — feat/legal-pages (2026-05-07)

> 워크트리: **feat/legal-pages**
> 담당 화면: 이용약관 (`/terms`) + 개인정보처리방침 (`/privacy`) 실 콘텐츠
> 백엔드 의존성: 없음 (정적 마케팅 페이지).
> 시행 예정일 (placeholder): **2026-05-21** — 정식 시행 전 법무 검토 별도 진행.

---

## 1. 추가·교체된 파일

### 페이지 (App Router) — 기존 파일 교체
- `frontend/src/app/terms/page.tsx` — 기존 인라인 placeholder (10조항 light-mode) 를 server component + metadata 로 교체. 본체는 `TermsContent` 로 위임.
- `frontend/src/app/privacy/page.tsx` — 기존 인라인 placeholder (10항목 light-mode) 를 server component + metadata 로 교체. 본체는 `PrivacyContent` 로 위임.

### 컴포넌트 (`frontend/src/components/legal/`)
- `LegalShell.tsx` — 두 페이지가 공유하는 chrome (Hero + 메타 + 본문 8/12 + sticky TOC 4/12 + 변경 이력).
- `LegalSection.tsx` — 한 조항 표시 컴포넌트. `Block` 4종 (p / ol / ul / table) 분기.
- `TocSidebar.tsx` — sticky 목차 + IntersectionObserver 스크롤 스파이 + smooth-scroll anchor 점프.
- `ChangeLog.tsx` — 변경 이력 표.
- `TermsContent.tsx` / `PrivacyContent.tsx` — 페이지별 spec 주입 thin wrapper.
- `legalSections.ts` — 두 문서의 slug 순서 (`TERMS` / `PRIVACY`) + `sectionAnchorId` / `CHANGELOG_ANCHOR` helper.
- `types.ts` — `Block` / `SectionData` / `ChangeLogEntry` / `TocItem` / `DocumentSpec` 인터페이스.
- `useLegalI18n.ts` — i18n 어댑터 (§2 참조).

### i18n 패치
- `frontend/messages/_patches/legalHub.ko.json` — 본문 source-of-truth (한국어 정본).
- `frontend/messages/_patches/legalHub.en.json` — 영어 미러 (양쪽 동수 검증 회귀 테스트로 보장).

### 테스트 (vitest, 30 케이스 / 1.8s)
- `frontend/__tests__/legal/legalSections.test.ts` (10) — slug 순서 ↔ JSON 키 1:1, 조항 번호 1~14 / 1.~15. 매칭, 변경 이력 ISO 형식, ko/en 키 트리 동치.
- `frontend/__tests__/legal/TermsPage.test.tsx` (8) — 14 조항 + TOC 14+1 링크 + 클릭 scroll + scroll-spy + 변경 이력 행 1:1 + cross-link.
- `frontend/__tests__/legal/PrivacyPage.test.tsx` (12) — 15 항목 + TOC + cross-link + 핵심 정책 (광고 미사용 / 졸업 자동 삭제 / 24시간 데모 / 임베딩 / 9-row 위탁 표) 회귀.

총 **30 케이스 / 1.8s** PASS, `next build` 성공, ESLint 0 error.

---

## 2. i18n 통합 — **필수 후속 작업**

본 워크트리는 작업 제약상 `frontend/src/contexts/I18nContext.tsx` 를 수정하지
않았습니다. 따라서 새 namespace patch (`_patches/legalHub.{ko,en}.json`) 는
`useDemoI18n` / `useMarketingI18n` / `useFeaturesHubI18n` / `useInboxI18n` /
`useLearnersI18n` 와 동일한 자체 어댑터(`useLegalI18n.ts`) 로 로딩됩니다.

### 머지 시 권장 후속

`I18nContext.tsx` 의 patch 목록에 두 줄 추가:

```ts
import legalKo from "../../messages/_patches/legalHub.ko.json";
import legalEn from "../../messages/_patches/legalHub.en.json";
// ...
const koPatches: Messages[] = [
  studentKo as Messages,
  demoKo as Messages,
  professorKo as Messages,
  marketingKo as Messages,
  legalKo as Messages,    // ← 추가
];
const enPatches: Messages[] = [
  studentEn as Messages,
  demoEn as Messages,
  professorEn as Messages,
  marketingEn as Messages,
  legalEn as Messages,    // ← 추가
];
```

`legalHub` 최상위 namespace 는 ko.json/en.json/다른 패치 어디에서도 사용되지
않으므로 충돌 없음 (테스트로 검증됨). 추가 후 `useLegalI18n` 어댑터는
`useProfessorI18n` 처럼 자동 prefix 만 처리하는 thin wrapper 로 단순화 가능.

> **메모**: namespace 이름은 `legal` 이 아니라 `legalHub`. 다른 워크트리가
> 향후 `/legal/*` 라우트나 `/help` 의 법무 섹션을 도입했을 때 의미 충돌을 피하기
> 위함입니다.

---

## 3. 라우트 결정 — `/terms` `/privacy` 유지, sitemap 정정

`docs/planning/03-sitemap.md §2.1` 의 표기는 `/legal/terms` `/legal/privacy`
였으나 실제 코드 라우트는 `/terms` `/privacy` 입니다. 두 옵션을 검토했습니다.

| 옵션 | 작업량 | 외부 영향 |
|---|---|---|
| A. 라우트를 `/legal/*` 로 옮기고 redirect 추가 | 페이지 이동 + `next.config.ts` redirect 2개 + 외부 링크 갱신 | MarketingShell 푸터, TrustContent, 검색엔진 인덱스, 외부 SNS 카드 모두 깨짐 |
| **B. (채택) 라우트는 그대로 두고 sitemap 표기 정정** | sitemap 1줄 수정 | 영향 없음 |

옵션 B 채택 — 본 PR 에 함께 묶었습니다 (`docs/planning/03-sitemap.md` 변경 이력 추가). MarketingShell 의 푸터와 `TrustContent` 가 이미 `/terms` `/privacy` 를 참조하므로 코드 측 일관성도 우선 확보.

후속 PR 으로 SEO 친화 / 의미적 그룹화 목적의 `/legal/*` 도입을 검토할 경우, `next.config.ts` 의 `async redirects()` 로 `/legal/terms → /terms`, `/legal/privacy → /privacy` permanent redirect 를 추가하면 됩니다.

---

## 4. 콘텐츠 정합 (기획 문서 ↔ 약관 / 처리방침)

| 기획 문서 | 본 문서 §  | 핵심 정합 포인트 |
|---|---|---|
| `01-pricing-policy.md §4` (결제·해지) | `Terms §9, §10` | Free/Basic/Pro 3 플랜, 7일 환불, 60일 데이터 보존, 베타 평생 30 % 할인, Pro→Basic 학생 80명 유예 정책을 그대로 반영 |
| `02-guardrails.md §3-§6` (4중 가드레일) | `Terms §6, §12` | RAG 임계값 0.7 회피 금지, 1시간 20건 폭주 / 0.5초 호출 / 동시 재생 1개 우회 행위 → 24시간 자동 차단 (영구 차단 아님) 명시 |
| `02-guardrails.md §7` (데모 데이터) | `Privacy §10` | 24시간 자동 삭제, 익명화 후 모델 개선, IP/fingerprint 30일 폐기를 1:1 반영 |
| `06-student-pages.md §4.3` (학생 데이터 사전 고지) | `Terms §8`, `Privacy §9` | 광고 미사용, 해당 강의 교수자만 학습자 단위 조회, 졸업 후 자동 삭제, 만 14세 미만 보호자 동의 절차 |
| `07-additional-pages.md §2` (`/trust`) | `Privacy §9, §11, §14` | TLS 1.3, AES-256, RBAC, KISA 가이드라인, 침해사고 72시간 통지, KOPICO/KISA 신고 채널 안내 |
| README §주요 기능 9개 | `Terms §4` | PPT 파이프라인 / 평가 / 학습 세션 / 집중도 / RAG / 구독 / 번역 / 다국어 UI / 대시보드를 그대로 9 항목 ul 로 인용 |
| CLAUDE.md "핵심 차별점 4가지" | `Privacy §9` "특별 보호" | "RAG 범위 제한 Q&A · 비용 투명성 · 부정행위 방지 · 학생 데이터 보호" 의 학생 데이터 보호 조항을 처리방침의 시행 형태로 명문화 |

후속 PR 에서 가격 정책이 변경되면 `Terms §9` 와 `Privacy §10` 도 동시에 갱신해야 합니다 — 본 PR 은 기획서와 1:1 매칭으로 작성되어 일치 여부를 회귀 점검하기 쉽도록 준비했습니다.

---

## 5. 디자인 시스템 적합성

| 항목 | 결정 |
|---|---|
| 베이스 모드 | 다크 (`bg-[#0A0A0A]`) — `MarketingShell` 그대로 사용 (`colors.md §1`) |
| 시그니처 컬러 | 골드 (`amber-300/400`) — eyebrow, TOC active, 변경 이력 날짜, cross-link |
| 의미적 컬러 | 사용 안 함 (법무 페이지는 무채색 + 골드 점) |
| 폰트 | Pretendard (전역) + tabular-nums (날짜·번호) |
| 마스코트 / 이모지 폰트 | 사용 안 함 |
| 모션 | TOC active 전환 + smooth scroll. `motion-reduce:transition-none` 일관 |
| 표 | 골드 outline + dark surface — 위탁 사업자 / 보유 기간 표는 모바일에서 horizontal scroll |
| 그림자 | 사용 안 함 — 다크 모드 밀도 우선 |

**골드 사용 카운트 (페이지당 ≤ 5 — `colors.md §3`)**:
1. Hero eyebrow (`text-amber-400`)
2. 본문 섹션 number (`text-amber-400/80`)
3. TOC active 항목 (`bg-amber-400/10 ring-amber-300/30`)
4. 변경 이력 날짜 (`text-amber-300/90`)
5. Cross-link / placeholder banner outline (`border-amber-400/25`)

랜딩·features 와 일관된 톤. 학습자 / 교수자 영역과 시각적 충돌 없음.

---

## 6. 페이지 구조

```
[MarketingShell]
└─ <main>
    └─ Hero (제목 / 부제 / 시행일·갱신일 / 베타 placeholder banner)
    └─ 12-col grid
        ├─ <article> 8/12  body
        │   ├─ §1~14 (terms) 또는 §1~15 (privacy)
        │   ├─ ChangeLog
        │   ├─ Cross-link bar (다른 문서 / trust / security / home)
        │   └─ 회사 정보 (placeholder grid)
        └─ <aside> 4/12 sticky TOC
            ├─ 14 또는 15 anchor 링크
            └─ 변경 이력 anchor (구분선 위)
```

ScrollSpy 구현:
- 본문 각 `<section id="...">` 에 `scroll-mt-24` 로 Anchor 점프 시 sticky 헤더 (14h) 와 겹치지 않도록 보정.
- IntersectionObserver `rootMargin: 0px 0px -65% 0px` — 위쪽 35% 지점에 도달한 섹션을 active 로 채택 (시각적으로 가독 영역 상단 기준).

---

## 7. 알려진 한계 / 후속 작업

1. **회사 정보 placeholder** — `[PLACEHOLDER] (주)ClassAuto`, 대표·주소·사업자등록번호 모두 시행 전 후속 PR 로 채워질 예정. Hero 의 `placeholderNotice` 배너에 명시.

2. **법무 검토 별도** — 본 PR 은 표준 SaaS 약관·처리방침 + ClassAuto 의 학생 데이터 보호·가드레일 정책을 반영한 *초안*입니다. 시행 (`2026-05-21`) 전에 외부 변호사 / LegalZoom Korea 의 검토를 받을 예정.

3. **학생용 별도 약관** — 기획서 §6.2 가 "학생용·교수자용·기관용 분리 가능" 을 언급. 현재는 단일 약관으로 통합. 학생 측 진입 흐름 (`/v/[강의ID]`) 의 사용 패턴을 한 학기 운영해 본 뒤 분리 여부 결정.

4. **만 14세 미만 동의 절차의 UI 구현** — `Terms §5`, `Privacy §9` 가 별도 보호 절차를 명문화했지만 실제 UI/백엔드는 후속 PR (R6 학생 가입 흐름 보강) 에 정의되어 있어 본 워크트리에는 미포함.

5. **`/terms` `/privacy` 의 영문 SEO** — `metadata` 가 한국어 위주. Phase 5 글로벌화 (`/en/terms` 등) 시 `metadata.alternates.languages` 추가 필요.

6. **변경 이력 업데이트 운영 절차** — 약관 / 처리방침 변경 시 `legalHub.{ko,en}.json` 의 `changeLog` 배열에 한 줄 push + `lastUpdated` 갱신. 회귀 테스트가 양쪽 동수·ISO 형식을 검증하므로 비대칭 변경은 CI 에서 즉시 감지.

7. **법령 신고 기관 전화번호 변경 가능성** — KOPICO (1833-6972), KISA (118), 사이버수사 (1301), 사이버수사국 (182) 은 현행 (2026-05) 기준. 변경 시 `Privacy §14` 갱신.

---

## 8. 충돌 가능성 (다른 워크트리)

- ✅ `messages/ko.json` / `en.json`: 미수정.
- ✅ `_patches/professor.{ko,en}.json`: 미수정.
- ✅ `Header.tsx`, `I18nContext.tsx`, `AuthContext.tsx`: 미수정.
- ✅ `globals.css`, `tailwind.config.ts`: 미수정.
- ✅ 백엔드 일체: 미수정.
- ⚠️ `frontend/src/app/terms/page.tsx` / `frontend/src/app/privacy/page.tsx`: 기존 placeholder 를 **전면 교체**. 머지 시 다른 워크트리가 동일 파일을 수정했다면 본 PR 의 server-component + LegalShell 형태 로 우선 정렬.
- ⚠️ `docs/planning/03-sitemap.md`: §2.1 + §6 변경 이력 두 줄 수정. 다른 워크트리가 sitemap 을 수정 중이면 머지 충돌 가능 — 본 PR 의 정정은 코드 정합 / SEO 안정성 측면에서 우선 적용 권장.

---

## 9. 검증 결과

```
$ vitest run __tests__/legal/
 Test Files  3 passed (3)
      Tests  30 passed (30)

$ NEXT_PUBLIC_API_URL=http://localhost:8000 next build
✓ Compiled successfully in 6.3s
✓ /terms    (Static, prerendered)
✓ /privacy  (Static, prerendered)

$ eslint src/app/terms/** src/app/privacy/** src/components/legal/** __tests__/legal/**
(0 errors, 0 warnings)
```

DoD 항목 전체 충족:
- vitest ✓ — 30/30
- next build ✓ — 두 라우트 정적 prerender
- 디자인 시스템 위반 0 — `colors.md §3` (페이지당 골드 5곳 이내), `typography.md §1` (Pretendard + tabular-nums), 마스코트 미사용
- **14~15 조항** ✓ — Terms 14 + 변경 이력, Privacy 15 + 변경 이력
- **변경 이력** ✓ — 두 문서 모두 `2026-05-21 시행` 한 줄, 향후 자동 회귀 검증
- **갱신 날짜** ✓ — `lastUpdated 2026-05-07`, `effectiveDate 2026-05-21` 양 페이지 노출
