# MERGE_NOTES.STUDIO — `/professor/studio` 영상 제작 마법사

> **창**: W1 (창1) · 베타 출시 차단 항목
> **브랜치**: `feat/studio-wizard`
> **작업일**: 2026-05-07
> **연관 기획**: `docs/planning/05-instructor-pages.md` §5, `docs/planning/02-guardrails.md` §1·9

---

## 1. 요약

5단계 영상 제작 마법사 (`/professor/studio` + `/professor/studio/[lectureId]`)
신규 구현. 기존 `/professor/lecture/new` (단순 폼) 와 공존 — 사용자가 어느
경로로 진입하든 동일한 백엔드 흐름 (강좌 → 강의 → PPT 업로드 → 스크립트
검토 → 승인 → 렌더 → 공유) 을 거치게 된다.

기존 코드 수정 0건 — `Header.tsx`, `I18nContext.tsx`,
`messages/{ko,en}.json`, `messages/_patches/professor.{ko,en}.json` 모두
손대지 않았다 (워크트리 격리 원칙).

---

## 2. 추가된 파일

### 신규 디렉토리

```
frontend/src/app/professor/studio/
  page.tsx                                  # Step 1 진입
  [lectureId]/page.tsx                       # Step 2~5 진행

frontend/src/components/professor/studio/
  studioTypes.ts                            # 타입
  guardrails.ts                             # 1차 가드레일 (PPT 검증) + 비용 한도 결정
  costEstimator.ts                          # TTS·HeyGen 비용 추정 (순수 함수)
  useStudioI18n.ts                          # i18n 어댑터 (자체 patch import)
  useStudioWizard.ts                        # 단계·검토 상태 훅
  StudioWizard 보조 컴포넌트 11종:
    StepIndicator.tsx
    GuardrailBanner.tsx
    CostMeter.tsx
    AvatarPicker.tsx
    ShareLinks.tsx
    Step1PptUpload.tsx ~ Step5Share.tsx (5종)

frontend/messages/_patches/
  studio.ko.json
  studio.en.json

frontend/__tests__/studio/
  guardrails.test.ts
  costEstimator.test.ts
  useStudioWizard.test.ts
  StepIndicator.test.tsx
  CostMeter.test.tsx
```

총 **24 파일 신규**, 기존 파일 수정 0.

---

## 3. 백엔드 호출 매트릭스

마법사가 호출하는 기존 endpoint (모두 `feat/infra` ~ R2 통합 시점에 이미
존재):

| Step | 메서드 + 경로 | 책임 |
|---|---|---|
| 1 | `POST /api/courses` | 새 강좌 생성 (mode=new 일 때만) |
| 1 | `POST /api/lectures` | 강의 생성 |
| 1 | `POST /api/v1/render/upload?lecture_id=` | PPT 업로드 + 파이프라인 시작 |
| 2 | `GET /api/lectures/{id}/video` | video.id 폴링 |
| 2 | `GET /api/videos/{video_id}/script` | 스크립트 폴링 |
| 2 | `PATCH /api/videos/{video_id}/script` | 스크립트 저장 |
| 2 | `POST /api/videos/{video_id}/script/reset` | AI 원본 복원 |
| 3 | `GET /api/v1/render/avatars` | HeyGen 아바타 목록 |
| 4 | `POST /api/videos/{video_id}/approve` | 승인 → rendering 전환 |
| 4 | `GET /api/v1/render/lecture/{id}` | 슬라이드별 렌더 폴링 |
| 5 | `PATCH /api/lectures/{id}` | `is_published` 토글 |

---

## 4. 통합 PR 에서 처리해야 할 항목

### 4.1 i18n 시스템 통합 (필수, 5분)

R1 의 `useDemoI18n`, R2 의 `useProfessorI18n` 패턴을 그대로 따른다.

**`frontend/src/contexts/I18nContext.tsx`** 에 patches 두 줄 추가:

```diff
 import marketingKo from "../../messages/_patches/marketing.ko.json";
 import marketingEn from "../../messages/_patches/marketing.en.json";
+import studioKo from "../../messages/_patches/studio.ko.json";
+import studioEn from "../../messages/_patches/studio.en.json";

 const koPatches: Messages[] = [
   studentKo as Messages,
   demoKo as Messages,
   professorKo as Messages,
   marketingKo as Messages,
+  studioKo as Messages,
 ];
 const enPatches: Messages[] = [
   studentEn as Messages,
   demoEn as Messages,
   professorEn as Messages,
   marketingEn as Messages,
+  studioEn as Messages,
 ];
```

**`useStudioI18n.ts` thin wrapper 변환** (선택, 후속 PR 도 OK):

자체 import 를 제거하고 R1 의 `useDemoI18n` 처럼 `useI18n()` + 자동
`"studio."` prefix 만 남긴다. studio 컴포넌트들은 키만 짧게 쓰므로
변환 후에도 호출자 코드는 그대로.

### 4.2 Header 항목 추가 (선택, 5분)

비로그인 nav 가 아닌 **교수자 nav** 라 `Header.tsx` 의
`navLinks` (role="professor") 에 한 줄 추가하면 됨. 이미 `nav` 키에
`createLecture` 가 있으므로 새 키 추가 후 사용.

```diff
 const navLinks = user?.role === "professor"
   ? [
       { href: "/professor/dashboard", label: t("nav.lectureManage") },
+      { href: "/professor/studio", label: t("nav.studio") },
       { href: "/professor/lecture/new", label: t("nav.newLecture") },
       { href: "/professor/subscription", label: t("nav.subscription") },
     ]
```

`messages/ko.json` / `en.json` 의 `nav` 네임스페이스에 `studio` 키 추가
(예: `"studio": "스튜디오"` / `"studio": "Studio"`).

### 4.3 dashboard CTA 변경 (의도적 미적용 — 별도 결정)

`/professor/dashboard` 의 "강의 편집" 버튼이 현재 `/professor/lecture/{id}`
로 이동한다. 마법사 흐름으로 이전하려면
`/professor/studio/{id}?step=2` 로 변경. 사용자가 두 경로 모두 유지하길
원할 가능성도 있어 **별도 PR 로 분리**.

---

## 5. 의도적으로 미룬 항목

### 5.1 BACKEND_ASKS.STUDIO 5건

별도 파일 `BACKEND_ASKS.STUDIO.md` 참조. 모두 nice-to-have — 본 PR 머지를
차단하지 않음.

### 5.2 QR 코드 PNG 다운로드

`Step5Share` 의 `ShareLinks.tsx` 에서 "QR 다운로드" 버튼은 disabled. 이유:

- `qrcode` 패키지 도입은 **DEPS_TO_ADD 정책** 상 통합 PR 결정 사항
- 백엔드가 1024×1024 PNG 를 생성·서빙하는 게 더 적합 (학생 보호 정책 + 캐시)
- BACKEND_ASKS.STUDIO §3 으로 분리

UI 는 "곧 지원됩니다" 안내 + URL 텍스트 복사로 임시 운영 가능.

### 5.3 학습 코드 (4-4 코드)

`Step5Share` 의 `classCode` prop 이 현재 `null` 로 하드코딩. 백엔드의
`POST /api/v1/lectures/{slug}/redeem-code` 가 도착하면 (Round 1
BACKEND_ASKS.W4 §4 / Round 2 BACKEND_ASKS.R2W3 §4 의 동일 항목)
페이지에서 fetch 하도록 변경. UI 는 `classCode` 가 null 이면 자동으로
영역을 숨긴다.

### 5.4 플랜 사용량 조회

CostMeter 가 `usage.limit=0` (Pro 가정) 로 표시되어 영상 생성을 차단하지
않음. `GET /api/v1/subscription/usage` 같은 endpoint 가 도착하면
`/professor/studio/[lectureId]/page.tsx` 의 `usage` useMemo 부분만
fetch 로 교체. BACKEND_ASKS.STUDIO §2.

### 5.5 AI 정보 부족 플래그

Step2 의 "보강 필요" 마크가 현재 `text.trim().length < 20` 휴리스틱. 백엔드
`script_generator` 가 segment 별 `confidence` 또는 `low_information` 플래그
내려주면 그 값을 사용. BACKEND_ASKS.STUDIO §1.

### 5.6 Step3 미리듣기 (Preview) 버튼

기획서 §5.3 (3) 의 슬라이드별 ▶ 미리듣기 버튼은 미구현. ElevenLabs
synthesize 단발 호출용 endpoint 가 필요. BACKEND_ASKS.STUDIO §5.

---

## 6. 디자인 시스템 준수 확인

- [x] 폰트: Pretendard 본문, Paperlogy 헤더(`pageTitle` + `step5.title`).
      Geist/Geist Mono 사용 0건.
- [x] 컬러: 라이트 베이스 (`#FAFAF7` 배경 — Header 가 처리, 본 페이지는
      `bg-gray-50`). 골드 강조는 비용 미터 아이콘 + 학습 코드 박스.
- [x] 의미적 컬러: 빨강·녹색을 cost-meter / GuardrailBanner / Step5
      publish 토글에서만 사용 (교수자 영역 허용).
- [x] 마스코트 등장 0건 (교수자 영역).
- [x] localStorage 사용 0건 — 모든 상태는 React state + URL query (`?step=`).
- [x] `prefers-reduced-motion`: cost-meter 의 `motion-safe:animate-pulse`
      유틸리티가 자동 처리.
- [x] 색맹 친화: GuardrailBanner / cost-meter 의 block / warn 모두
      아이콘(X / !) + 텍스트 병용. 색상 단독 의존 없음.
- [x] 숫자: 비용·시간·진행도 모두 `tabular-nums`.

---

## 7. 가드레일 확인 (`docs/planning/02-guardrails.md`)

| 가드레일 | 적용 |
|---|---|
| 1차 — 입력 제약 (PPT 100MB · `.pptx`) | `guardrails.ts` `validatePptFile` + 백엔드 미러 |
| 1차 — 강의 제목 / 강좌 미선택 | `validateStep1` |
| 2차 — RAG 임계값 | 학생측 (Q&A) — 본 PR 범위 밖 |
| 3차 — 빈도 한도 | 비용 한도는 `evaluatePlanUsage` 가 80%/100% 분기. 학생측 빈도는 본 PR 범위 밖 |
| 4차 — 이상 탐지 | 백엔드 — 본 PR 범위 밖 |
| 영상 생성 시 백엔드 `check_limit` | `POST /api/v1/render/upload` / `POST /render` 의 429 응답을 호출자가 catch — 현재는 UI 에 toast 만. `BACKEND_ASKS.STUDIO §2` 도착 시 사전 차단. |

---

## 8. 검증 한계

이 환경에 Node/Docker 모두 미설치 — 로컬에서 vitest/eslint/tsc/next build 모두
실행 불가. **최종 검증은 GitHub Actions CI** (`.github/workflows/ci.yml`):

- frontend: eslint + vitest + next build
- 디자인 시스템 위반은 코드 review 로 검증

CI 실패 시 hotfix.

---

## 9. 베타 출시 영향

본 PR 이 머지되면 **베타 출시 차단 항목 4개 중 1개 해소**:

- [x] `/professor/studio` ⭐
- [ ] `/professor/inbox` (창2 진행)
- [ ] `/professor/analytics` (창3 진행)
- [ ] `/professor/learners` (창4 진행)

4창 모두 머지되고 통합 PR (Header + I18nContext) 처리하면 베타 출시 가능
상태 도달.
