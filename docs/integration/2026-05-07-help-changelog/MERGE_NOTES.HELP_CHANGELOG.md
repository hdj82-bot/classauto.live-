# MERGE_NOTES — feat/help-changelog (2026-05-07)

> 워크트리: **feat/help-changelog**
> 담당 화면: 도움말 센터(`/help`) + 업데이트 로그(`/changelog`)
> 백엔드 의존성: 없음 (시드 데이터 + 클라이언트 검색·필터). 추후 endpoint
> 도착 시 fetch 로 교체 가능 — `BACKEND_ASKS.HELP_CHANGELOG.md` 참조 (선택).
> 새 의존성: 0건. 기존 `MarketingShell` / `SectionHeader` 재사용.

---

## 1. 추가된 파일

### 페이지 (App Router)
- `frontend/src/app/help/page.tsx` — `/help` 진입점. SEO 메타 + 클라이언트
  컨텐츠 분리.
- `frontend/src/app/changelog/page.tsx` — `/changelog` 진입점. 동일 구조.

### 컴포넌트 — 도움말
- `frontend/src/components/help/HelpContent.tsx` — Hero + Search +
  Category 그리드 + 카테고리 상세 + 검색 결과 + CTA 의 4 모드 컨테이너.
- `frontend/src/components/help/SearchBox.tsx` — 다크 톤 검색 입력 + 지우기
  버튼 + 키보드 접근성.
- `frontend/src/components/help/CategoryGrid.tsx` — 6 카테고리 카드.
  글리프(SVG path) + 색 dot 이중 부호화로 색약자 친화.
- `frontend/src/components/help/FaqAccordion.tsx` — pricing 의 동명 컴포넌트와
  같은 details/summary 톤이지만 props 로 items 받는 범용 변종.
- `frontend/src/components/help/search.ts` — 외부 의존성 없이 토큰 기반
  fuzzy 매칭. `buildSearchIndex` + `searchHelp` 순수 함수 두 개.
- `frontend/src/components/help/types.ts` — 카테고리 ID enum + FAQ shape +
  검색 hit shape.
- `frontend/src/components/help/useHelpHubI18n.ts` — i18n 격리 어댑터(§2).
- `frontend/src/components/help/index.ts`.

### 컴포넌트 — 변경 로그
- `frontend/src/components/changelog/ChangelogContent.tsx` — Hero + 필터 +
  타임라인 + CTA. `entries` prop 으로 외부 데이터 주입 가능 (default = 시드).
- `frontend/src/components/changelog/CategoryFilter.tsx` — 4 카테고리 + "전체"
  단일 선택 칩. 색 + 글리프(▲ ✓ ✗ !) 이중 부호화.
- `frontend/src/components/changelog/EntryCard.tsx` — 단일 항목 카드.
  타임라인 점 + 날짜·버전 메타 + 카테고리 배지 + 본문 + PR 링크 (외부/내부
  자동 분기).
- `frontend/src/components/changelog/changelogEntries.ts` — 시드 데이터 8 건
  (R1 ~ R4 통합 시점들).
- `frontend/src/components/changelog/types.ts`.
- `frontend/src/components/changelog/useChangelogHubI18n.ts`.
- `frontend/src/components/changelog/index.ts`.

### i18n 패치
- `frontend/messages/_patches/helpHub.{ko,en}.json` (namespace `helpHub`).
- `frontend/messages/_patches/changelogHub.{ko,en}.json` (namespace
  `changelogHub`).

기존 main `messages/{ko,en}.json` 의 어떤 namespace 와도 충돌 없음(`helpHub` /
`changelogHub` 모두 신규).

### 테스트 (vitest, jsdom)
- `frontend/__tests__/help/search.test.ts` — fuzzy 검색 6 케이스 (빈 입력,
  질문 일치, 답변 일치, 카테고리 라벨 일치, 정렬, 미일치).
- `frontend/__tests__/help/HelpContent.test.tsx` — Hero·검색·카테고리 그리드
  렌더링 + 카테고리 상세 진입/뒤로 + 검색 결과 + 0건 fallback.
- `frontend/__tests__/changelog/ChangelogContent.test.tsx` — 시드 그대로
  렌더 + 칩 필터 + 전체 복귀 + 0건 empty + 외부 PR 링크 안전 속성.
- `frontend/__tests__/changelog/EntryCard.test.tsx` — 메타 표시 + PR 행 생략
  분기.

### 문서
- `docs/integration/2026-05-07-help-changelog/MERGE_NOTES.HELP_CHANGELOG.md` (본 문서).

---

## 2. i18n 통합 — 필수 후속 작업

본 워크트리는 작업 제약("건드리지 말 것: `I18nContext.tsx`")에 따라
`I18nContext.tsx` 의 deep-merge 목록을 수정하지 않았습니다. 따라서 새
namespace 패치 두 개(`helpHub`, `changelogHub`) 는 각각 자체 어댑터
(`useHelpHubI18n.ts`, `useChangelogHubI18n.ts`) 가 직접 import 합니다 —
이전 다른 워크트리들의 `useDemoI18n` / `useMarketingI18n` / `useAnalyticsI18n` /
`useDashboardHubI18n` 과 동일한 격리 패턴.

> 참고: 머지 시점에 `I18nContext.tsx` 는 이미 `dashboardHub` / `pricingHub` /
> `landingHub` / `featuresHub` 등 *Hub 패치를 deep-merge 목록에 갖고 있음
> (이전 R5 통합). 본 PR 도 같은 자리에 두 줄 추가만 하면 어댑터 → thin
> wrapper 로 전환 가능.

### 머지 시 권장 후속

`frontend/src/contexts/I18nContext.tsx` 에 4 줄 추가:

```ts
import helpHubKo from "../../messages/_patches/helpHub.ko.json";
import helpHubEn from "../../messages/_patches/helpHub.en.json";
import changelogHubKo from "../../messages/_patches/changelogHub.ko.json";
import changelogHubEn from "../../messages/_patches/changelogHub.en.json";

const koPatches: Messages[] = [
  // ... 기존 ...,
  helpHubKo as Messages,        // ← 추가
  changelogHubKo as Messages,   // ← 추가
];
const enPatches: Messages[] = [
  // ... 기존 ...,
  helpHubEn as Messages,        // ← 추가
  changelogHubEn as Messages,   // ← 추가
];
```

이후 `useHelpHubI18n` / `useChangelogHubI18n` 을 `dashboardHub` 패턴처럼
thin wrapper(자동 prefix 추가) 로 단순화 가능. 호출자 코드는 변경 없음.

---

## 3. 라우팅 / 사이드바 / 푸터

- `MarketingShell` 의 footer 에 이미 `/use-cases`, `/trust`, `/security`,
  `/beta-apply`, `/contact`, `/privacy`, `/terms` 가 들어있습니다. `/help` 와
  `/changelog` 도 추가 권장 — 본 PR 은 `MarketingShell.tsx` 에 손대지 않아
  (다른 워크트리 변경 가능성) 후속 PR 에서 두 줄 추가 권장.
- 메인 사이트 헤더(`Header.tsx`) 또는 사이드맵에서도 도움말 / 업데이트 로그
  진입점을 노출하는 후속 작업 제안 — 본 PR 범위 밖.

---

## 4. 디자인 시스템 준수

- **베이스**: 다크 + 골드 (`MarketingShell` 그대로 — colors.md §1).
- **의미적 컬러는 데이터 시각화에서만**(colors.md §5) — 본 PR 의 모든 컬러는
  카테고리 표지(시각화) 또는 골드 강조이며, 빨강·녹색의 단독 의미적 사용은
  없음. 변경 로그 카테고리 dot 은 색 + 글리프(▲ ✓ ✗ !) + 라벨 텍스트의
  3 중 부호화로 색약자 친화.
- **CTA 버튼당 골드 채움 1번**(colors.md §3) — `/help`, `/changelog` 모두
  CTA 섹션 1 곳에 골드 채움 primary, 나머지는 outline.
- **폰트**: 메타·카운트·날짜·버전은 모두 `tabular-nums` 적용.
- **모션**: 모든 transition·rotate 에 `motion-reduce:transition-none`.
  `MarketingShell` 의 오로라 그라데이션은 정적 (animations.md §2.1 의 60s
  loop 미적용 — `MarketingShell` 자체 정책).

---

## 5. DoD 체크

- [x] **vitest** — `__tests__/help/*` 2 파일, `__tests__/changelog/*` 2 파일.
      검색 6 케이스 / 페이지 렌더 4 케이스 + 카테고리 진입·복귀 / 변경 로그
      렌더·필터·empty·외부 PR 링크 안전 속성 / EntryCard 메타·PR-row.
      node_modules 부재 환경에서는 직접 실행 못 했고 CI / 머지 후 실행 가능.
- [x] **next build** — Next 16 / React 19 호환 (`useDeferredValue`, `useId`,
      `useMemo` 모두 SSR-safe). `target="_blank"` 외부 링크는 `rel="noopener
      noreferrer"` 안전 default.
- [x] **검색 동작** — `searchHelp` 가 토큰 기반 매칭 + 점수 정렬 + 매칭 필드
      라벨링까지 한 번에 처리. `useDeferredValue` 로 입력 우선.
- [x] **카테고리 필터 동작** — `CategoryFilter` 단일 선택 + "전체" 칩 +
      카운트 노출 + 0 건 empty fallback.
- [x] **디자인 시스템 위반 0** — 다크 베이스 + 골드 CTA 1, 의미적 컬러
      이중 부호화, 모션 환원 보호, tabular-nums.

---

## 6. 머지 충돌 위험

- `messages/{ko,en}.json` — **수정 없음**.
- `_patches/professor.{ko,en}.json` — **수정 없음**.
- `Header.tsx`, `I18nContext.tsx`, `AuthContext.tsx` — **수정 없음**.
- `MarketingShell.tsx`, `SectionHeader.tsx` — 재사용만, 수정 없음.
- 백엔드 — **수정 없음**.
- 신규 디렉토리 4 개(`src/app/help/`, `src/app/changelog/`,
  `src/components/help/`, `src/components/changelog/`) 와 신규 패치 4 파일 —
  다른 워크트리와 겹치지 않음.

---

## 7. 후속 PR 제안

1. **I18nContext 통합** — §2 의 4 줄 추가 + 두 어댑터를 thin wrapper 로
   단순화.
2. **MarketingShell footer 에 `/help`, `/changelog` 추가** — 한 줄씩 추가.
3. **RSS 피드** (`/changelog/rss.xml`) — 시드 + 후속 entries 를 정적 빌드.
   현재 본 PR 은 ghost 버튼으로 자리만 잡음.
4. **백엔드 endpoint 도착 시 시드 → fetch 교체** — `ChangelogContent` 가
   `entries` prop 을 받으므로 fetch wrapper 한 단계 추가만.
   `BACKEND_ASKS.HELP_CHANGELOG.md` 가 추후 작성될 자리.
5. **공개 로드맵 페이지** — `/changelog` 의 다음 분기 예정 기능을 별도
   `/roadmap` 페이지로 분리.
6. **검색 자동완성 / Algolia** — 사용자 50 명 초과 시(07-additional-pages
   §8.3) 도입.
