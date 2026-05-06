# 2026-05-06 — R2W1~R2W4 병렬 통합 (Round 2)

Round 1(W1~W4) 통합 후 미룬 폴리싱 + 다음 우선순위(교수자 온보딩 / 영업·신뢰 페이지)를 4창 병렬로 진행한 결과를 main에 통합한 기록.

## 통합한 브랜치

| 창 | 브랜치 | 커밋 | 영역 |
|---|------|------|------|
| R2W1 | `feat/i18n-and-header` | f2f55af | frontend — i18n 통합 (`I18nContext` deep-merge) + Header 모바일 햄버거 비로그인 확장 |
| R2W2 | `feat/lecture-public-fields` | ed99a98 | backend — `LecturePublicResponse` 에 `professor_name`/`course_name`/`duration_sec` + `complete-profile` 가 `name`/`locale` 옵셔널 수용 |
| R2W3 | `feat/professor-onboarding` | aee090f | frontend — `/professor/dashboard` empty state + 5단계 체크리스트 + 학과·직위 모달 |
| R2W4 | `feat/marketing-pages` | 0814210 | frontend — `/use-cases` `/trust` `/security` `/beta-apply` `/contact` 5종 |

## 머지 결과

**모든 머지 충돌 0건.** Round 1과 동일하게 영역 분리가 잘 되어 자동 머지로 통과.

```
main (9a3643d) ← R1 통합 후 시작점
 ├─ Merge R2W1   7f /  +443 / -133
 ├─ Merge R2W2   7f /  +675 / -9
 ├─ Merge R2W3  15f / +1806 / -57
 ├─ Merge R2W4  30f / +3237
 └─ chore(integration) ... ← 통합 PR HEAD
```

## 통합 패스에서 처리한 항목

### A. i18n 시스템 4 patch 통합
- `frontend/src/contexts/I18nContext.tsx` — `professor.{ko,en}.json`, `marketing.{ko,en}.json` 추가 import
- `mergePatch` 호출을 reduce 패턴으로 정리 (배열에 patch 추가만 하면 자동 적용)
- 결과적으로 본 파일에서 `t("professorOnboarding.<key>")`, `t("marketing.<key>")`, `t("demo.<key>")`, `t("student.<key>")` 모두 직접 lookup 가능

### B. 어댑터 훅 정리
- `frontend/src/components/professor/useProfessorI18n.ts` — 자체 dict 들고 다니던 격리 레이어 → `useI18n` thin wrapper (자동 `"professorOnboarding."` prefix). R2W1 의 `useDemoI18n` 과 같은 패턴.
- `frontend/src/components/marketing/useMarketingI18n.ts` — **그대로 유지**. 이 훅은 일반 `t()` 외에 `tValue<T>()` (배열/객체 직접 반환) 헬퍼를 제공해서 thin wrapper 변환 시 회귀 위험. 후속 PR에서 정리 권장.

### C. Header `nav` 키 6개 추가 + marketing 메뉴 통합
- `frontend/messages/{ko,en}.json` — `nav.useCases`, `nav.trust`, `nav.security`, `nav.betaApply`, `nav.contact` 추가
- `frontend/src/components/Header.tsx`:
  - 데스크톱 nav: `corePublicLinks` (`/demo`, `/pricing`, `/beta-apply`) — 핵심 진입로만
  - 모바일 드롭다운: `corePublicLinks + extendedPublicLinks` (`/use-cases`, `/trust`, `/security`) — 마케팅 페이지 풀세트
  - `/beta-apply` 는 amber 강조 (CTA 성격)
  - `Header.R2W4.patch.md` 권장사항 적용

### D. 노트 이관
- 9개 `MERGE_NOTES.*` / `DEPS_TO_ADD.*` / `BACKEND_ASKS.*` / `Header.R2W4.patch.md` 모두 본 디렉토리로 이동
- 본 README.md 가 통합 요약

## 의도적으로 미룬 항목

### 어댑터 훅 호출자 마이그레이션 (별도 PR)
- `useDemoI18n` (Round 1 통합 후 thin wrapper)
- `useProfessorI18n` (R2 통합으로 thin wrapper)
- `useMarketingI18n` (자체 dict 유지 — `tValue` 헬퍼 때문)
- 호출자들을 `useI18n() + t("<scope>.<key>")` 직접 호출로 점진 마이그레이션 후 세 훅 모두 제거 권장

### BACKEND_ASKS.R2W3 4건 (별도 PR)
- AuthContext 확장 (`user.school` / `user.department` 노출 → 모달 자동 오픈 조건 정밀화)
- `users.locale` 컬럼 + alembic 마이그레이션 (현재는 로깅만)
- 환영 모달 (첫 로그인 시 단발성) — 기획 §3.1
- `POST /api/v1/lectures/{slug}/redeem-code` (학습 코드 진입로) — Round 1 BACKEND_ASKS.W4 §4 와 동일 항목, 별도 PR 권장

### BACKEND_ASKS.R2W4 (별도 PR)
- `POST /api/marketing/beta-apply` 엔드포인트 (현재 frontend 모의 제출)
- `POST /api/marketing/contact` 엔드포인트
- captcha (Cloudflare Turnstile 등)
- 트랜잭션 메일 발송 (관리자/지원자 양쪽)

### Round 1 의 미해결 항목 (이전 노트 인용)
- `AVATAR_VOICE_FEATURE_ROADMAP` Sprint A/B/C — 별도 스프린트 권장
- i18n 통일을 위해 호출자 점진 마이그레이션 (위 항목 참조)

## 참조 노트 (이 디렉토리)

- `MERGE_NOTES.R2W1.md` — i18n 시스템 + Header 모바일 변경 상세
- `MERGE_NOTES.R2W2.md` — backend 응답 보강, locale 로깅 + TODO
- `MERGE_NOTES.R2W3.md` — 교수자 온보딩 5단계, 진행도 순수 함수
- `MERGE_NOTES.R2W4.md` — marketing 페이지 5종, MarketingShell 재사용
- `BACKEND_ASKS.R2W3.md` / `BACKEND_ASKS.R2W4.md` — 후속 백엔드 작업
- `DEPS_TO_ADD.R2W3.md` / `DEPS_TO_ADD.R2W4.md` — 신규 의존성 없음 확인서
- `Header.R2W4.patch.md` — Header 메뉴 변경 권장사항 (적용 완료)

## 검증 한계

이 환경에 Python/Node/Docker 모두 미설치 — 로컬에서 vitest/eslint/tsc/pytest 모두 실행 불가.
**최종 검증은 GitHub Actions CI**:
- backend: ruff lint + pytest 60% coverage gate
- frontend: eslint + vitest + next build
- Docker build → GHCR push → Trivy scan (PR 단계는 skip)

CI 결과 후 필요 시 hotfix.

## 베타 출시 영향

본 통합은 **시스템 정리 + 베타 신청·문의 진입로 확보**.
- Round 1 통합으로 베타 출시 차단 3건은 이미 main 에 들어간 상태
- Round 2 통합으로 **마케팅 진입로** (`/beta-apply`, `/contact` 등) 와 **교수자 첫 사용 UX** 마련됨
- 다음 단계는 실제 배포 (DEPLOYMENT_ROADMAP.md Phase 0~7) 또는 BACKEND_ASKS R2W3/R2W4 의 실제 endpoint 연결
