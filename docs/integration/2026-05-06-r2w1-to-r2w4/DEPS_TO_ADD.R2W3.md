# DEPS_TO_ADD — R2W3 (`feat/professor-onboarding`)

> 본 브랜치에서 도입한 새 npm 의존성: **없음.**

본 브랜치의 교수자 첫 사용 온보딩은 기존 의존성만으로 구현되었습니다.

| 영역 | 사용 라이브러리 | 출처 |
|---|---|---|
| UI 프레임워크 | `react`, `react-dom`, `next` | 기존 |
| 스타일 | Tailwind CSS 4 | 기존 |
| 모달 | `@/components/ui/Modal` | 기존 (재사용) |
| 토스트 | `@/components/ui/Toast` | 기존 (재사용) |
| API 호출 | `@/lib/api` (axios 래퍼) | 기존 (재사용) |
| i18n | `@/contexts/I18nContext` + 로컬 `useProfessorI18n` | 기존 |
| 테스트 | `vitest`, `@testing-library/react` | 기존 |

## 후속 작업에서 검토 필요 (NOT in this PR)

- 진행도 카운트업 애니메이션 (animations.md §2.2): 라이브러리 불필요 — 기존 패턴
  으로 직접 구현 가능 (`requestAnimationFrame`)
- 그라데이션 SVG 아이콘 (icons.md): 라이브러리 불필요 — 인라인 SVG `<defs>` 로
  처리 (W3 의 `OwlMascot.tsx` 와 동일 패턴)
- 캐러셀/드래그 정렬 (강좌 카드 정렬 등 후속 화면): 필요 시 `@dnd-kit/core`
  검토 — 본 브랜치 범위 외
