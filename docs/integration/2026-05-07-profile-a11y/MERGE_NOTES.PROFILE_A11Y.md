# MERGE_NOTES — feat/profile-a11y (2026-05-07)

> 워크트리: **feat/profile-a11y**
> 담당 화면:
>   - `/profile` (학생 마이페이지 — 스트릭·통계·인증서·격려)
>   - 영상 시청 화면 접근성 패널 (`AccessibilityPanel` mount in `/lecture/[slug]`)
>
> 백엔드 의존성: `BACKEND_ASKS.PROFILE.md` 참조

---

## 1. 추가된 파일

### 페이지 (App Router)
- `frontend/src/app/profile/page.tsx` — `ProtectedRoute(student)` 내에서 `<ProfileContent />` 렌더

### 학생 마이페이지 컴포넌트 (`frontend/src/components/student/profile/`)
- `ProfileContent.tsx` — 다크 셸 + 8 섹션 합성
- `useProfileHubI18n.ts` — patches 자체-import 어댑터 (legacy `useDemoI18n` 패턴)
- `types.ts` — UserBasic, StreakSummary, LifetimeStats, CourseProgress, Certificate, Encouragement, RecentQuestion, ProfileSnapshot
- `fetchProfile.ts` — 통합 endpoint → fan-out → mock fallback (단계별 graceful degradation)
- `Mascot.tsx` — 회갈색 단색 미니멀 SVG 올빼미 (encouraging / welcoming 두 표정)
- `PrivacyNotice.tsx` — 학생 본인 데이터 안내 배너 (다크 톤)
- `StreakHeatmap.tsx` — 7행×N열 잔디 그리드 + 강도 4단계
- `StatsGrid.tsx` — 5칸 누적 통계 (Pretendard tabular-nums)
- `CourseList.tsx` — 수강중·완료 두 그룹 + 진행 바
- `CertificateList.tsx` — PDF 다운로드 + 공유 링크 (백엔드 미흡 안내 동봉)
- `EncouragementList.tsx` — 받은 격려 + 최근 질문 두 단

### 접근성 컴포넌트 (`frontend/src/components/student/accessibility/`)
- `A11yContext.tsx` — `A11yProvider` + `useA11y` 훅. **localStorage 사용 0건, sessionStorage 만 사용.** body 클래스 토글 + 자체 주입 `<style>` (globals.css 무수정)
- `AccessibilityPanel.tsx` — floating opener + slide-in panel + 자체 `<A11yProvider>` 동봉
- `KeyboardShortcutsModal.tsx` — `?` 키 또는 panel 버튼으로 진입
- `useVideoShortcuts.ts` — Space / ←/→ / F / C / ? 키 핸들러 (입력 필드 포커스 시 자동 무시)

### i18n 패치 (단일 파일, 두 namespace)
- `frontend/messages/_patches/profileHub.ko.json` — `profileHub` + `accessibilityHub`
- `frontend/messages/_patches/profileHub.en.json` — 동일

### 테스트
- `frontend/__tests__/profile/StreakHeatmap.test.tsx` (3)
- `frontend/__tests__/profile/StatsGrid.test.tsx` (4)
- `frontend/__tests__/profile/CertificateList.test.tsx` (4)
- `frontend/__tests__/profile/ProfileContent.test.tsx` (5)
- `frontend/__tests__/profile/fetchProfile.test.ts` (5)
- `frontend/__tests__/accessibility/A11yContext.test.tsx` (6)
- `frontend/__tests__/accessibility/useVideoShortcuts.test.tsx` (7)
- `frontend/__tests__/accessibility/AccessibilityPanel.test.tsx` (7)
- **합계 41/41 통과**

### 수정한 파일 (단일 import + 단일 mount)
- `frontend/src/app/lecture/[slug]/page.tsx`
  - 상단에 `import AccessibilityPanel from "@/components/student/accessibility/AccessibilityPanel";` 추가
  - 페이지 root `</main>` 직후 `<AccessibilityPanel />` 한 줄 추가
  - lecture 본문 무수정 제약 충족 — 그 외 변경 0줄

---

## 2. i18n 통합 — 머지 후 작업 권장

본 워크트리는 `I18nContext.tsx` 무수정 제약을 받았으므로 `useProfileHubI18n`
어댑터가 직접 `_patches/profileHub.{ko,en}.json` 두 파일을 import 한다 (legacy
`useDemoI18n` 패턴). 머지 후 `I18nContext.tsx` 의 patches 배열에 두 파일을
추가하면 본 어댑터를 thin wrapper 로 단순화 가능 — 호출자 시그니처는 변하지
않으므로 무수정 마이그레이션.

```ts
// I18nContext.tsx (R5 정리 시점)
import profileHubKo from "../../messages/_patches/profileHub.ko.json";
import profileHubEn from "../../messages/_patches/profileHub.en.json";
const koPatches = [...prev, profileHubKo];
const enPatches = [...prev, profileHubEn];
```

(같은 patch 파일이 `profileHub` 와 `accessibilityHub` 두 namespace 를 포함하지만
deep-merge 가 두 namespace 를 모두 뽑아낸다.)

---

## 3. 다크 모드 강제

`ProfileContent` 의 최상위 wrapper (`<DarkShell>`) 가 `bg-[#0A0A0A] text-white`
를 적용해 root layout 의 `bg-gray-50` 을 덮어쓴다 → root layout 무수정 제약
충족. `__tests__/profile/ProfileContent.test.tsx` 의 "forces dark mode" 테스트가
이를 자동 lint.

`/lecture/[slug]` 는 이미 `bg-gray-900` 다크 톤이라 panel mount 만 추가.

---

## 4. 학생 데이터 보호 정책 — 위반 0건

### 4.1 정책 (CLAUDE.md "핵심 차별점 4가지" + 02-guardrails.md)

1. 광고 미사용
2. 외부 SNS 공유·마케팅 슬롯 없음
3. 본인 데이터 위치·삭제 정책을 매 페이지에 노출
4. localStorage 사용 금지 (sessionStorage 만 허용)

### 4.2 본 PR 의 적용

- `PrivacyNotice` — `/profile` 상단 1회 노출 (3개 bullet + /trust 링크)
- `CertificateList` 의 공유 액션은 "본인이 발급받은 공유 링크 복사" 한 가지로
  한정. SNS 공유 슬롯 자체를 만들지 않음
- `BulkActions` 류 액션 없음 — 학생은 본인 화면만 다룸
- `A11yProvider` 의 sessionStorage 만 사용 — `__tests__/accessibility/A11yContext.test.tsx`
  의 두 테스트가 `localStorage.setItem` monkey-patch 로 자동 lint
- `__tests__/profile/ProfileContent.test.tsx` 의 마지막 두 테스트가:
  - 페이지 내 a/button 라벨에 광고/SNS 공유 키워드 (광고/advertis/share to
    facebook/share to twitter/share to kakao/third-party/마케팅 공유) 가 없음을
    회귀 lint
  - mount 후 `localStorage.setItem` 호출 0건 회귀 lint

### 4.3 R3W4 패턴과의 정합

R3W4 (learners) 의 PrivacyNotice 가 라이트 베이스라면 본 PR 의 학생용 버전은
다크 베이스 + 골드/에메랄드 — 학습자 화면 컬러 정책에 맞춰 다시 도색. forbidden
키워드 lint 패턴은 거의 동일 (광고/SNS 공유/외부 마케팅).

---

## 5. 접근성 (a11y)

### 5.1 panel 옵션 4가지
- 자막 표시 (영상 시청 시 자동 자막) — 본 PR 은 토글 상태만 보유, 실제 자막
  렌더링은 lecture body 의 video element 가 자체 `<track>` 을 갖게 되는
  후속 PR 에서 connect (정책: lecture 본문 무수정)
- 글씨 크기 (보통 18px → 큰 18px → 매우 큰 20px) — body 클래스 토글 + 자체 주입 `<style>`
- 고대비 모드 (`bg #000` + `color #fff` + 링크 골드)
- 동작 줄이기 — 사용자 토글과 시스템 `prefers-reduced-motion` 의 OR

### 5.2 단축키 (06-student-pages.md §11.1)
- Space — 재생/일시정지
- ← / → — 10초 이동
- F — 전체화면
- C — 자막 토글
- ? (또는 Shift+/) — 단축키 안내 모달
- 입력 필드 포커스 / 수정자 키 조합 시 자동 무시

### 5.3 prefers-reduced-motion 회귀 차단
- 모든 transition 에 `motion-reduce:transition-none`
- 모든 animation 에 `motion-safe:animate-…` 또는 `@media (prefers-reduced-motion: reduce) { animation: none !important }` 동봉
- `Mascot` 의 호흡 애니메이션도 reduced-motion 시 즉시 정지

---

## 6. 백엔드 미흡 사항 → BACKEND_ASKS

[`BACKEND_ASKS.PROFILE.md`](./BACKEND_ASKS.PROFILE.md) 에 정리:

- §1 통합 endpoint `GET /api/v1/profile/me` (없으면 fan-out)
- §2 학습 스트릭 endpoint
- §3 인증서 PDF 생성 + 공유 링크 발급
- §4 격려 메시지 inbox

본 PR 은 모두 graceful fallback (mock + "샘플 데이터" 배지). 백엔드가 endpoint
를 추가하면 `fetchProfile.ts` 가 자동으로 실데이터로 교체.

---

## 7. 절대 건드리지 않은 파일 (요청 제약 준수)

- `frontend/messages/ko.json`, `frontend/messages/en.json`
- `frontend/messages/_patches/professor.{ko,en}.json`
- `frontend/src/components/Header.tsx`
- `frontend/src/contexts/I18nContext.tsx`, `frontend/src/contexts/AuthContext.tsx`
- `frontend/src/app/layout.tsx` (다크 모드 강제는 페이지-수준 wrapper 로 처리)
- `frontend/src/app/lecture/[slug]/page.tsx` 본문 — 단 import + `<AccessibilityPanel />` 한 줄만 추가
- 백엔드 일체

---

## 8. DoD 체크리스트

- [x] `vitest run __tests__/profile __tests__/accessibility` — 8 파일, 41 테스트 통과
- [x] `next build` — `/profile` 라우트 정상 등록 (검증 섹션 참조)
- [x] 다크 모드 강제 — `ProfileContent.test.tsx` 의 자동 lint
- [x] 학생 데이터 보호 정책 위반 0
  - [x] 광고/SNS 공유 키워드 회귀 차단 (forbidden grep)
  - [x] localStorage 사용 0건 회귀 차단 (setItem monkey-patch)
- [x] prefers-reduced-motion — 모든 transition 에 `motion-reduce:transition-none`
  + Mascot 호흡 애니메이션 reduced-motion 시 정지
- [x] 단축키 — 6종 모두 동작 + 입력 필드 보호 + 수정자 키 보호
