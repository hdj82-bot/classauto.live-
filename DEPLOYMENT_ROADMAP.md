# classauto.live 배포 로드맵

> 목표: Vercel(프론트) + Railway(백엔드/Celery/Redis) + Supabase(DB/Auth/Storage)로 프로덕션 배포
> 예상 소요: 4~8시간 (외부 API 키가 모두 준비되어 있다는 전제)
> 예상 월 비용: $0~5 (1단계 무료 티어)

---

## Phase 0 — 사전 준비 (배포 시작 전)

### 0.1 외부 API 키 확보 체크리스트

| 항목 | 발급처 | 필수 여부 | 비고 |
|------|--------|----------|------|
| Anthropic Claude API | console.anthropic.com | **필수** | 결제수단 등록 + 사용량 한도 설정 |
| OpenAI API | platform.openai.com | 필수 (임베딩) | RAG Q&A에 사용 |
| HeyGen API | app.heygen.com | **필수** | 아바타 ID 1개 사전 선택 |
| ElevenLabs | elevenlabs.io | **필수** | Voice ID 사전 선택 |
| Google OAuth | console.cloud.google.com | **필수** | 클라이언트 생성, redirect URI는 Phase 4에서 추가 |
| DeepL | deepl.com/pro-api | 선택 | 번역 기능 쓸 때만 |
| Stripe | dashboard.stripe.com | 선택 (지금은 보류) | 결제 기능 쓸 때만 — 1단계는 무료로 시작 권장 |
| Sentry | sentry.io | 선택 | 무료 5K 이벤트/월 |

### 0.2 도메인 준비

- [ ] `classauto.live` 도메인 소유 확인 (가비아/Cloudflare 등)
- [ ] DNS 관리 패널 접근 권한 확보

### 0.3 GitHub 정리

- [ ] `classauto-web` 레포가 최신 상태인지 확인 (`git status`, `git push`)
- [ ] `.env`, `.env.production`이 `.gitignore`에 포함되어 있는지 재확인
- [ ] main 브랜치가 배포 가능한 상태 (`docker compose up`이 로컬에서 정상 작동)

### 0.4 코드 변경 필요 항목 (선결 작업)

배포 전 **코드 수준에서 미리 손봐야 할 것들**:

- [ ] `backend/app/core/config.py` — `DATABASE_URL`이 Supabase Pooler URL을 받을 수 있는지 확인 (asyncpg 드라이버 호환)
- [ ] CORS 설정 — `FRONTEND_URL` 환경변수에 Vercel 도메인 추가될 수 있도록 (이미 동적이면 OK)
- [ ] Celery `--concurrency` 기본값 조정 (Railway Free $5 크레딧 절약 위해 worker concurrency=2 권장)
- [ ] 프론트엔드 `next.config.ts` — `images.remotePatterns`에 Supabase Storage 도메인 추가 (Storage 사용 시)
- [ ] S3 vs Supabase Storage — 1단계는 **기존 S3 유지** 추천 (코드 변경 0). 비용 발생 시 Phase 7에서 마이그레이션

---

## Phase 1 — Supabase 설정 (예상 30분)

### 1.1 프로젝트 생성

- [ ] [supabase.com](https://supabase.com) 가입 → New Project
- [ ] **Region: Northeast Asia (Tokyo)** 선택 (한국 레이턴시 최저)
- [ ] DB 비밀번호 생성 → 안전한 곳에 저장 (1Password, etc.)
- [ ] 프로젝트 URL/Anon Key/Service Role Key 메모

### 1.2 pgvector 활성화

- [ ] Supabase Dashboard → SQL Editor에서 실행:
  ```sql
  create extension if not exists vector;
  ```
- [ ] Database → Extensions 화면에서 `vector` 활성 확인

### 1.3 Connection String 확보

- [ ] Project Settings → Database → Connection string
- [ ] **Transaction pooler** 모드 사용 (Railway 컨테이너용)
  - 형식: `postgresql://postgres.xxx:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`
- [ ] asyncpg용으로 `postgresql+asyncpg://...`로 변환 메모
- [ ] Direct connection도 별도 보관 (alembic 마이그레이션용)

### 1.4 마이그레이션 실행

- [ ] 로컬에서 `.env`의 `DATABASE_URL`을 Supabase Direct URL로 임시 변경
- [ ] `cd backend && alembic upgrade head` 실행
- [ ] Supabase Dashboard → Table Editor에서 테이블 15개 생성 확인
- [ ] `.env` 원복

### 1.5 (선택) Storage 버킷 생성

- [ ] 1단계는 건너뛰고 기존 S3 유지 권장
- [ ] 추후 마이그레이션 시: Storage → New bucket → `ppt`, `audio`, `video` 3개

---

## Phase 2 — Railway 백엔드 배포 (예상 1~2시간)

### 2.1 Railway 프로젝트 생성

- [ ] [railway.app](https://railway.app) 가입 (GitHub 로그인) → $5 무료 크레딧 자동 지급
- [ ] New Project → Deploy from GitHub repo → `classauto-web` 선택
- [ ] **Root Directory: `backend`** 설정
- [ ] Builder: Dockerfile → `Dockerfile.prod` 지정

### 2.2 백엔드(API) 서비스 설정

- [ ] 서비스 이름: `backend`
- [ ] **Start Command** 오버라이드:
  ```
  uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers
  ```
- [ ] **Healthcheck Path**: `/health`
- [ ] Settings → Networking → Generate Domain (예: `classauto-api.up.railway.app`)

### 2.3 환경변수 등록

`.env.example` 기준으로 다음 항목들을 Railway Variables에 입력:

**필수**
- [ ] `ENVIRONMENT=production`
- [ ] `DATABASE_URL` (Supabase Pooler asyncpg)
- [ ] `DATABASE_URL_SYNC` (Supabase Pooler psycopg2)
- [ ] `JWT_SECRET_KEY` (64자 이상 랜덤 — `openssl rand -hex 32`)
- [ ] `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`
- [ ] `GOOGLE_OAUTH_REDIRECT_URI` (Phase 4 후 확정 도메인으로 업데이트)
- [ ] `FRONTEND_URL` (Phase 3 후 Vercel 도메인으로 업데이트)
- [ ] `ANTHROPIC_API_KEY`
- [ ] `OPENAI_API_KEY`
- [ ] `HEYGEN_API_KEY`, `HEYGEN_AVATAR_ID`, `HEYGEN_WEBHOOK_SECRET`, `HEYGEN_CALLBACK_URL`
- [ ] `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`
- [ ] `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`, `AWS_REGION`

**Redis (Phase 2.5에서 자동 추가)**
- [ ] `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND` (Railway Redis 플러그인이 주입)

**선택**
- [ ] `SENTRY_DSN`
- [ ] `DEEPL_API_KEY`
- [ ] `STRIPE_*` (결제 기능 사용 시)

### 2.4 Redis 플러그인 추가

- [ ] Project → New → Database → Redis
- [ ] backend/celery-worker/celery-beat 서비스에서 Redis 변수 참조 (`${{Redis.REDIS_URL}}`)

### 2.5 Celery Worker 서비스 추가

- [ ] 같은 GitHub 레포에서 New Service → 같은 Dockerfile.prod
- [ ] 서비스 이름: `celery-worker`
- [ ] Start Command:
  ```
  celery -A app.celery_app worker --loglevel=info --concurrency=2
  ```
- [ ] backend와 **동일한 환경변수 전체 복사** (Railway "Variables → Shared Variables" 활용)

### 2.6 Celery Beat 서비스 추가

- [ ] 같은 방식으로 New Service
- [ ] 서비스 이름: `celery-beat`
- [ ] Start Command:
  ```
  celery -A app.celery_app beat --loglevel=info
  ```
- [ ] 동일 환경변수

### 2.7 배포 검증

- [ ] backend 서비스 Logs에서 `Application startup complete` 확인
- [ ] `https://classauto-api.up.railway.app/health` → `{"status":"ok"}` 응답
- [ ] `https://classauto-api.up.railway.app/docs` → 프로덕션은 비활성화되어야 정상 (404)
- [ ] celery-worker Logs: `celery@... ready.` 확인
- [ ] celery-beat Logs: `Scheduler: Sending due task ...` 확인

---

## Phase 3 — Vercel 프론트엔드 배포 (예상 30분)

### 3.1 프로젝트 생성

- [ ] [vercel.com](https://vercel.com) 가입 (GitHub 로그인)
- [ ] Add New Project → `classauto-web` Import
- [ ] **Root Directory: `frontend`** 설정 (중요!)
- [ ] Framework Preset: Next.js (자동 감지)
- [ ] Build Command: 기본값 (`next build`)

### 3.2 환경변수 등록

- [ ] `NEXT_PUBLIC_API_URL` = `https://classauto-api.up.railway.app` (Phase 2.7의 Railway 도메인)
- [ ] `NEXT_PUBLIC_SENTRY_DSN` (선택)
- [ ] 기타 `NEXT_PUBLIC_*` 변수들 — `frontend/src` 코드에서 참조하는 모든 항목 확인 후 등록

### 3.3 배포 검증

- [ ] Deploy 클릭 → 빌드 성공 확인 (~3분)
- [ ] Vercel 도메인(`classauto-web-xxx.vercel.app`) 접속
- [ ] 로그인 페이지 렌더 확인
- [ ] 브라우저 DevTools Network 탭에서 API 호출이 Railway 도메인으로 가는지 확인

### 3.4 백엔드 CORS/FRONTEND_URL 업데이트

- [ ] Railway → backend 서비스 → `FRONTEND_URL`을 Vercel 도메인으로 변경
- [ ] backend 서비스 재배포 (Variables 변경 시 자동 재시작)

---

## Phase 4 — 도메인 연결 (예상 30분~1시간, DNS 전파 대기 포함)

### 4.1 프론트엔드 도메인 (classauto.live)

- [ ] Vercel → Project Settings → Domains → Add `classauto.live`
- [ ] Vercel이 안내하는 DNS 레코드 추가 (도메인 등록기관에서):
  - `A` 레코드: `@` → `76.76.21.21` (또는 Vercel 안내 IP)
  - `CNAME` 레코드: `www` → `cname.vercel-dns.com`
- [ ] DNS 전파 대기 (5~30분, `nslookup classauto.live`로 확인)
- [ ] Vercel에서 SSL 자동 발급 완료 확인 (체크 표시)

### 4.2 백엔드 도메인 (api.classauto.live)

- [ ] Railway → backend 서비스 → Settings → Custom Domain → `api.classauto.live`
- [ ] DNS 등록기관에서 `CNAME` 추가: `api` → Railway가 안내하는 도메인
- [ ] DNS 전파 + Railway SSL 자동 발급 대기

### 4.3 환경변수 최종 업데이트

- [ ] Vercel: `NEXT_PUBLIC_API_URL` = `https://api.classauto.live`
- [ ] Railway backend: `FRONTEND_URL` = `https://classauto.live`
- [ ] Railway backend: `GOOGLE_OAUTH_REDIRECT_URI` = `https://api.classauto.live/api/auth/google/callback`
- [ ] Railway backend: `HEYGEN_CALLBACK_URL` = `https://api.classauto.live/api/v1/webhooks/heygen`
- [ ] 두 서비스 모두 재배포

### 4.4 Google OAuth 콘솔 업데이트

- [ ] Google Cloud Console → OAuth 2.0 클라이언트 → Authorized redirect URIs에 추가:
  - `https://api.classauto.live/api/auth/google/callback`
- [ ] Authorized JavaScript origins에 추가:
  - `https://classauto.live`

### 4.5 HeyGen 웹훅 URL 업데이트

- [ ] HeyGen Dashboard → Webhooks → URL을 `https://api.classauto.live/api/v1/webhooks/heygen`로 변경

---

## Phase 5 — 스모크 테스트 (예상 1시간)

각 시나리오를 수동으로 실행하며 정상 동작 확인:

### 5.1 인증

- [ ] `https://classauto.live` 접속 → 로그인 페이지 렌더
- [ ] Google OAuth 로그인 → 콜백 정상, JWT 발급, 대시보드 진입
- [ ] 새로고침 후 세션 유지 확인
- [ ] 로그아웃 → 토큰 폐기 확인

### 5.2 핵심 API 경로

- [ ] 강좌 생성 → 강의 생성 → DB(Supabase Table Editor)에서 레코드 확인
- [ ] PPT 업로드 → S3 업로드 성공 → Celery 태스크 큐잉 확인 (Railway worker logs)
- [ ] 스크립트 생성 (Claude API 호출) → 결과 저장 확인
- [ ] (TTS/HeyGen은 비용 발생하므로 1회만 테스트)

### 5.3 학생 경로

- [ ] 별도 테스트 계정으로 로그인 → 강의 시청 → 진행률 저장
- [ ] 형성평가 → 답안 제출 → 점수 계산
- [ ] 집중도 하트비트 (DevTools Network에서 확인)

### 5.4 헬스/메트릭

- [ ] `https://api.classauto.live/health` → DB/Redis/S3 모두 ok
- [ ] Railway backend Logs에 ERROR 없음 확인
- [ ] Sentry Dashboard (설정한 경우) → 에러 0건

---

## Phase 6 — CI/CD & 운영 정착 (예상 30분)

### 6.1 자동 배포 확인

- [ ] main 브랜치에 작은 수정 push → Vercel/Railway가 자동 빌드/배포 트리거
- [ ] 빌드 시간 측정 (Railway 5~10분, Vercel 2~3분)
- [ ] 실패 시 롤백 가능한지 확인 (Vercel: Deployments → 이전 버전 Promote, Railway: Deployments → Redeploy 이전 commit)

### 6.2 백업 자동화

- [ ] Supabase Free 티어는 PITR 미지원 → 주 1회 수동 `pg_dump`
- [ ] 로컬 cron 또는 GitHub Actions로 백업 스크립트 작성 (선택)

### 6.3 모니터링 설정

- [ ] Sentry 연동 (백엔드 + 프론트엔드)
- [ ] Railway 알림: 서비스 다운 시 이메일
- [ ] Vercel 알림: 빌드 실패 시 이메일
- [ ] Supabase 알림: DB 사용량 80% 도달 시

### 6.4 비용 모니터링

- [ ] Railway: Usage 페이지 즐겨찾기, 월 $5 크레딧 소진 추세 확인
- [ ] Vercel: Hobby 플랜 한도 모니터링 (대역폭 100GB/월)
- [ ] Supabase: DB 500MB / Storage 1GB 한도 추적
- [ ] Anthropic/OpenAI/HeyGen/ElevenLabs: 각 콘솔에서 사용량 한도(soft limit) 설정

---

## Phase 7 — 1단계 이후 확장 트리거 (참고)

> 다음 신호가 보이면 단계 전환 검토.

| 트리거 | 대응 |
|--------|------|
| Railway 월 $5 크레딧 초과 | Hobby 플랜 $5/월 또는 Pro $20/월 |
| Supabase DB 400MB 도달 | Pro $25/월 (8GB DB + 7일 PITR) |
| Vercel 대역폭 80GB 도달 | Pro $20/월 |
| S3 비용 월 $5 초과 | Supabase Storage로 마이그레이션 검토 |
| Celery 큐 적체 | worker concurrency 증가, Railway 인스턴스 추가 |
| MAU 1,000 돌파 | 전반적 Pro 플랜 전환 (~월 $70) |
| MAU 10,000 돌파 | AWS ECS Fargate 마이그레이션 검토 시작 |

---

## 자주 막히는 지점 (Troubleshooting)

| 증상 | 원인 / 해결 |
|------|-----------|
| Railway backend 부팅 실패: "could not connect to database" | DATABASE_URL이 Direct URL로 되어있음. **Pooler URL(:6543)** 사용 |
| asyncpg "prepared statement does not exist" | Pooler의 transaction 모드 + asyncpg 충돌. `?statement_cache_size=0` 쿼리스트링 추가 |
| Google OAuth 400 redirect_uri_mismatch | Phase 4.4의 redirect URI 등록 누락 |
| Vercel에서 API 호출 시 CORS 에러 | backend `FRONTEND_URL` 또는 CORS 미들웨어 origin 누락 |
| HeyGen 웹훅 401 | `HEYGEN_WEBHOOK_SECRET` 또는 HeyGen Dashboard URL 미일치 |
| Celery 태스크가 실행 안 됨 | worker가 `REDIS_URL`을 못 받았거나 broker URL이 backend와 다름 |
| 프론트 빌드 시 환경변수 undefined | `NEXT_PUBLIC_` 접두사 누락 (서버 변수는 빌드 시점에 inline 안 됨) |

---

## 진행 시 권장 순서

1. **오늘**: Phase 0 (외부 키 점검) + Phase 1 (Supabase) — 1시간
2. **다음 세션**: Phase 2 (Railway 3개 서비스) — 가장 시간 많이 듦, 2~3시간 통째로 확보
3. **다음**: Phase 3 (Vercel) + Phase 4 (도메인) — 1시간 + DNS 대기
4. **마지막**: Phase 5 (스모크 테스트) + Phase 6 (운영) — 1~2시간

각 Phase 마치고 GitHub Issue나 별도 메모로 "✅ Phase N 완료, 발견 이슈" 기록 권장.
