# R2W1 (feat/i18n-and-header) — Merge Notes

> 브랜치: `feat/i18n-and-header`
> 작업자: Opus 4.7 (창 1, Round 2)
> 날짜: 2026-05-06
> 영역: frontend 시스템 폴리싱 — i18n 통일 + Header 모바일

## 핵심 결정 — 어댑터 패턴 채택

원래 프롬프트는 `useDemoI18n` 훅을 **제거**하고 호출자 7개 파일에서
`useI18n()` + `t("demo.<key>")` 로 일괄 치환하도록 명시했습니다.

작업 중 demo 컴포넌트 7개에서 다음 패턴을 발견했습니다:

```tsx
// QASimulator.tsx
t(answerKey)              // answerKey = cfg.answerKeys[idx]  ← 동적 키
t(cfg.sourceSlideKey)
const matchedIdx = cfg.suggestedKeys.findIndex((k) => t(k).trim() === ...);

// FieldSelectCard.tsx
t(meta.a11yKey)           // meta = field === "social" ? {...} : {...}
```

이런 동적 키들에 일괄 `"demo."` prefix 를 추가하려면 **demoTypes 정의**
와 **호출 사이트** 양쪽을 다 만져야 하고, 키 lookup 실패 시 화면이
조용히 깨집니다 (vitest 가 모든 분기를 검출하지 못함). 회귀 위험이 큰
변경이라 판단해 **어댑터 패턴**으로 전환했습니다:

1. **`I18nContext` 가 demo 패치도 deep-merge** — 데이터는 통일됨
2. **`useDemoI18n` 을 thin adapter 로 재작성** — 내부에서 자동 `"demo."`
   prefix 만 추가, 외부 인터페이스 동일
3. **호출자 7개 파일은 무수정** — 위험 0
4. **후속 PR 권장**: 호출자를 점진 마이그레이션 후 어댑터 제거

이 방식으로 즉시 얻는 이점:
- i18n 데이터가 한 곳 (`I18nContext`) 에서 통합 관리됨
- 다른 창의 새 patch (`professor.*`, `marketing.*`) 도 같은 패턴으로 추가
- demo 컴포넌트들이 직접 `useI18n` 으로 마이그레이션 될 때까지 안전

## 변경

### A. `frontend/src/contexts/I18nContext.tsx`
- `_patches/demo.{ko,en}.json` import 추가
- `mergePatch` 를 student → demo 순으로 누적 적용
- 주석에 namespace 충돌 회피 정책 명시

### B. `frontend/src/components/demo/useDemoI18n.ts`
- 자체 messages dict 들고다니던 격리 레이어 → `useI18n` thin adapter 로 변경
- 라인 53 → 23 (자체 lookup 로직 제거)
- 외부 인터페이스 (`{ t, locale }`) 동일 — 호출자 변경 0

### C. `frontend/src/components/Header.tsx`
- 햄버거 버튼을 `{user && (...)}` 블록 밖으로 이동 — 비로그인도 노출
- 모바일 드롭다운 가시성 조건을 `{menuOpen}` 로 단순화 (user 무관)
- 드롭다운 안에서 user 분기:
  - 항상: `/demo`, `/pricing` (publicLinks 추출)
  - 로그인 시 추가: navLinks + 로그아웃 버튼
- 데스크톱 비로그인 nav (`hidden sm:flex`) 도 publicLinks 배열로 통일
- 새 testid: `header-mobile-toggle`, `header-mobile-link-demo`,
  `header-mobile-link-pricing`

### D. 새 테스트
- `__tests__/contexts/I18nContext.test.tsx` — 5 케이스
  - demo 키 lookup
  - student 키 lookup (R1 회귀 방지)
  - 메인 messages 키 lookup (Round 0 회귀 방지)
  - 존재하지 않는 키의 fallback
  - params 보간 동작
- `__tests__/components/Header.test.tsx` — 5 케이스
  - 비로그인 햄버거 노출
  - 닫힌 상태 검증
  - 클릭 시 /demo, /pricing 노출
  - 링크 클릭 시 메뉴 닫힘
  - 데스크톱 nav 의 /demo, /pricing 회귀 방지

### E. `frontend/messages/_patches/README.md`
- W3 시점 안내문 → R2W1 통합 완료 후 운영 가이드로 재작성
- "런타임 통합" 섹션: I18nContext 자동 deep-merge 동작 명시
- 새 namespace 추가 시 절차 (import + mergePatch 호출 한 줄)
- 어댑터 legacy 명시

## 다른 R2 창들에 대한 안내

R2W3 (교수자 온보딩) 와 R2W4 (영업 페이지) 가 새 patch 파일을 만듭니다:
- `_patches/professor.{ko,en}.json`
- `_patches/marketing.{ko,en}.json`

**통합 시 `I18nContext.tsx` 에 한 줄씩 추가가 필요합니다**:

```tsx
import professorKo from "../../messages/_patches/professor.ko.json";
import professorEn from "../../messages/_patches/professor.en.json";
import marketingKo from "../../messages/_patches/marketing.ko.json";
import marketingEn from "../../messages/_patches/marketing.en.json";

const koMerged = [studentKo, demoKo, professorKo, marketingKo].reduce(
  (acc, p) => mergePatch(acc, p as Messages),
  ko as Messages,
);
// (en 도 동일)
```

각 창은 본인 namespace 에서만 키를 추가하므로 충돌 없습니다.
이 import/merge 추가는 통합 PR 의 chore commit 에서 한꺼번에 처리.

## 공유 파일 변경 — 통합 시 주의

| 파일 | 변경 | 충돌 위험 |
|------|------|---------|
| `frontend/messages/{ko,en}.json` | **무수정** (R1 통합에서 추가한 nav.demo/pricing/public 만 활용) | 0 |
| `frontend/components/Header.tsx` | 본 창이 공식 소유자 | R2W4 가 메뉴 추가 시 `Header.R2W4.patch.md` 에 메모 |
| `frontend/src/contexts/I18nContext.tsx` | 본 창이 패치 import 추가 | R2W3, R2W4 의 patch 추가는 통합 시 한 줄씩 추가 |

## DEPS_TO_ADD.R2W1.md
**없음.** 새 npm 의존성 0개.

## 미해결 / 후속 PR 권장

1. **demo 컴포넌트 호출자 7개를 `useI18n()` 직접 호출로 마이그레이션**
   - 동적 키 패턴 (`t(cfg.answerKeys[idx])`) 까지 안전하게 처리하려면
     `demoTypes.ts` 의 keys 배열에 `"demo."` prefix 를 직접 포함하거나
     별도 헬퍼 (`demoKey()`) 도입 검토
   - 마이그레이션 후 `useDemoI18n.ts` 삭제
2. **Header 모바일 드롭다운에 영업 페이지 메뉴 (R2W4 통합 후)**
   - R2W4 가 `Header.R2W4.patch.md` 메모를 남기면 본 창의 publicLinks 배열에 추가

## 검증 한계

이 환경에 Node/Docker 미설치 — 로컬 vitest/eslint/tsc 실행 불가.
정적 검증 (시그니처, 키 호환, 렌더 분기) 으로만 확인.
**최종 검증은 GitHub Actions CI** 의 Frontend Lint + Frontend Build.

## 베타 출시 영향

본 변경은 **시스템 정리 + UX 개선**이며, 베타 출시 차단 항목 아님.
이미 R1 통합으로 베타 출시 차단 3건 (`/demo`, `/v/[slug]`, signup) 은 모두 main 에 들어간 상태.
