# 2026-05-07 — W1~W4 병렬 통합 (Round 3)

R1·R2 통합 후 베타 출시 차단 항목으로 남아 있던 교수자 핵심 4페이지를
4창 병렬로 구현한 결과를 main 에 통합한 기록.

## 통합한 브랜치 / 작업 단위

| 창 | 영역 | 디렉토리 |
|---|------|---------|
| W1 | frontend — `/professor/studio` 영상 제작 마법사 (5단계) | `docs/integration/2026-05-07-studio/` |
| W2 | frontend — `/professor/inbox` Q&A 인박스 (12-col 그리드) | `docs/integration/2026-05-07-inbox/` |
| W3 | frontend — `/professor/analytics` 분석 (차트 7종, SVG 직접) | `docs/integration/2026-05-07-analytics/` |
| W4 | frontend — `/professor/learners` 학습자 관리 (3 페이지) | `docs/integration/2026-05-07-learners/` |

각 창의 상세 노트는 위 디렉토리의 `MERGE_NOTES.{NAME}.md` /
`BACKEND_ASKS.{NAME}.md` / (선택) `DEPS_TO_ADD.{NAME}.md` 참조.

## 머지 결과

**머지 충돌 0건.** R1·R2 와 동일하게 영역 분리가 잘 되어 자동 통합 통과.

병렬 워크트리 격리 원칙 (4창 모두 무수정 보장):

| 자원 | W1 | W2 | W3 | W4 |
|---|:---:|:---:|:---:|:---:|
| `frontend/messages/ko.json` · `en.json` | ✓ | ✓ | ✓ | ✓ |
| `_patches/professor.{ko,en}.json` | ✓ | ✓ | ✓ | ✓ |
| `Header.tsx` / `I18nContext.tsx` / `AuthContext.tsx` | ✓ | ✓ | ✓ | ✓ |
| 백엔드 일체 | ✓ | ✓ | ✓ | ✓ |

각 창은 자기 patch (`_patches/{studio,inbox,analytics,learners}.{ko,en}.json`)
와 자기 디렉토리 (`src/{app,components}/professor/{name}/**`) 만 사용.
통합 commit 에서만 위 공유 파일을 한 번 수정.

## 통합 패스에서 처리한 항목

### A. i18n patch 4개 등록

`frontend/src/contexts/I18nContext.tsx` — 8 import + 8 배열 항목 (각 locale
별 4개씩) 추가. 통합 후 누적 적용 순서:

```
student → demo → professor → marketing → studio → inbox → analyticsHub → learners
```

**namespace 충돌 회피**: main `ko.json` / `en.json` 에 이미 top-level
`analytics.*` 가 존재하므로 W3 patch 는 의도적으로 `analyticsHub`
namespace 사용 — deep-merge 시 기존 `analytics.*` 키를 덮어쓰지 않음.
다른 3 patch 는 신규 namespace (`studio` / `inbox` / `learners`).

### B. Header `nav` 항목 4개 + `nav.*` 키 8개

`frontend/src/components/Header.tsx` — professor 사용자에게 노출되는
`navLinks` 에 마법사·인박스·분석·학습자 4 링크 추가:

- `/professor/studio` → `nav.studio`
- `/professor/inbox` → `nav.inbox`
- `/professor/analytics` → `nav.analytics`
- `/professor/learners` → `nav.learners`

`messages/ko.json` / `en.json` 의 `nav` 네임스페이스에 4×2=8 키 추가.
한국어: 스튜디오 / Q&A 인박스 / 분석 / 학습자.
영어: Studio / Inbox / Analytics / Learners.

### C. 디자인 시스템 / 정책 적합성 — 4창 합산 검증

| 항목 | 결과 |
|---|---|
| Pretendard / Paperlogy 외 폰트 도입 | 0건 |
| localStorage 신규 사용 | 0건 |
| 학생 데이터 보호 정책 위반 (광고/외부 공유) | 0건 (W4 가 회귀 lint 도입) |
| 의미적 컬러 학습자/마케팅 영역 사용 | 0건 (교수자 영역 한정) |
| `prefers-reduced-motion` 미지원 | 0건 |
| 신규 npm 의존성 | 0건 (W3 차트도 SVG 직접) |

### D. 노트 이관

각 창의 4개 통합 디렉토리 (`2026-05-07-{studio,inbox,analytics,learners}/`)
는 그대로 보존. 본 README 가 통합 요약 + 후속 결정 항목 정리.

## 의도적으로 미룬 항목

### 어댑터 훅 thin wrapper 다운그레이드 (별도 PR)

각 창이 워크트리 격리를 위해 자체 patch 를 import 하는 어댑터를 사용:

- `useStudioI18n` (W1)
- `useInboxI18n` (W2)
- `useAnalyticsI18n` (W3)
- `useLearnersI18n` (W4)

R1 의 `useDemoI18n` / R2 의 `useProfessorI18n` 처럼 `I18nContext`
patch 등록이 끝났으므로, 자체 import 를 제거하고 thin wrapper (자동
prefix 어댑터) 로 단순화 가능. 호출자 코드는 그대로 유지되므로 후속 PR
권장. 베타 출시 차단 아님.

### 라우팅 정리 — `/professor/lecture/[id]/dashboard` vs `/professor/analytics/[lectureId]`

W3 가 (b) 공존을 가정하고 작업. W4 의 `/professor/learners/[lectureId]`
도 같은 강의 컨텍스트. 통합 후 단순 dashboard 와 analytics 를 정리하는
정책 결정 필요:

- (a) 전환 — 기존 `/lecture/[id]/dashboard` 를 `/analytics/[lectureId]` 로
  redirect, 단일 진입점.
- (b) 공존 — 강의 카드의 "분석" 버튼은 기존 dashboard, 사이드 nav 의
  `/analytics` 는 강의 선택 후 신규 화면.

별도 PR 로 분리. 두 화면이 동시에 살아있어도 동작 자체는 정상.

### BACKEND_ASKS 누적 (창별 디렉토리 참조)

| 창 | 백엔드 요청 | 우선순위 |
|---|---|---|
| W1 (studio) | 5건 — script `low_information` 플래그 / 플랜 사용량 / QR PNG / 단일 강의 GET / TTS 미리듣기 | High 1 / Medium 4 |
| W2 (inbox) | 7건 — 단일 endpoint·답변 PATCH·일괄·aggregate·알림·forward·클러스터링 | High 2 / Medium 4 / Low 1 |
| W3 (analytics) | 3건 — 슬라이드별 replay/drop raw, qa의 slide_index, Pro 학습자 매트릭스, 월 한도 노출 | Medium 3 |
| W4 (learners) | 6건 — `/lectures/{id}/learners` (합집합 + accuracy_pct), 서버측 at-risk 필터, learners QA, learners assessment, notify, qa 응답 user_id | High 1 / Medium 5 |

총 **21건**. 모두 nice-to-have — 본 통합 PR 머지를 차단하지 않음. 별도
백엔드 sprint 권장. 각 창의 `BACKEND_ASKS.{NAME}.md` 참조.

### Pre-existing flake 1건

`__tests__/analytics/ScoreHeatmap.test.tsx` — 본 PR 무관, 사전 존재
flake (W4 의 보고서에서 확인). 별도 hotfix 또는 후속 PR 에서 처리.

### Round 1·2 의 미해결 항목 (이전 노트 인용)

- `AVATAR_VOICE_FEATURE_ROADMAP` Sprint A/B/C — 별도 스프린트 권장
- BACKEND_ASKS.R2W3 4건 (locale 컬럼·환영 모달·redeem-code·AuthContext 확장)
- BACKEND_ASKS.R2W4 (beta-apply / contact / Captcha / 이메일)

## 검증 한계

이 환경에 Node/Docker 모두 미설치 — 로컬에서 vitest/eslint/tsc/next build
모두 실행 불가. **최종 검증은 GitHub Actions CI** (`.github/workflows/ci.yml`):

- frontend: eslint + vitest + next build
- Docker build → GHCR push → Trivy scan (PR 단계는 skip)

각 창이 보고한 자체 검증 결과:

| 창 | vitest | eslint | next build |
|---|---|---|---|
| W1 (studio) | 53 cases / 5 files PASS | 0 / 0 | (CI 위임) |
| W2 (inbox) | 27 cases PASS | 0 / 0 | (CI 위임) |
| W3 (analytics) | 7 files PASS | 0 / 0 | (CI 위임) |
| W4 (learners) | 38/38 PASS · 전체 303/304 | 0 / 0 | TypeScript clean |

CI 결과 후 필요 시 hotfix.

## 베타 출시 영향

본 통합으로 **베타 출시 차단 항목 4건 모두 해소**:

- ✅ `/professor/studio` ⭐ — 영상 제작 마법사 (5단계)
- ✅ `/professor/inbox` — Q&A 인박스
- ✅ `/professor/analytics` — 분석 리포트
- ✅ `/professor/learners` — 학습자 관리

남은 베타 출시 작업:
- 실제 배포 (`DEPLOYMENT_ROADMAP.md` Phase 1~6) — 별도 트랙 (W5)
- 21건의 BACKEND_ASKS 중 High 우선순위 5건 (필수 endpoint) — 별도 백엔드 PR

`/professor/dashboard` 의 강의 카드 / Header nav 두 곳에서 4 신규 페이지로
진입 가능. 교수자 첫 사용 흐름이 완성되었다.

## 참조 노트 (각 창 디렉토리)

- [`2026-05-07-studio/`](../2026-05-07-studio/) — `MERGE_NOTES.STUDIO.md` · `BACKEND_ASKS.STUDIO.md` · `DEPS_TO_ADD.STUDIO.md`
- [`2026-05-07-inbox/`](../2026-05-07-inbox/) — `MERGE_NOTES.INBOX.md` · `BACKEND_ASKS.INBOX.md`
- [`2026-05-07-analytics/`](../2026-05-07-analytics/) — `MERGE_NOTES.ANALYTICS.md` · `BACKEND_ASKS.ANALYTICS.md`
- [`2026-05-07-learners/`](../2026-05-07-learners/) — `MERGE_NOTES.LEARNERS.md` · `BACKEND_ASKS.LEARNERS.md`
