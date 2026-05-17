# 배포 진행 상황 (Deployment Progress)

> 이 문서는 [DEPLOYMENT_ROADMAP.md](DEPLOYMENT_ROADMAP.md) 진행 체크포인트입니다.
> 마지막 업데이트: **2026-05-16**

---

## 진행 요약

```
Phase 0 ✅ 사전 준비 (외부 API 키, 도메인 구매)
Phase 1 ✅ Supabase 설정 (pgvector, 마이그레이션)
Phase 2 ✅ Railway 백엔드 배포 (backend + celery-worker + celery-beat + Redis)
Phase 3 ✅ Vercel 프론트엔드 배포
Phase 4 ✅ 도메인 연결 (전 단계 완료)
  ├─ 4.1 ✅ 프론트엔드 도메인 (classauto.live + www)
  ├─ 4.2 ✅ 백엔드 도메인 (api.classauto.live)
  ├─ 4.3 ✅ 환경변수 최종 업데이트
  ├─ 4.4 ✅ Google OAuth Console redirect URI
  ├─ 4.5 ✅ HeyGen 웹훅 URL
  ├─ 4.6 ✅ OAuth invalid_state 버그 수정 (frontend state CSRF 레이어 폐기)
  ├─ 4.7 ✅ 디자인 시스템 v2 전환 (라이트 베이지 + 골드 dual-surface, 4-PR 병렬 머지)
  └─ 4.8 ✅ v2 후속 반응형 보강 (05-15, PR #143~146 — iframe 프로토타입 → 반응형 React)
Phase 5 🔄 스모크 테스트 (핵심 미검증 — Google 로그인 ✅, PPT→Celery→Claude→HeyGen 파이프라인 미진행)
Phase 6 ⏳ CI/CD & 운영 정착
```

> **2026-05-16 상태 메모 (최종 갱신)**: 4-레인 병렬 워크플로 **4창 전부 머지 완료**(창1 #148 · 창2 #147 · 창3 #153 · 창4 #149/#151/#152, 아래 §"진행 현황" 참조). 코드 정리·의존성·디자인 후속이 모두 닫혔다.
>
> **그러나 Phase 5의 핵심인 파이프라인 end-to-end 검증(PPT → Celery → Claude → HeyGen)은 여전히 1회도 수행되지 않았다.** 코드 작업이 끝났다는 것이 베타 보급 준비 완료를 의미하지 **않는다** — 실제 파이프라인이 프로덕션에서 끝까지 도는지 미확인인 한, 이것이 **단일 최우선 블로커**다. 다음 세션 1순위는 새 기능이 아니라 §"다음 세션 작업 — Phase 5 스모크 테스트"의 수행이다.

---

## 현재 인프라 상태

### Railway (프로덕션)

| 서비스 | 도메인 | 상태 |
|--------|--------|------|
| backend | `classautolive-production.up.railway.app` | ✅ Active |
| celery-worker | (내부) | ✅ Active, task 9개 등록 |
| celery-beat | (내부) | ✅ Active, 10분 주기 스케줄링 |
| Redis | `redis.railway.internal:6379` | ✅ |

**`/health` 응답 (확인됨):**
```json
{
  "status": "ok",
  "checks": {
    "service": "ok",
    "db": "ok",
    "redis": "ok",
    "s3": "ok",
    "celery": "ok"
  },
  "env": "production"
}
```

**`/docs`**: 404 (production에서 비활성화 정상)

### Vercel (프로덕션)

| 도메인 | 종류 | 상태 |
|--------|------|------|
| `classauto.live` | Production | ✅ |
| `www.classauto.live` | 308 → `classauto.live` | ✅ |
| `classauto-live.vercel.app` | Vercel 기본 도메인 | ✅ |

**환경변수:**
- `NEXT_PUBLIC_API_URL` = `https://api.classauto.live` (Phase 4.3 완료)

### Supabase
- pgvector 활성화됨
- Alembic 마이그레이션 완료
- **연결**: Transaction Pooler URL 사용 중 (port 6543)

---

## 격파한 함정 (2026-05-12 ~ 2026-05-13)

이미 commit/문서화된 것은 생략하고, 미래 작업자가 다시 마주칠 수 있는 것들만 기록:

### 1. `autodiscover_tasks(['app.tasks'])` → `include=`로 교체
- **증상**: worker에 `Received unregistered task of type 'app.tasks.polling.poll_pending_renders'` 에러. beat은 메시지를 잘 보내는데 worker가 task를 모름.
- **원인**: Celery의 `autodiscover_tasks`는 Django 컨벤션을 따라 각 패키지에서 `tasks.py` 파일만 찾는다. 우리 구조는 `polling.py/cleanup.py/backup.py/render.py/pipeline.py`로 분산되어 있어 0개 등록됨.
- **해결**: `Celery(include=[...])` 파라미터로 모듈을 명시 등록. ([commit cc95d7aa 참조](backend/app/celery_app.py))

### 2. Supabase Direct URL → Pooler URL 교체 (Railway 한정)
- **증상**: worker가 task 받자마자 `psycopg2.OperationalError: connection to server at "db.<project>.supabase.co" (IPv6) port 5432 failed: Network is unreachable`
- **원인**: Direct URL은 IPv6로 해석되는데 Railway 컨테이너는 IPv4-only 아웃바운드. Pooler endpoint는 IPv4 지원.
- **해결**: `DATABASE_URL_SYNC`를 Transaction Pooler URL (port 6543)로 교체. **세 서비스 모두** (backend, celery-worker, celery-beat).
- **참고**: 이미 [DEPLOYMENT_ROADMAP.md:315](DEPLOYMENT_ROADMAP.md#L315)에 명시되어 있던 함정. async용 `DATABASE_URL`은 이미 Pooler였으나 sync 버전만 누락.

### 3. PyPI 빌드 flakiness
- **증상**: 같은 commit/같은 requirements.txt로 backend, celery-worker, celery-beat 동시 빌드 — 셋 중 하나만 `ERROR: THESE PACKAGES DO NOT MATCH THE HASHES` (pydantic).
- **원인**: PyPI CDN의 일시적 일관성 문제 또는 다운로드 중 손상.
- **해결**: Railway에서 해당 서비스 "Redeploy" 한 번이면 성공. 코드 수정 불필요.

### 4. Vercel: `www`와 `apex` 어느 쪽이 canonical
- Vercel은 기본적으로 **www를 canonical로 권장** (체크박스 "Redirect classauto.live to www..." 기본 체크됨).
- 우리 브랜드는 **apex(classauto.live)가 canonical**.
- 도메인 추가 시 체크박스를 **반드시 해제**해야 함. www는 별도로 추가하고 "Redirect to Another Domain → classauto.live (308 Permanent)"로 설정.

### 5. OAuth `invalid_state` — Service Worker 가 아니라 frontend/backend state 라운드트립 단절
- **증상**: 시크릿 창 첫 로그인은 통과하지만, 두 번째 로그인부터 `?error=invalid_state` 로 매번 차단.
- **첫 가설 (틀림)**: Service Worker 가 `/auth/callback?code=...` 를 가로채서 query string 손실. 실제로 SW 의 fetch 핸들러는 query 를 그대로 전달하므로 무관.
- **실제 원인**: 프론트가 `oauthState.issue()` 로 sessionStorage 에 state CSRF 토큰을 발급하지만, **백엔드 `/api/auth/google` 가 그 state 를 무시**하고 자체 UUID 만 Google 로 보냄. 콜백 redirect URL 에도 frontend state 가 echo 되지 않아 `oauthState.consume(null)` 이 항상 mismatch 로 실패.
- **해결**: frontend state CSRF 레이어 폐기 (commit `14153c3` `lib/auth.ts` + `faf860e` `CallbackContent.tsx`). 백엔드 Redis state (UUID + getdel + 10분 TTL) 단일 검증으로 일원화.
- **교훈**: SW 의심하기 전에 프론트 ↔ 백엔드 state 흐름의 echo 단계를 먼저 확인. 사용자가 직접 만든 [PR #110](https://github.com/hdj82-bot/classauto.live-/pull/110) (sw.js bypass 강화) 은 close 처리.

### 6. v2 디자인 전환의 4-PR 병렬 worktree 워크플로
- **상황**: 사이트 전체 (메인 마케팅·교수자·학생) 를 v2 디자인 (라이트 베이지 + 골드 dual surface) 으로 전환. Studio(05) · Student(06) prototype 두 개에서 통합 토큰 추출.
- **분담**: 4 git worktree 로 병렬 작업
  - `classauto-v2/` → 창 1: design-system 문서 + `globals.css` + `tailwind.config.ts` + `components/ui/*` 6개 (Button/Card/GoldPill/Han/BrandDot/SavedChip) + Header v2 + IFL 잔재 제거 (`feat/design-system-v2` → PR #111)
  - `classauto-v2-marketing/` → 창 2: `/`, `/features`, `/pricing`, `/demo` + 보조 9종 (`feat/marketing-v2` → PR #113)
  - `classauto-v2-professor/` → 창 3: `/professor/*` 11종 (`feat/professor-v2` → PR #112)
  - `classauto-v2-student/` → 창 4: `/v/*`, `/lecture/*`, player, 인터스티셜, 학생 측 auth (`feat/student-v2` → PR #114)
- **충돌 회피 규칙**:
  - `globals.css` · `tailwind.config.ts` · `components/ui/*` 는 창 1만 손댐. 다른 창은 토큰 변수만 사용.
  - 각 페이지 폴더는 한 창만 소유. 다른 창 영역은 절대 수정 금지.
  - `messages/{ko,en}.json` 본체는 기존 키 수정·삭제 금지, 새 키만 append. (실제로는 창 2/4 가 `_patches/*.json` 별도 파일로 분리, 창 3 만 본체 직접 수정 — 후속 정리 대상)
- **결과**: 4-PR 모두 rebase 충돌 0건. 직접 파일 충돌도 0건. **창 사이 영역 분리 정책이 작동함을 확인**.
- **격파한 CI 함정**:
  - `react-hooks/set-state-in-effect` 7건 — effect body 안에서 동기 setState 호출 금지. `requestAnimationFrame` 한 번 거쳐 비동기화 (다음 프레임에 setState).
  - `@next/next/no-html-link-for-pages` 2건 — 내부 navigation 은 `<a>` 가 아니라 `next/link` 의 `<Link>` 사용.
  - 페이지 본문 재작성에 따른 stale unit test 16건 — v1 텍스트·DOM 셀렉터 expect 가 무효화. `.skip` 처리 후 후속 PR 에서 v2 회귀 재작성 예정 (후속 작업 목록 §1 참조).
- **교훈**: 페이지 재작성 PR 에서는 기존 unit test 가 거의 항상 깨진다. PR 작성 시점에 자기 영역의 `__tests__/**/*` grep + skip 처리를 같이 하는 게 정공법.

---

## 알려진 미해결 이슈

### React error #418 (Hydration mismatch)

- **위치**: 메인 랜딩 페이지 `https://classauto.live`
- **증상**: 브라우저 콘솔에 `Uncaught Error: Minified React error #418` 1건. 시크릿 창에서도 재현(확장 무관 확정).
- **추정 원인**: [frontend/src/components/landing/StatCounter.tsx](frontend/src/components/landing/StatCounter.tsx) — 카운트업 애니메이션의 SSR/hydration 초기값 결정 또는 `value.toLocaleString()` locale 차이.
- **영향**: 페이지 기능 정상 (React가 client-side 폴백 렌더링). SEO/Core Web Vitals에 소폭 손해.
- **우선순위**: 중. Phase 6 전에는 잡는 게 좋음. 단일 컴포넌트 문제로 보여 30분 내 수정 가능 추정.
- **v2 재검증 필요**: 메인 랜딩이 v2 로 전면 재작성되어 (창 2 PR #113) StatCounter 가 어떻게 통합됐는지·재현되는지 다시 확인. v2 빌드에서 자연스럽게 해소됐을 수도, 다른 컴포넌트로 위치만 옮겨갔을 수도 있음.

### 후속 정리 PR 4가지 (v2 머지 후속, 우선순위 순)

1. **i18n `_patches/*.json` 본체 통합** — 창 2 의 `demo.{ko,en}.json` / `landingHub.{ko,en}.json` / `marketing.{ko,en}.json`, 창 4 의 `student.{ko,en}.json` 을 `messages/{ko,en}.json` 본체로 머지. 빌드 시 patches 디렉토리를 따로 로드하지 않는다면 단순 dead file. 통합하면 i18n 키 검색·수정 한 곳에서 가능.
2. **Dead duplicate 정리** — 창 3 의 `components/professor/shell/` 안 `PrimaryButton.tsx`, `Card.tsx`, `Topbar.tsx`, `Sidebar.tsx`, `tokens.ts` 가 창 1 의 `components/ui/Button`, `ui/Card`, `ui/BrandDot` 과 기능 중복. 같은 표면 토큰을 두 곳에 정의하는 상태 → ui/* 로 흡수 또는 명확히 분리 유지 (예: shell 컴포넌트는 교수자 layout 전용 wrapper 만 남김). 창 2 의 `components/landing/HanCharBadge.tsx` 도 `ui/Han` 과 중복.
3. **Skip 처리한 16개 테스트 v2 회귀 재작성**:
   - 창 2 PR #113 본문 명시 — v2 hero copy ("강의 영상이 학생에게 답합니다"), features 섹션, demo 분야 매핑 (社會科學/把자문, 自然科學/광합성), pricing CTA 카운트 새 규칙
   - 창 4 PR #114 본문 명시 — `SignupWizard.test.tsx` 신설 (Step1 이메일 valid/invalid, Step2 resend 카운트다운, Step3 OAuth start + sessionStorage stash)
4. **OAuth state dead code 제거** — `lib/api.ts` 의 `oauthState` (issue·consume·hasIssued) 와 `OAUTH_STATE_KEY` 가 더 이상 호출되지 않음. `__tests__/lib/api.test.ts` 의 oauthState 단위 테스트 7개도 함께 제거. 단 sessionStorage 잔재 호환을 위한 silent ignore 가 필요할 수도 있어 careful drop.

---

## 다음 세션 작업 — Phase 5 스모크 테스트

Phase 4 전체와 v2 디자인 전환이 완료됐으므로, 다음 핵심은 **실제 파이프라인 (PPT → Celery → Claude → HeyGen) 이 v2 디자인 위에서 끝까지 도는지** 검증.

### 1. 강좌 생성 (1분)
1. `https://classauto.live/professor/dashboard` 진입
2. "신규 강의 만들기" → `/professor/lecture/new` 또는 `/professor/studio` 진입
3. 강좌명·학과·학기·학생 정원 임의 입력 후 저장
4. **확인 포인트**: DevTools Network 에서 `POST /api/v1/courses` 또는 `/api/v1/lectures` 가 201 응답

### 2. PPT 업로드 → Celery 큐잉 (2~5분)
1. 작은 PPT (5~10슬라이드, 5MB 이하) 업로드
2. studio 마법사가 처리 중 상태로 전환되는지
3. **확인 포인트** (병렬 탭):
   - Railway → backend → Logs: `POST /api/v1/lectures/{id}/pipeline` 200
   - Railway → celery-worker → Logs: `Received task ...` → `succeeded in Xs`
4. 흔한 실패: `boto3.exceptions.S3UploadFailedError` (S3 키 잘못) 또는 `anthropic.APIError` (Claude 키 만료·한도)

### 3. 스크립트 생성 결과 (5~10분)
1. Claude 가 슬라이드별 스크립트 생성 → DB 저장 → 자동 새로고침
2. 스크립트 에디터에서 슬라이드별 텍스트 확인
3. 임의 슬라이드 편집·저장 후 재로드 시 유지되는지 (`PATCH /api/v1/videos/{id}/script`)

### 4. 학생 시청 흐름 (5분)
1. 강의 상세에서 학생 진입 URL 추출 (예: `https://classauto.live/v/{slug}`)
2. 시크릿 창에서 진입 → 학생 회원가입 → 시청
3. 영상 렌더링 전이면 "준비 중" 상태 표시 확인
4. 렌더링됐다면 재생 → 인터스티셜 퀴즈 출현 → 응답 → 진행률 저장

### 시작 전 가벼운 확인
- `https://classauto.live/health` 또는 `https://api.classauto.live/health` 5/5 ok
- 시크릿 창에서 hdj82@kyonggi.ac.kr 로그인 → 대시보드 정상 진입 (v2 디자인이 보여야 함)

### 막힘 신호
어디서 막히든 다음 두 줄만 알려주시면 진단됩니다:
- Railway 로그 마지막 50줄
- 브라우저 DevTools Console + Network 의 빨간 줄

---

## 2026-05-16 4-레인 병렬 워크플로

v2 전환 때 검증된 "창당 파일 도메인 단독 소유" 정책(§6 참조)을 재적용. Phase 5 스모크 테스트(교수자가 브라우저에서 직접 수행하는 운영 작업)와 병행해 코드 작업을 4개 git worktree로 동시 진행. **작업 시점 의존성 0 — 4창 동시 출발 가능. 순서 의존성은 머지 시점에만 존재.**

| 레인 | 브랜치 | 단독 소유 도메인 | 작업 |
|---|---|---|---|
| 창 1 | `chore/backend-deps` | `backend/**` + 루트 `DEPLOYMENT_PROGRESS.md` | 진행 문서 갱신(이 커밋) + Dependabot #108(anthropic 0.30→0.100)·#105~107·#109·#66(python 3.14) |
| 창 2 | `fix/hydration-418` | `frontend/src/components/landing/StatCounter.tsx` + 해당 페이지만 | React #418 hydration mismatch v2 재검증·수정 |
| 창 3 | `chore/v2-followup` | `messages/**`·`_patches/**`·`components/ui/**`·`components/professor/shell/**`·`components/landing/HanCharBadge.tsx`·`**/__tests__/**`·`lib/api.ts` | v2 후속 정리 4종(§"후속 정리 PR 4가지") |
| 창 4 | `chore/frontend-deps` | `frontend/package.json`·`frontend/Dockerfile`·`.github/workflows/**`·`.trivyignore` | 프론트 의존성·CI bump 분류·통합 |

**충돌 회피 규칙**
- `DEPLOYMENT_PROGRESS.md`는 창 1 단독 소유. 창 2·3·4는 절대 수정 금지.
- landing 폴더 안에서도 파일 단위 분리: `StatCounter.tsx`=창 2, `HanCharBadge.tsx`=창 3.
- `components/ui/*`·i18n 메시지 본체는 창 3만 손댐.
- 각 창은 자기 도메인 밖 파일을 절대 수정하지 않는다(다른 창 영역은 read-only).

**머지 순서**: 창 1 → 창 2·창 4(저위험·기계적) → 창 3(최대 규모, rebase 마지막).

**스모크 테스트 사전 점검**: 창 1의 anthropic 0.30→0.100은 메이저 점프라 백엔드 Claude 호출이 깨질 수 있음. 권장 순서 — ① 현재 프로덕션으로 베이스라인 스모크 테스트 1회 → ② 창 1 머지·재배포 → ③ 재테스트. 이렇게 해야 파이프라인 실패가 "기존 버그"인지 "SDK 업그레이드 탓"인지 분리됨.

### 진행 현황 (2026-05-16 최종 — 4레인 전부 머지 완료)

| 레인 | 상태 |
|---|---|
| 창 1 (`chore/backend-deps`, **#148**) | ✅ **머지 완료**. lib floor bump(#105~109) + 진행 문서. anthropic 0.30→0.100 코드 변경 불필요 확인, CI 전부 그린. python 3.14(#66)는 분리 — 아래 참조 |
| 창 2 (`fix/statcounter-hydration-locale`, **#147**) | ✅ **머지 완료**. StatCounter `toLocaleString()` → locale 무관 결정적 함수로 교체. (단 #418 실제 원인은 StatCounter 가 아님 — 아래 "미할당 갭" 갱신 참조) |
| 창 3 (`chore/v2-followup`, **#153**) | ✅ **머지 완료**. v2 후속 정리 4종: ① i18n `_patches` 본체 통합 ② shell↔ui 중복 "명확한 wrapper 분리"(brand-dot 만 canonical 흡수) ③ skip 16개 v2 회귀 재작성(+`SignupWizard.test.tsx` 신설) ④ OAuth state dead code careful drop. 524→517 tests, **0 skipped** |
| 창 4 (`chore/frontend-deps`, **#149 / #151 / #152**) | ✅ **머지 완료**. 프론트 의존성·CI bump 분류·통합. **#150 → #78 로 일원화**(중복 제거, #150 close) |

**결론: 2026-05-16 4-레인 병렬 워크플로 4창 전부 머지 완료.** v2 전환(§6) 때 검증된 "창당 파일 도메인 단독 소유" 정책이 2회 연속 무충돌(rebase 충돌 0, 직접 파일 충돌 0)로 작동함을 재확인. **단, 이는 코드/문서 정리의 완료일 뿐 — Phase 5 파이프라인 검증은 별개이며 여전히 미수행(상단 상태 메모 참조).**

**머지 순서 메모**: 창 2가 창 1보다 먼저 머지됐으나 도메인 분리(backend ↔ frontend/landing)로 충돌 0. 창 3은 최대 규모라 rebase 마지막 대상으로 처리(origin/main rebase 후 머지).

**python 3.14(#66) 분리 사유**(유지): `Docker Build & Push` 잡이 PR/draft에서 **skipped**, main push 시에만 실행. Backend Test도 Dockerfile이 아닌 CI 런너 파이썬으로 돌아 3.14를 검증하지 않음. 일반 PR에 포함하면 머지 후 main에서 도커 빌드가 처음 돌고 C-extension(psycopg2-binary/Pillow/asyncpg/pgvector) 휠 부재 시 **프로덕션 배포가 깨짐**. → 별도 PR에서 `workflow_dispatch` 또는 main 머지 전 도커 빌드 실검증 후 진행. `backend/**` 소유라 창 1 후속 작업으로 남김(아래 "열린 PR" 표 #66 참조).

### 미할당 갭 — React #418: 실원인 미상 (2026-05-17 정정 — 이전 "원인 확정" 반증)

> ⚠️ **2026-05-17 정정**: 아래 2026-05-16 "정적 분석으로 원인 확정" 기록 중
> **I18nContext `useSyncExternalStore` 가설은 창 2(PR #164)의 재현 검증으로
> 반증**됨. 프로덕션 #418 의 실원인은 **여전히 미상**. 후속 추적은 본 단락
> 말미 "남은 조사" 참조.

이전 가설(StatCounter `toLocaleString()` SSR/hydration)은 **오진으로 종결**. 이하 2026-05-16 정적 분석 기록 — StatCounter 항목은 유효, I18nContext 항목은 아래 반증으로 무효:

- **StatCounter 는 무관 (고아 컴포넌트)**: #117(전체 섹션 제거) 이후 어떤 페이지에서도 import·렌더되지 않음. 창 2 #147 이 StatCounter 를 locale 무관 결정적 함수로 고쳤으나 렌더 경로에 없어 #418 과 무관(예방적 정리로만 의미). — *유효*
- **~~확정된 실제 원인 — `frontend/src/contexts/I18nContext.tsx` 의 `useSyncExternalStore` 로케일 스냅샷 불일치~~ (반증됨)**: 〔원 기록: 서버 스냅샷=`'ko'`, 클라 스냅샷=localStorage `ifl-locale` → SSR=ko/첫 CSR=en hydration mismatch 라는 추정〕. **창 2(PR #164) 재현 검증 결과**: `useSyncExternalStore(subscribe, getSnapshot, getServerLocaleSnapshot)` 는 하이드레이션 첫 client 렌더에서 React 가 **세 번째 인자(서버 스냅샷 `'ko'`)** 를 쓰도록 보장 → 하이드레이션 렌더 = SSR = `ko` 로 일치, 이 경로에서 #418 **발생 안 함**(이후 `useEffect` 에서 `en` 전환). 의도적 텍스트 불일치는 `onRecoverableError` 가 정상 포착(하네스 유효)했으나 이 경로는 게이트 제거 여부와 무관하게 recoverable 에러 0건.
- **수정 상태 정정**: 커밋 `56b71a1`(`fix/i18n-hydration-418` 의 `didHydrate` 게이트)은 #418 에 대해 **무해하지만 no-op** — 실원인이 아니므로 해소하지 않음. PR #164 는 `frontend/__tests__/contexts/I18nContext.test.tsx` 의 SSR↔hydrateRoot 안전성 회귀 가드 3건만 추가하고 **"미검증 꼬리표" 유지**(원인 미상이므로). StatCounter 영역 신규 레인 배정은 여전히 불필요(원인 아님).

**남은 조사 (실원인 미상 — 별도 추적 이슈 등록 예정)**:

- 메인 랜딩 `frontend/src/app/page.tsx` 및 공유 컴포넌트의 SSR/CSR 비결정 렌더 후보 조사: `Date`/시간 의존, `Math.random`, `typeof window`, locale·timezone 의존 분기 등.
- `onRecoverableError` 계측을 Preview/프로덕션에 일시 부착해 #418 이 실제 발생하는 컴포넌트·텍스트를 캡처 — 정적 추정보다 **실측 우선**.
- #418 은 React 가 클라이언트 재렌더로 복구하는 **recoverable** 결함 — 베타 하드 블로커는 아니나 실재 미해결 버그(문서의 이전 "해결" 표기는 본 정정으로 무효).
- 탐색형이며 app 전반 touch 가능 → **병렬 창 작업 부적합, 단독 세션 권장**. PR #164 회귀 가드는 I18nContext 경로 안전성만 보증하며 이 갭을 닫지 않음.

### 열린 PR (2026-05-16 현재 — 머지 대기/판단 필요)

| PR | 내용 | 상태 · 필요 조치 |
|---|---|---|
| [#66](https://github.com/hdj82-bot/classauto.live-/pull/66) | python 3.14 bump | ✅ 코드 작성 완료(`chore/backend-deps-followup`: `Dockerfile`+`Dockerfile.prod` 2스테이지). cp314 wheel 전부 PyPI 확인. ⏳ **`develop` 채널 push 로 docker-build-push(Trivy CVE 게이트 포함) 그린 검증 후 main**. Dependabot #66 은 B 브랜치가 대체 → close 예정. |
| [#108](https://github.com/hdj82-bot/classauto.live-/pull/108) | Dependabot anthropic → ≥0.102 | ✅ 0.100→0.102 시그니처 무변경 재확인, `chore/backend-deps-followup` 에 `>=0.102.0,<1.0.0` 반영. Dependabot #108 close 예정. |
| [#135](https://github.com/hdj82-bot/classauto.live-/pull/135) | 듀얼슬롯 hero 크로스페이드 | ❌ **CLOSE 확정**(분석 레인). #136 에서 사용자가 명시적으로 폐기한 듀얼슬롯 설계 — 재도입 위험, 살릴 코드 0, page.tsx 충돌. close 시 사유로 #136 링크. |

### 운영 정리 메모 (2026-05-16)

- **브랜치 정리**: 머지 완료/포함 + 분석 레인 판정으로 **삭제 안전 54개**(머지 48 + main포함 4 + REVIEW 2). 단 `fix/landing-cta-skip-demo-hero` 는 UX 의도 이슈 등록 후 삭제. GitHub **Settings → "Automatically delete head branches" 활성화** 필수(재발 방지).
- **토큰**: 채팅 평문 노출 PAT revoke 완료 → 재발급 진행 중(이후 push·PR·close·삭제 일괄 처리).

### 후속 발견 — Dockerfile.prod / Dependabot 사각지대 (2026-05-16, 토큰 재발급 대기 단계)

4-레인 통합 점검 중 확인된 **구조적 함정**:

- `backend/Dockerfile`·`frontend/Dockerfile` = **dev/compose 전용**(docker-compose.yml 이 `dockerfile: Dockerfile` 참조) — **Dependabot docker 가 보는 파일**.
- `backend/Dockerfile.prod`·`frontend/Dockerfile.prod` = **CI·프로덕션 실제 빌드**(ci.yml docker-build-push) — **Dependabot 사각지대**(docker ecosystem 은 `Dockerfile` 정확한 이름만 스캔, dependabot.yml v2 에 파일명 옵션 없음).
- 결과: **머지된 #151(node 20→24)이 prod frontend 에 무효**(여전히 node 20.18.1). #66 도 dev 만 바꾸면 동일 무효였을 것.
- **대응**: 신규 브랜치 `fix/prod-dockerfile-parity` — ① `frontend/Dockerfile.prod` 3스테이지 node 24 ② `ci.yml` 에 `Dockerfile`↔`Dockerfile.prod` 베이스 이미지 패리티 가드 잡 신설(불일치 시 CI red, docker-build-push `needs` 게이트) → 드리프트 영구 차단. 메모리에도 기록(차기 Dependabot 주기 재발 방지).

### 분석 레인(읽기 전용) 판정 — REVIEW 브랜치 2개

- `feat/features-page-studio-flow-v2`: main #144(반응형 React)가 상위 호환으로 대체, 방향 역행 → **삭제**(살릴 가치 0).
- `fix/landing-cta-skip-demo-hero`: UX 의도(랜딩 CTA→학생 체험 직진)는 정당하나 35커밋 뒤·page.tsx 충돌 → **UX 의도를 이슈로 등록 후 신규 소규모 재구현, 브랜치는 삭제**.

### 토큰 재발급 후 처리 큐 (로컬 커밋 전부 대기 중)

| # | 작업 | 브랜치/대상 |
|---|---|---|
| 1 | push + PR | `fix/i18n-hydration-418`(682e460) · `chore/backend-deps-followup`(b1b84e2·db51af3) · `fix/prod-dockerfile-parity`(aba49a8) |
| 2 | `develop` 채널 push → #66·node24 docker-build+Trivy 그린 검증 → main 머지 | 머지순 **P → A → B** |
| 3 | #135 close(#136 사유) · `landing-cta` UX 이슈 등록 · Dependabot #66/#108 close | |
| 4 | 브랜치 54개 삭제 + auto-delete 활성화 | |
| 5 | **이 문서(`docs/progress-final`) 최종 머지** — 맨 마지막 | |

> 검증 한계: 이 환경 `node_modules`·docker 데몬 부재로 #418(vitest/next build)·#66(도커 빌드/Trivy)는 CI 또는 node 환경에서 최종 확인 필요. **그리고 1~5 전부와 무관하게 Phase 5 파이프라인 스모크 테스트(교수자 수동)가 실제 배포의 유일한 블로커로 여전히 미수행.**

### 실행 결과 (2026-05-16 — 토큰 재발급 후)

- **P·A·B main 머지 완료**: #156 `f246c63`(prod Dockerfile 패리티+CI 가드) → #154 `56b71a1`(React #418) → #155 `d607672`(python 3.14 dev+prod·anthropic≥0.102·Pillow 12.2.0).
- **`develop` 통합 검증 채널이 실블로커를 사전 포착**: 1차 docker-build 에서 Trivy HIGH 게이트 실패 — 원인은 python 3.14 가 아니라 **Pillow 11.3.0 의 CVE-2026-25990 / -40192 / -42311**(2026-05 신규 공개, base 버전 무관). 기존 핀 `Pillow<12.0.0` 이 수정판(12.2.0)을 차단하던 것. `Pillow>=12.2.0,<13.0.0` 으로 해소(B `71444b0`), develop 재검증 docker-build(backend python3.14+Pillow12.2.0·frontend node24)·Trivy·Dockerfile-Parity 전부 ✅.
  - **교훈**: main 직행 대신 `develop` 채널 + Trivy 게이트 + Dockerfile-Parity 가드 조합이 신규 CVE·prod 드리프트를 운영 도달 전에 잡음을 실증. 이 흐름을 표준 절차로.
- **남은 정리(쓰기 권한 분류기 차단으로 수동)**: #135 close(#136 사유) · `fix/landing-cta-skip-demo-hero` UX 의도 이슈화 · Dependabot #66/#108 close(B PR 이 대체) · 잔여 브랜치 일괄 삭제 + "Automatically delete head branches" 활성화 · 본 문서 PR 머지 · 작업 종료 후 PAT revoke.
- **불변**: Phase 5 파이프라인 스모크 테스트(교수자 수동)는 여전히 미수행 — 실제 배포의 유일한 블로커.

### Phase 6 준비 라운드 (2026-05-16 — 스모크 불필요·수동 불필요 트랙)

스모크 전 가능 + 교수자 수동 불필요 + 순수 리포 코드/문서인 것만 3창 병렬로 처리, develop 통합 검증(3.14/24 런너·docker·Trivy 전부 ✅) 후 main 머지:

- **#159 `dd8017a` (chore/ci-runner-align)**: `ci.yml` env PYTHON_VERSION 3.12→3.14·NODE_VERSION 20→24 (CI 테스트 런타임을 prod 이미지와 일치 → 버전 스큐 prod-only 회귀 사전 포착). `.trivyignore` 의 GHSA-q4gf-8mx6-v5v3(Next.js DoS) 제거 — frontend `next 16.2.6` ≥ fixed-in 16.2.3. **develop 검증으로 dev/test deps 의 3.14/24 런너 통과 실증**.
- **#160 `9522d07` (chore/observability-hardening)**: 학생 데이터 보호 코드 하드닝. `core/sentry.py` _SENSITIVE_KEYS(exact)에 `student_number`·`name`·`google_sub` 추가(complete-profile 본문 등이 Sentry 로 학번·실명·OAuth ID 평문 전송되던 갭 차단). `core/logging.py` defense-in-depth KV 패턴(`email`·`student[_-]?number`·`student[_-]?id`; `name` 은 좌측 경계 부재로 정상 키 오손상 위험 → 의도적 제외).
- **#161 `5d2d047` (docs/ops-runbook)**: `OPERATIONS_RUNBOOK.md` 신설 — 배포 게이트 활성화 절차·develop 검증 SOP·Dockerfile↔.prod 패리티·롤백·Phase 5 스모크 링크.

**미할당 후속 갭 (창2 발견)**: `backend/app/core/metrics.py` 의 `CELERY_TASK_COUNT`·`EXTERNAL_API_CALLS`·`EXTERNAL_API_DURATION` 3종이 정의만 되고 증가 호출 0곳 = 死코드. 와이어링 위치(`app/tasks/*`·`app/services/pipeline/*`)가 관측 레인 범위 밖이라 미수행. **파이프라인 핵심 관측 지표 — Phase 5 스모크 시 진행 가시성과 직결**되므로 별도 소규모 작업 필요(`@task` 데코·외부 클라이언트 호출부 계측).

**잔여 (전부 Phase 5 와 무관한 품질/후속)**: 위 Prometheus 계측 · React #418 브라우저 실검증(node_modules 없어 미검증) · `landing-cta` UX 신규 재구현(이슈 등록됨). 그리고 **Phase 5 스모크 테스트가 실제 베타 배포의 유일한 블로커임은 불변** — 다음 세션 1순위.

---

## 참고 — 도메인 종합 정리

```
사용자가 접속:
  https://classauto.live           → Vercel (Next.js production) ✅
  https://www.classauto.live       → 308 → classauto.live ✅

프론트 → 백엔드 API 호출:
  https://api.classauto.live       → Railway (FastAPI) ✅

외부 콜백:
  Google OAuth →  https://api.classauto.live/api/auth/google/callback ✅
  HeyGen Webhook → https://api.classauto.live/api/v1/webhooks/heygen ✅
```

---

## 오늘(2026-05-13) 머지된 PR

| PR | 제목 | base | 머지 commit |
|---|---|---|---|
| [#111](https://github.com/hdj82-bot/classauto.live-/pull/111) | feat(design-system): adopt v2 — light beige + gold dual surface | main | `acdb612` |
| [#112](https://github.com/hdj82-bot/classauto.live-/pull/112) | feat(professor): v2 디자인 — 교수자 화면 전면 재작업 | main | `8ceabfa` |
| [#114](https://github.com/hdj82-bot/classauto.live-/pull/114) | feat(student-v2): 학생 화면 v2 전면 재작업 (06 prototype 변환) | main | `efa85ed` |
| [#113](https://github.com/hdj82-bot/classauto.live-/pull/113) | feat(marketing-v2): 마케팅·보조 페이지 13종 v2 디자인 언어 전환 | main | `63aaf9f` |

closed: [#110](https://github.com/hdj82-bot/classauto.live-/pull/110) — sw.js OAuth bypass (실효 없음 — 실제 원인은 OAuth state 라운드트립 단절, §5 참조)
