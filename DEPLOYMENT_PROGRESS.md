# 배포 진행 상황 (Deployment Progress)

> 이 문서는 [DEPLOYMENT_ROADMAP.md](DEPLOYMENT_ROADMAP.md) 진행 체크포인트입니다.
> 마지막 업데이트: **2026-06-18**
>
> ⚠️ **읽는 법**: 이 문서는 변경 이력 누적형입니다. **최신 실상태의 단일 기준은 바로 아래
> "2026-06-19 현재 상태(SUPERSEDES)" 단락**입니다. 그 아래 2026-06-18·06-05·05-16/05-17 기록은
> **당시 시점의 역사 기록**입니다.

---

## 2026-06-19 현재 상태 (SUPERSEDES — 이 단락이 최신 단일 기준)

**프로덕션 라이브 유지.** 06-18 단락이 "후속(테이블 필요)"·"갭"으로 남겨 둔 항목 대부분이
그 이후 머지(최신 #526)에서 **이미 해소**됐다. 06-18 단락은 역사 기록으로 강등한다.

**스펙 11 후속 — 일괄 완료** (06-18 §"스펙 11 후속(테이블 필요)" 목록 해소)
- **B 전주 대비 델타** → `/dashboard/{id}/kpi` + `services/cohort_metrics.py:143~165`(7일 이전 스냅샷 비교).
- **C 성취율 추이** → `/dashboard/{id}/trend` + `cohort_daily_metrics`(0059) + `tasks/cohort.py` 일배치(beat).
- **G 빈번 질문어(한/중/영)** → `/dashboard/{id}/qa-keywords` + `services/qa_keywords.py` + `QaKeywords.tsx`.
- **H-3 목표 달성률** → `/dashboard/{id}/goals` + `learning_goals`(0060) + `services/goals.py`.
- **H-4 격려·개입 행동 로그** → `instructor_actions`(0061) + `services/instructor_actions.py` (#526, 최신 커밋).
- **A PDF export** → 브라우저 인쇄 방식(스펙 11 §A, `analytics/[lectureId]/page.tsx` `print-hide`).

**QA 아바타 렌더 비용 기록 — 완료** (06-18 §"알려진 갭" 1번 해소)
- `0058_add_avatar_qa_cost_category` + `tasks/qa_batch.py:_record_qa_render_cost` 가 완료된 QA 렌더를
  `platform_cost_logs`(CostLog, `category=AVATAR_QA`, `model=provider`)로 적재. 운영자 비용 대시보드
  과소집계 해소. **이로써 VisionStory $ 서킷 브레이커의 선행조건(합산 데이터)이 충족됨.**

**React #418 — 실측 계측 완료(원인 수정은 미완)**
- `lib/hydrationErrorReporter.ts` + `instrumentation-client.ts` 가 hydration 직전 `console.error` 를 감싸
  recoverable mismatch(418~425)만 골라 Sentry 로 보고(`mechanism=hydration-mismatch` + componentStack +
  location + lang + SW controller). 정적 분석으로 안 좁혀지던 실원인을 **실측으로 잡기 위한 계측**.
- **남은 것은 코드가 아님**: Sentry 에서 `mechanism:hydration-mismatch` 이벤트의 componentStack 을 읽어
  실제 mismatch 컴포넌트를 특정 → 수정. 텔레메트리 도착 전까지 블라인드 수정 불가(추적 [#167](https://github.com/hdj82-bot/classauto.live-/issues/167)).

**코드 정리**
- `analytics/[lectureId]/page.tsx` 의 `cost` dead-fetch(정책상 UI 비노출) 제거 + `CostData` import·`"cost"` SectionKey 정리.
- `services/pipeline/openai_image.py` 의 stale `_TODO_REAL_CALL` 도크스트링 정정(실제 gpt-image-2 호출은 이미 구현됨).

**알려진 갭 / 후속 (06-19 기준)**
- ⚠️ **VisionStory 전용 $ 서킷 브레이커** — 여전히 미구현(전역 $ 브레이커는 `assert_heygen_budget` HeyGen 전용).
  선행조건(AVATAR_QA 비용기록)은 위에서 충족됨. **권장 기본값: 일 $100 / 월 $300**(계산 근거: VisionStory
  $0.033/s = HeyGen $0.0167/s 의 ~2배, C-2 강의당 5회 상한이 1차 방어선이고 이 브레이커는 재시도 폭주·버그성
  대량 렌더 사고를 막는 2차선 — 정상 베타 사용을 막지 않을 만큼 넉넉하되 사고를 수백 달러 선에서 끊는 값).
  `platform_cost_logs WHERE category=AVATAR_QA AND model='visionstory'` 를 시간 윈도로 합산하면 됨. env 조정 가능.
- **React #418 root-cause fix** — Sentry 텔레메트리 의존(위 참조).
- **/demo 영상 자산** — `public/demo/` 에 SVG 포스터만 있고 실제 mp4 부재(`DemoVideo.tsx` TODO). 콘텐츠 생성 과제(보류).
- 외부 업타임 모니터를 `/health/deep` 에 연결·주1회 `pg_dump` 백업 등 운영 항목 — [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md) §8.

---

## 2026-06-18 현재 상태 (역사 기록 — 위 06-19 단락이 SUPERSEDES)

**프로덕션 라이브 유지.** 06-05 이후 베타 운영자 콘솔(스펙 13)과 분석 대시보드(스펙 11)
보강이 들어갔다. 2026년 8월 교수진 베타가 목표.

**스펙 13 — 베타 운영자 콘솔 (A~G) 완료**
- 백엔드 A~G (#513): 테스터 사용량 롤업·비용 통합·활성화 퍼널·감사 로그·인앱 피드백·
  코호트/동의 컬럼·HeyGen 예산 250/600 상향.
- C-2 강의당 아바타 재제작 상한 (#514·#516): `lectures.avatar_render_count`(0057) +
  게이트(첫 제작 1+재제작 4=5회) + 재제작 엔드포인트 429 + 운영자 리셋. **VisionStory(본인
  얼굴)는 전역 $ 브레이커가 없어 이 횟수 상한이 유일한 방어선.** 성공 제출 패스만 카운트.
- G 동의 (#515): complete-profile 에 베타 모니터링 동의 체크박스 — **이 머지 전까지 교수자
  신규 가입이 백엔드 422 로 막혀 있던 것을 해소(핫픽스)**.
- 운영자 콘솔 프론트 (#518): `/admin/beta`(개요 테이블+퍼널+드릴다운)·`/admin/feedback`
  (인박스)·`/admin/audit`(감사 로그) + 전역 피드백 버튼(교수/학생 공통).

**스펙 11 — 분석 대시보드 보강**
- E 학생 개별 진척도 그리드 + 위험 배지 (#517).
- F 재생 구간 히트맵 계측 + D 집중도 점수(0~100·도넛) + G 요약 카드 (#519, **머지 대기**).
  - F: 학생 플레이어가 watch-events 를 보내지 않던 갭을 PlayerV2 계측으로 연결(fire-and-forget).
  - D: `dashboard._attention_score`(가중 감점식, 상수 문서화) → `engagement.summary.attention`.

**관측**: Prometheus 3종(CELERY_TASK_COUNT·EXTERNAL_API_CALLS·EXTERNAL_API_DURATION)은
**이미 와이어링 완료**(celery 시그널 + `@track_external_api`). 05-16 의 "死코드" 메모는 해소됨.

**알려진 갭 / 후속**
- ⚠️ **QA 아바타 렌더 비용 미기록** — HeyGen·VisionStory Q&A 렌더는 `RenderCostLog`
  (video_render_id FK)에 들어갈 수 없고 어디에도 비용이 기록되지 않는다. 그래서 운영자 비용
  대시보드(/admin/costs·beta-overview)가 **QA 렌더 비용을 누락(과소 집계)**한다. 해소안:
  QA 렌더 완료(`qa_batch._poll_inflight`) 시 `platform_cost_logs`(CostLog, lecture_id 키)에
  신규 카테고리(예: `AVATAR_QA`)로 기록(provider별 `estimate_cost_usd(duration)`). 이게
  **VisionStory $ 서킷 브레이커의 선행 조건**이기도 하다(브레이커가 합산할 데이터 확보).
- **VisionStory 전용 $ 브레이커** — 위 비용 기록 위에서 HeyGen 브레이커(`assert_heygen_budget`)
  와 동형으로 추가. 스펙 13 §6 이 정식 런칭 전으로 보류, C-2 가 베타 폭주를 이미 차단하므로
  베타엔 불요. 정식 전 사용량 보고 재검토.
- 스펙 11 후속(테이블 필요): C 성취율 추이(`cohort_daily_metrics`+일배치), B 전주 대비 델타,
  H-3 목표 달성률(`learning_goals`), H-4 격려 액션(`instructor_actions`), G 빈번 질문어(한/중
  키워드 추출), A PDF export.
- 외부 업타임 모니터를 `/health/deep` 에 연결(워커 사망 감지) — [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md) §8.
- React #418 hydration(추적 [#167](https://github.com/hdj82-bot/classauto.live-/issues/167)) — recoverable, 하드 블로커 아님.

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
Phase 5 ✅ 스모크/코어 경로 — 프로덕션 라이브. 인증·강좌·PPT 업로드·Celery·스크립트 생성 동작 중.
            코어 루프(영상·아바타·Q&A) 실사용 기반 검증·하드닝 진행 중(아래 §"2026-06-05" 참조).
Phase 6 ✅ CI/CD & 운영 정착 — 배포 토폴로지 코드화(#317)·마이그레이션 자동화·일일 백업·Trivy 게이트 가동.
            외부 모니터/알림 연결은 운영 런북([OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md) §8)으로 코드화.
```

> ## 2026-06-05 현재 상태 (SUPERSEDES — 이 단락이 최신 단일 기준)
>
> **프로덕션은 라이브입니다.** `https://api.classauto.live/health/deep` 가 **5/5 ok**
> (`service·db·redis·s3·celery` 전부 `ok`, `env: production`). 인프라·도메인·마이그레이션
> 자동화가 완료됐고, 교수자가 실제로 강의를 만들고 학생이 시청하는 코어 루프가 돌고 있습니다.
>
> **이전(05-16)의 "Phase 5 스모크 = 단일 최우선 블로커" 서술은 정정합니다.** 그 프레이밍은
> "파이프라인이 프로덕션에서 한 번도 안 돌았다"는 당시 사실에 근거했는데, 이후 3주간(2026-05-17~06-05,
> **PR #199~#345**) 파이프라인이 **실제 운영에서 반복 구동**되며 코어 루프가 검증·하드닝됐습니다.
> 지금의 작업은 "미검증 블로커 해소"가 아니라 **라이브 서비스의 코어 루프 품질·비용·안정성 개선**입니다.
>
> **3주간(#199~#345) 들어간 것 — 요약** (상세는 아래 §"2026-05-17 ~ 06-05 기능 웨이브"):
> - **베타 모드 통합**(#199): 가격·결제 흐름을 가리고 베타 신청으로 일원화.
> - **스튜디오/스크립트 파이프라인 실전화**: 슬라이드 PNG 미리보기(#205~208)·병렬 스크립트 생성+prompt
>   caching(#202)·승인→실제 렌더 연결(#268)·HeyGen 비용 가드레일·서킷 브레이커·중복 렌더 차단(#272·#274).
> - **음성/TTS**: ElevenLabs 보이스 라이브러리·미리듣기·즐겨찾기(#217·#223·#242~247), eleven_v3
>   코드스위칭(중국어 혼합)·전체 합성 전환(#260·#263), 자막 다국어·언어 구간 분리 합성(#252·#253).
> - **본인 아바타(Photo Avatar v0.2)**: 사진→gpt-image-2 룩→Talking Photo 온보딩(#275·#297),
>   룩 라이브러리·16:9·재생성·포즈 분산(#306~328), 한도 초과 자가 회복(#345).
> - **학생 경험**: 클라이언트 슬라이드쇼 플레이어(#329)·본문 클라이언트 슬라이드쇼화(#326), 인터랙티브
>   퀴즈(#256)·소크라테스식 퀴즈 저작(#254), 강의 공유·게시+QR(#341), mp4 on-demand 다운로드(#331).
> - **Q&A 아바타**: 룩+목소리 합쳐 제작·HeyGen=Q&A 답변 전용·야간 배치 캐시(#327·#336·#339).
> - **하드닝/관측**: 프로덕션 필수 키 검증 부팅 크래시화(#315)·CORS 다중 오리진+학생 RAG 권한(#316)·
>   `/health` 경량 liveness vs `/health/deep` 의존성 분리(#224)·민감정보 로깅/Sentry 마스킹(#160).
> - **인프라 코드화**: Railway/Vercel 토폴로지 example + 마이그레이션 자동화(#317, [docs/RAILWAY_DEPLOY.md](docs/RAILWAY_DEPLOY.md)).
>
> **지금의 운영 우선순위**(블로커가 아니라 개선 트랙):
> 1. **외부 업타임 모니터·알림 연결** — `/health/deep` 의 `celery != ok` 를 외부에서 잡아 알림
>    (컨테이너 `/health` 는 liveness 만 봐서 워커 사망을 못 잡음). 절차는 [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md) §8.
> 2. **외부 API soft-limit·비용 가드** — Anthropic/OpenAI/HeyGen/ElevenLabs 한도 상한과 예산 서킷 브레이커 점검.
> 3. **백업 운영** — Supabase 무료 티어 PITR 부재 → 주 1회 `pg_dump` 대안([OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md) §8.4).
>
> ℹ️ React #418(랜딩 hydration, recoverable)은 여전히 추적 이슈([#167](https://github.com/hdj82-bot/classauto.live-/issues/167)).
> 라이브 서비스에 하드 블로커는 아님(아래 "미할당 갭" 참조).

---

## 현재 인프라 상태

### Railway (프로덕션)

| 서비스 | 도메인 | 상태 |
|--------|--------|------|
| backend | `classautolive-production.up.railway.app` | ✅ Active |
| celery-worker | (내부) | ✅ Active, task 9개 등록 |
| celery-beat | (내부) | ✅ Active, 10분 주기 스케줄링 |
| Redis | `redis.railway.internal:6379` | ✅ |

**`/health/deep` 응답 (2026-06-05 확인 — 5/5 ok):**
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

> #224 이후 **`/health` 는 경량 liveness, 의존성 점검은 `/health/deep` 로 분리**됐습니다. 위 5/5 ok 는
> `curl -s https://api.classauto.live/health/deep` 의 실응답입니다. 외부 업타임 모니터는 `/health` 가 아니라
> **`/health/deep` 를 봐야** `celery != ok`(워커 사망) 를 잡습니다 — [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md) §8.1.

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

## (역사·재현 절차) Phase 5 스모크 테스트 시나리오

> 🗓️ **2026-06-05 정정**: 이 절은 원래 "다음 세션 1순위 = 미수행 단일 블로커"로 작성됐으나,
> 그 사이 파이프라인이 **프로덕션에서 반복 구동**되어 코어 루프가 검증됐습니다(상단 "2026-06-05 현재
> 상태" 참조). 따라서 더 이상 "블로커"가 아니며, 아래 시나리오는 **회귀 점검·재현용 체크리스트**로
> 남겨 둡니다(배포 직후·메이저 의존성 bump 후 1회 권장). 운영 런북의 빠른 점검은
> [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md) §7 참조.

원래 의도: 파이프라인 (PPT → Celery → Claude → HeyGen) 이 끝까지 도는지 end-to-end 확인.

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

**남은 조사 (실원인 미상 — 추적 이슈 [#167](https://github.com/hdj82-bot/classauto.live-/issues/167))**:

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

**잔여 (전부 Phase 5 와 무관한 품질/후속)**: 위 Prometheus 계측 · React #418 브라우저 실검증(node_modules 없어 미검증) · `landing-cta` UX 신규 재구현(이슈 등록됨). ~~그리고 Phase 5 스모크 테스트가 실제 베타 배포의 유일한 블로커임은 불변 — 다음 세션 1순위.~~ 〔🗓️ **2026-06-05 정정**: 이 "유일한 블로커" 결론은 무효. 프로덕션이 라이브가 되며 코어 루프가 운영에서 검증됨 — 상단 "2026-06-05 현재 상태" 참조.〕

---

## 2026-05-17 ~ 06-05 기능 웨이브 (PR #199~#345)

> 05-16 이후 3주간 머지된 기능을 도메인별로 정리(전수 아님 — 운영·배포 관점의 굵은 줄기). 번호는 PR.
> 프로덕션 라이브 상태에서 **실사용 피드백 기반으로 반복 하드닝**된 구간이라, 이 목록 자체가
> "파이프라인이 한 번도 안 돌았다"(05-16 가정)를 반증한다.

### 베타/과금
- **#199** 2026 베타 모드 — 가격·결제 흐름을 가리고 베타 신청으로 통합(Stripe 경로는 코드 유지, UI 비노출).

### 스튜디오 · 스크립트 생성 파이프라인
- **#202** 슬라이드 병렬 스크립트 생성 + prompt caching + 마크다운 sanitizer (속도·비용).
- **#203·#204** 검토 패널 인라인 편집 + 슬라이드 단위 Claude 재생성 + 즉시 렌더(메타/스크립트 폴링 분리).
- **#205~208** PPT 슬라이드 미리보기 이미지(S3 presigned, 403 해소) + skeleton 로딩.
- **#222** 전 생성 과정 경량 모델(Haiku)로 — 속도 최우선. **#262** 대시보드 1+6N→2 요청 배치.
- **#268·#269** 승인 시 실제 렌더 연결(생성 0% 멈춤 해소) + 진행률 가중치.
- **#272·#274** HeyGen 비용 가드레일 — 중복 렌더 차단·mock·**예산 서킷 브레이커**·단가 정정·720p. **#270** presigned 오디오 URL.
- **#326** 본문을 클라이언트 슬라이드쇼로 — 전체 생성 시 슬라이드별 HeyGen 렌더 제거(비용 급감).
- **#343·#344** 본문 렌더 완료 시 Video=done 전환(rendering 고착·재approve 409 해소).

### 음성 · TTS · 자막
- **#217·#219·#223·#227** ElevenLabs 보이스 선택·한국어 표기·실제 합성 미리듣기·발화 속도.
- **#242~247·#251·#267** 음성 라이브러리 페이지·즐겨찾기·검색·언어 필터 칩.
- **#237·#240** 교수자 본인 음성 클론(IVC) + 본인 음성 미리듣기. **#289** 클론 품질(multilingual_v2).
- **#260·#263** eleven_v3 코드스위칭(중국어 혼합 단일 합성) → 전체 합성 경로 확장.
- **#226·#228·#230·#252·#253** 자막 슬라이드별 병렬 번역·429 백오프·언어 전환·한자 병음/만다린 발음 교정.

### 본인 아바타 (Photo Avatar v0.2 — gpt-image-2 + Talking Photo)
- **#275·#276·#279** 교수자 본인 얼굴 강의 아바타 온보딩(사진→룩→미리보기) + 브라우저 녹음.
- **#295·#297·#298** v0.2 설계 전환 — HeyGen Design-with-AI train(최대 15분) 병목 제거, gpt-image-2 룩.
- **#305~328** 룩 품질·UX 대량 개선 — 16:9 크롭·포즈 자동 분산(정자세·팔짱·제스처)·소품(마이크)·라이브러리 캡·재생성·진행률.
- **#312·#313·#318** 안전망(리사이즈·lazy 등록·catch-all 가드). **#340·#345** Talking Photo 3개 한도 초과 자가 회복.

### Q&A 아바타 (RAG)
- **#327·#335·#339** Q&A 아바타 = 룩 + 목소리 합쳐 "제작", 음성 선택을 스튜디오에서 분리.
- **#336·#338** 아바타 Q&A 캐시 + 야간 배치(HeyGen = Q&A 답변 전용).
- **#337** 음성 선택 배너 + HeyGen 연결 진단 엔드포인트.

### 학생 경험
- **#256** 학생 재생 중 인터랙티브 퀴즈 + 퀴즈별 정답 공개 여부. **#254** 소크라테스식 퀴즈 저작.
- **#329** 학생 플레이어를 클라이언트 슬라이드쇼로(단일 영상 → 슬라이드+구간음성).
- **#331** mp4 on-demand 다운로드(ffmpeg 합성). **#341** 강의 공유·게시 페이지 + 학생 링크 + QR.

### 하드닝 · 관측 · 인프라
- **#224** `/health` 경량 liveness vs `/health/deep` 의존성 점검 분리(외부 모니터의 워커 사망 감지 토대).
- **#315** 프로덕션 필수 키 검증 — 조용한 실패를 부팅 크래시로. **#316** CORS 다중 오리진 + 학생 RAG 권한 검증.
- **#317** Railway/Vercel 배포 토폴로지 코드화 + 마이그레이션 자동화([docs/RAILWAY_DEPLOY.md](docs/RAILWAY_DEPLOY.md)).
- **#160** 학생 데이터 보호 — 학번·실명·OAuth ID 의 Sentry/로깅 마스킹.

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
