# 배포 진행 상황 (Deployment Progress)

> 이 문서는 [DEPLOYMENT_ROADMAP.md](DEPLOYMENT_ROADMAP.md) 진행 체크포인트입니다.
> 마지막 업데이트: **2026-05-13**

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
  └─ 4.7 ✅ 디자인 시스템 v2 전환 (라이트 베이지 + 골드 dual-surface, 4-PR 병렬 머지)
Phase 5 🔄 스모크 테스트 (다음 작업 — Google 로그인 ✅, PPT→Celery 미진행)
Phase 6 ⏳ CI/CD & 운영 정착
```

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
