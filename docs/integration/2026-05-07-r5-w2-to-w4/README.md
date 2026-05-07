# 2026-05-07 — R5W2~R5W4 병렬 통합 (Round 5 part 2)

R5 의 코드 정리 (R5W1, PR #91 단독 머지 완료) 이후, sitemap "🟡 출시 직전
마무리" 페이지 3종을 3창 병렬로 구현한 결과를 main 에 통합한 기록.

## 통합한 작업 단위

| 창 | 영역 | 통합 노트 디렉토리 |
|---|------|------|
| R5W2 | `/terms` + `/privacy` 실 콘텐츠 (서버 컴포넌트 + metadata) | `2026-05-07-legal/` |
| R5W3 | `/help` + `/changelog` 신규 (외부 의존성 0 fuzzy 검색) | `2026-05-07-help-changelog/` |
| R5W4 | `/profile` + 접근성 옵션 (학생 영역 + lecture 통합) | `2026-05-07-profile-a11y/` |

각 창의 상세 노트는 위 디렉토리의 `MERGE_NOTES.{NAME}.md` /
`BACKEND_ASKS.{NAME}.md` 참조.

## 머지 결과

**머지 충돌 0건.** R3·R4 와 동일하게 영역 분리가 잘 되어 자동 통합 통과.

병렬 워크트리 격리 원칙 (3창 모두 무수정 보장):

| 자원 | W2 | W3 | W4 |
|---|:---:|:---:|:---:|
| `frontend/messages/ko.json` · `en.json` | ✓ | ✓ | ✓ |
| `_patches/professor.{ko,en}.json` 외 기존 patch | ✓ | ✓ | ✓ |
| `Header.tsx` · `I18nContext.tsx` · `AuthContext.tsx` | ✓ | ✓ | ✓ |
| `globals.css` · `tailwind.config.ts` · `MarketingShell.tsx` · `SectionHeader.tsx` | ✓ | ✓ | ✓ |
| 백엔드 일체 | ✓ | ✓ | ✓ |
| `frontend/src/app/lecture/[slug]/page.tsx` | — | — | import 1줄 + 마운트 1줄 (본문 무수정) |

### `lecture/[slug]/page.tsx` 의 자연 합류

PR #91 (R5W1) 시점에 `useToast` import + `toast` destructure 제거를 W4
영역으로 위임했고, W4 가 같은 파일에 `AccessibilityPanel` import 1줄 +
마운트 1줄을 추가. 두 변경이 본 통합에서 **충돌 0** 으로 자연 합류:

```diff
-import { useToast } from "@/components/ui/Toast";
 import { useI18n } from "@/contexts/I18nContext";
+// feat/profile-a11y — 접근성 panel 마운트 (lecture body 무수정 제약).
+// AccessibilityPanel 자체가 A11yProvider 를 동봉하므로 추가 wrapper 불필요.
+import AccessibilityPanel from "@/components/student/accessibility/AccessibilityPanel";
 ...
   // Video
-  const { toast } = useToast();
   const videoRef = useRef<HTMLVideoElement>(null);
```

## 통합 패스에서 처리한 항목

### A. i18n patch 4개 등록

`frontend/src/contexts/I18nContext.tsx` — 8 import + 8 배열 항목 (각 locale
별 4개씩) 추가. 통합 후 누적 적용 순서:

```
student → demo → professor → marketing →
studio → inbox → analyticsHub → learners →
landingHub → featuresHub → dashboardHub → pricingHub →
legalHub → helpHub → changelogHub → profileHub (+ accessibilityHub)
```

**namespace 충돌 회피** (모두 `Hub` 접미사):
- `legalHub` / `helpHub` / `changelogHub` / `profileHub` — main `ko.json`
  top-level 키 (`landing`/`dashboard`/`analytics` 등) 와 의미 혼선 회피
- `profileHub.{ko,en}.json` 단일 파일이 **두 top-level namespace** 보유:
  `profileHub` (마이페이지) + `accessibilityHub` (접근성 패널) — A11y 가
  profile 의 일부로 함께 마운트되므로 같은 patch 에 묶음. deep-merge 가
  자동으로 두 namespace 모두 풀어줌.

### B. sitemap 정정 (W2 작업물 흡수)

`docs/planning/03-sitemap.md` §2.1 + §6 (변경 이력) — `/legal/terms` ·
`/legal/privacy` 표기를 실제 라우트인 `/terms` · `/privacy` 로 정정.
MarketingShell 푸터 · TrustContent 등 다수 컴포넌트가 이미 후자를
참조하고 있어 코드 측을 우선 정합 — 외부 SEO·SNS 링크 보존.

`/legal/*` 도입은 후속 PR 의 redirect 로 가능.

### C. Header nav 추가 — **의도적 미적용**

`/help`, `/changelog`, `/profile` 모두 본 PR 에서 Header nav 에 추가하지
않음. 격리 원칙 (Header 무수정) 우선. 진입로:

- `/help` · `/changelog` — MarketingShell footer 가 가리키도록 후속 PR
- `/profile` — student 메뉴 / 사용자 드롭다운 추가 (후속 PR — R3 작업물과 충돌 회피)

본 PR 시점에 직접 URL 입력 또는 외부 링크로 접근 가능.

### D. 디자인 시스템 / 정책 합산 검증

| 항목 | 결과 |
|---|---|
| Pretendard / Paperlogy 외 폰트 | 0건 |
| localStorage 신규 사용 | 0건 (W4 의 sessionStorage 만, monkey-patch lint) |
| 학생 데이터 보호 정책 위반 | 0건 (W4 의 PrivacyNotice + forbidden keyword + setItem lint 3중) |
| 다크 모드 강제 (학생 화면) | ✓ (W4 의 DarkShell wrapper, root layout 무수정) |
| 외부 SNS 공유 슬롯 | 0건 (W4 의 인증서 공유는 본인 발급 링크 복사만) |
| `prefers-reduced-motion` 미지원 | 0건 (W4 의 `effectiveReduceMotion = userToggle OR system` 통합) |
| 신규 npm 의존성 | 0건 (W3 의 fuzzy 검색은 외부 의존성 없는 토큰 매칭) |
| 색약자 친화 이중 부호화 | ✓ (W3 의 카테고리 글리프 + 색 + 라벨 3중) |

### E. 노트 이관

3개 창의 통합 디렉토리 (`2026-05-07-{legal,help-changelog,profile-a11y}/`)
는 모두 보존. 본 README 가 통합 요약 + 후속 결정 항목 정리.

## 의도적으로 미룬 항목

### 1. R5W1 의 `usePrefersReducedMotion` helper + W4 의 `effectiveReduceMotion` 통합

R5W1 (PR #91) 의 `usePrefersReducedMotion` helper 는 OS 시스템 설정만
구독. W4 의 A11yContext 는 사용자 명시 토글을 추가로 가지고 있고,
`effectiveReduceMotion = userToggle OR system` 으로 OR 결합. 본 PR 은
두 helper 가 공존하는 상태로 머지 — 후속 PR 에서 `useEffectiveReduceMotion`
같은 통합 helper 로 정리 권장.

### 2. R5W3 `__tests__/help/search.test.ts` 사전 미실패

W4 보고 시점에 "사전 존재 미실패 2건" 으로 언급됨. 본 PR 의 통합 작업
환경에서 vitest 실행 불가 (Node 미설치) 라 정확한 원인 추적 불가 — CI
결과로 검증 후 별도 fix commit 또는 hotfix.

### 3. Header nav / footer link 추가 (별도 PR)

`/help`, `/changelog`, `/profile` 진입로 정비. 본 PR 은 Header 무수정.

### 4. R5W4 BACKEND_ASKS 5건

| § | 우선순위 | 내용 |
|---|:---:|---|
| §1 | High | `GET /api/v1/profile/me` 통합 endpoint |
| §2 | Medium | 일별 학습 분 스트릭 |
| §3 | High | 인증서 PDF 생성 + 공유 링크 endpoint (3단 명세) |
| §4 | Low | 격려 메시지 inbox — R3W4 의 `POST .../notify` 와 짝 |
| §5 | Low | user 메타 (school/department) AuthContext 확장 |

본 통합 PR 머지를 차단하지 않음 — fan-out + mock fallback 으로 동작 중.

### 5. 누적 BACKEND_ASKS — 34건

R3 21 + R4 8 + R5 5 = 34건. 별도 backend sprint 권장.

## 검증

| 창 | 자체 vitest | next build | eslint |
|---|---|---|---|
| R5W2 (legal) | 30/30 PASS | ✓ Compiled 5.1s · `/terms`·`/privacy` 정적 prerender | 0 / 0 |
| R5W3 (help/changelog) | 18 cases (4 files) PASS | (보고 누락) | (보고 누락) |
| R5W4 (profile/a11y) | 41/41 PASS · 전체 523/525 (사전 flake 2) | ✓ TypeScript clean · `/profile` static-prerendered | (보고 누락) |

PR #89 / #90 / #91 의 react-hooks 룰 위반 패턴은 모두 사전 회피.

**최종 검증은 GitHub Actions CI** (`.github/workflows/ci.yml`).
CI 결과 후 필요 시 hotfix.

## 베타 출시 영향

본 통합으로 **CLAUDE.md "🟡 2순위 — 출시 직전 마무리" 5종 중 4종 완료**:

- ✅ `/terms` (이용약관) — 시행일 2026-05-21 placeholder
- ✅ `/privacy` (개인정보처리방침) — 동일
- ✅ `/help` (도움말 센터) — FAQ 24항목 + fuzzy 검색
- ✅ `/changelog` (업데이트 로그) — R1~R4 통합 시점 8 시드
- ✅ `/profile` (학생 마이페이지) — 스트릭·인증서·통계
- ✅ 접근성 옵션 — 단축키 6종 + A11y 토글 4종 (자막 / 글씨 크기 / 고대비 / 동작 줄이기)

남은 🟡 항목:
- 학생 다국어 인터페이스 (한·중·영) — 별도 sprint (분량 큼)

남은 베타 출시 작업:
- W5 배포 (DEPLOYMENT_ROADMAP Phase 1~6) — 사용자 보류 중
- 누적 BACKEND_ASKS 34건 — backend sprint
- Header nav / footer link 정비 (별도 PR)

## 참조 노트 (각 창 디렉토리)

- [`2026-05-07-legal/`](../2026-05-07-legal/) — `MERGE_NOTES.LEGAL.md`
- [`2026-05-07-help-changelog/`](../2026-05-07-help-changelog/) — `MERGE_NOTES.HELP_CHANGELOG.md`
- [`2026-05-07-profile-a11y/`](../2026-05-07-profile-a11y/) — `MERGE_NOTES.PROFILE_A11Y.md` · `BACKEND_ASKS.PROFILE.md`
