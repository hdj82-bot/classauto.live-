# IFL Platform — Interactive Flipped Learning

AI 기반 플립러닝(거꾸로 수업) 플랫폼. PPT 업로드 → AI 스크립트 생성 → HeyGen 아바타 영상 렌더링 → 학생 학습 세션/평가/집중도 모니터링까지 포함한 종합 교육 플랫폼.

## 주요 기능

| 기능 | 설명 |
|------|------|
| **PPT → 영상 파이프라인** | PPT 업로드 → 텍스트 추출 → Claude AI 스크립트 생성 → TTS(ElevenLabs/Google) → HeyGen 아바타 영상 |
| **평가 시스템** | Claude AI 자동 문제 생성 (객관식/주관식), 형성평가(강의 중) + 총괄평가(강의 후) |
| **학습 세션** | 6단계 상태머신, 시청 진행률 추적, CSV 내보내기 |
| **집중도 모니터링** | 하트비트 기반 실시간 추적, 무응답 감지 → 자동 일시정지 |
| **RAG Q&A** | pgvector 임베딩 기반 강의 자료 검색 + Claude AI 답변 |
| **구독/결제** | Stripe 연동, Basic/Pro 플랜, 사용량 제한 |
| **번역** | DeepL + Google Cloud 번역 (스크립트 다국어 변환) |
| **다국어 UI** | 한국어/영어 지원 (next-intl) |
| **교수자 대시보드** | 출석/정답률/참여도/비용 분석 + CSV 내보내기 |

## 기술 스택

```
Backend:  FastAPI + Celery + PostgreSQL(pgvector) + Redis
Frontend: Next.js 16 + React 19 + Tailwind CSS 4
Infra:    Docker Compose + nginx + Let's Encrypt + GitHub Actions CD
AI:       Anthropic Claude (스크립트/문제) + OpenAI (임베딩)
Video:    HeyGen (아바타) + ElevenLabs/Google TTS
Monitor:  Sentry (에러) + Prometheus (메트릭) + 구조화 JSON 로깅
```

## 아키텍처

```
          ┌──────────┐
 ┌───────▶│  Nginx   │◀── HTTPS (443)
 │        │  (SSL)   │
 │        └──┬────┬──┘
 │           │    │
┌▼───────┐ ┌▼────▼──┐
│Frontend│ │Backend  │
│Next.js │ │FastAPI  │──▶ Sentry / Prometheus
│ :3000  │ │ :8000   │
└────────┘ └──┬──────┘
              │
       ┌──────▼───────┐
       │PostgreSQL     │
       │(pgvector)     │
       │Redis          │
       └──────┬────────┘
              │
       ┌──────▼────────┐
       │Celery Worker  │
       │Celery Beat    │
       └───────────────┘
```

## 빠른 시작

### 1. 환경변수 설정

```bash
cp .env.example .env
# 또는 대화형으로 생성:
./scripts/generate-env.sh
```

### 2. Docker Compose 실행

```bash
docker compose up -d
docker compose exec backend alembic upgrade head
```

### 3. 데모 데이터 (선택)

```bash
docker compose exec backend python -m scripts.seed
```

### 4. 접속

| 서비스 | URL |
|--------|-----|
| 프론트엔드 | http://localhost:3000 |
| 백엔드 API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| Prometheus 메트릭 | http://localhost:8000/metrics |

## 프로덕션 배포

### CI/CD 흐름

```
main 머지 또는 v* 태그 푸시 → GitHub Actions
            ├─ backend / frontend 테스트
            └─ docker-build-push (matrix)
                ├─ ghcr.io/hdj82-bot/ifl-backend:{latest, sha-<short>}
                └─ ghcr.io/hdj82-bot/ifl-frontend:{latest, sha-<short>}
                       │
                       ▼
            deploy (SSH, 게이트 통과 시에만 실행) → ./scripts/deploy.sh update
                            ├─ git pull origin main   (compose/scripts 갱신)
                            ├─ docker compose pull    (CI 가 push 한 이미지)
                            ├─ DB 백업 + alembic upgrade
                            └─ rolling restart        (무중단 — 아래 참조)
```

CI 에서 검증한 정확히 그 이미지가 서버에 배포된다 (서버에서 재빌드 안 함).
특정 SHA 로 핀하거나 롤백하려면 `.env` 의 `IFL_IMAGE_TAG=sha-abc1234` 로 변경
후 `./scripts/deploy.sh update`.

### 프로덕션 배포 게이트 활성화

기본값은 **비활성** 이다. 배포 서버가 준비되기 전엔 deploy job 이 자동으로
skip 되어 CI 전체가 green 으로 유지된다 (PR #34).

**1단계 — DEPLOY_ENABLED 변수와 SSH secrets 등록**

Repository → Settings → Secrets and variables → Actions

| 탭 | 이름 | 값 |
|----|------|-----|
| Variables | `DEPLOY_ENABLED` | `true` |
| Secrets | `DEPLOY_HOST` | 배포 서버 IP/도메인 |
| Secrets | `DEPLOY_USER` | SSH 사용자 |
| Secrets | `DEPLOY_SSH_KEY` | SSH 개인키 (전체 PEM 본문) |

`DEPLOY_ENABLED` 가 `"true"` 가 아니면 deploy job 의 `if` 조건에서 걸러져
실행 자체가 일어나지 않는다 ([ci.yml](.github/workflows/ci.yml)).

**2단계 — production environment 에 Required reviewers 구성 (강력 권장)**

Repository → Settings → Environments → `production` → Deployment protection rules
→ **Required reviewers** 체크 후 승인자 1명 이상 등록.

deploy job 에 `environment: production` 이 설정되어 있어, GitHub 이 잡 진입
시점에 reviewer 의 명시적 승인을 강제한다. 사고 방지의 마지막 안전장치.

**3단계 — 배포 트리거 (main 푸시만으로는 배포되지 않는다)**

`DEPLOY_ENABLED=true` 가 켜진 뒤에도 deploy job 은 다음 두 경로 중 하나에서만
실행된다. 단순 main 푸시는 이미지 빌드/푸시까지만 진행되고 deploy 는 skip.

- **(a) 릴리스 태그 푸시** — 권장
  ```bash
  git tag -a v1.2.3 -m "release v1.2.3"
  git push origin v1.2.3
  ```
- **(b) 수동 트리거** — Actions 탭 → CI workflow → "Run workflow" → branch=main
  선택 후 `deploy` 체크박스를 켜고 실행. 체크하지 않으면 빌드/테스트만 돌고
  deploy job 은 skip.

> 게이트 동작을 끄고 싶으면 `DEPLOY_ENABLED` variable 을 삭제하거나 값을
> `false` 로 바꾸면 즉시 비활성화된다 (코드 변경 불필요).

### 무중단 (Rolling) 재시작

`./scripts/deploy.sh update` 는 backend / frontend 를 다음 패턴으로 교체한다:

```
backend (or frontend):
  1) compose up -d --no-recreate --scale=2  → 새 컨테이너 1개 추가 (기존 보존)
  2) docker inspect Health.Status == healthy 가 될 때까지 polling (최대 120s)
  3) 기존 컨테이너 docker stop -t 35  (compose 의 stop_grace_period=30s 동안 SIGTERM)
  4) docker rm 으로 제거 — 신규 단독 운영

worker:
  - docker compose stop -t 60 worker  → SIGTERM 후 60초 동안 진행 태스크 ack
  - docker compose up -d worker       → 새 이미지로 기동
  - Celery acks_late=True 가정. 시간 내 ack 못 한 태스크는 broker 에 남아 재큐잉.

beat:
  - 단일 인스턴스 (동시 실행 금지) → docker compose up -d --force-recreate beat
```

nginx 의 `upstream backend` 블록에 `max_fails=2 fail_timeout=10s` 가 걸려 있어
교체 직후의 IP 변경이 즉시 반영되지 않더라도 unhealthy 컨테이너는 자동 제외된다.

### 검증 방법

배포 전 별도 터미널에서 health 엔드포인트를 0.2초 간격으로 두드린다:

```bash
while true; do curl -o /dev/null -s -w "%{http_code}\n" \
  https://api.$DOMAIN/health; sleep 0.2; done
```

이 상태에서 `./scripts/deploy.sh update` 를 돌려 5xx 가 0~1회 이하면 정상.

### 신규 서버 셋업 — 1회 체크리스트

깨끗한 Ubuntu 22.04/24.04 서버에서 처음 운영을 띄울 때 한 번만 실행하는 절차.
순서 그대로 따라가면 된다 (각 단계는 다음 단계의 전제조건).

#### 0. 사전 준비 (서버 외부)

- [ ] **도메인 보유 + DNS A 레코드** 등록
  ```
  classauto.live      A   <서버 공인 IP>
  api.classauto.live  A   <서버 공인 IP>
  ```
  `dig +short classauto.live` 로 IP 가 올라왔는지 확인. TTL 은 처음 발급 시 짧게(300s) 두면 편하다.

- [ ] **SSH 접속 가능** — 비밀번호 로그인은 끄고 키 기반만 허용 권장
  ```bash
  ssh-copy-id ubuntu@<서버IP>
  ssh ubuntu@<서버IP>   # 비밀번호 안 묻히면 OK
  ```

- [ ] **GHCR Personal Access Token 발급** (private 패키지인 경우만)
  - GitHub → Settings → Developer settings → Personal access tokens (classic)
  - 권한: `read:packages` 만 체크 (write 권한은 CI 만 가지면 됨)
  - public 패키지면 이 단계 스킵

#### 1. 서버 초기화 (`scripts/setup-server.sh`)

```bash
ssh ubuntu@<서버IP>
sudo apt-get update && sudo apt-get install -y git
sudo git clone https://github.com/hdj82-bot/classauto.live-.git /opt/ifl-platform
cd /opt/ifl-platform
sudo ./scripts/setup-server.sh
```

스크립트가 자동으로 처리:
- 시스템 패키지 업데이트, chrony 시간 동기화
- 2GB swap 파일 + `vm.overcommit_memory=1` (Redis 안전)
- Docker + Docker Compose v2 설치, `$SUDO_USER` 를 docker 그룹 추가
- UFW (SSH/80/443 만 허용), fail2ban (sshd jail), unattended-upgrades

옵션 환경변수로 동작 변경 가능:
```bash
sudo SWAP_SIZE_GB=4 TIMEZONE=Asia/Seoul ./scripts/setup-server.sh
```

#### 2. GHCR 로그인 (private 패키지인 경우만)

```bash
echo "$GHCR_TOKEN" | sudo docker login ghcr.io -u <github-username> --password-stdin
```

`setup-server.sh` 에 `GHCR_USER`/`GHCR_TOKEN` 을 환경변수로 넘기면 1단계에서 자동 처리된다.

#### 3. `.env` 작성

```bash
sudo cp /opt/ifl-platform/.env.production /opt/ifl-platform/.env
sudo vi /opt/ifl-platform/.env
```

`CHANGE_ME` 가 들어간 항목을 모두 실제 값으로 교체. 최소한 다음은 반드시:

| 카테고리 | 변수 |
|---|---|
| DB / 인프라 | `POSTGRES_PASSWORD` (≥16자), `JWT_SECRET_KEY` (≥32자, `openssl rand -hex 32`) |
| 도메인 / SSL | `DOMAIN`, `SSL_EMAIL`, `FRONTEND_URL`, `NEXT_PUBLIC_API_URL`, `GOOGLE_OAUTH_REDIRECT_URI`, `HEYGEN_CALLBACK_URL` |
| AI | `ANTHROPIC_API_KEY` (`sk-ant-...`), `OPENAI_API_KEY` (`sk-...`) |
| 영상 / 음성 | `HEYGEN_API_KEY`, `HEYGEN_AVATAR_ID`, `HEYGEN_WEBHOOK_SECRET`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` |
| OAuth | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| 결제 | `STRIPE_SECRET_KEY` (`sk_live_...`), `STRIPE_WEBHOOK_SECRET` (`whsec_...`), `STRIPE_PRICE_BASIC`, `STRIPE_PRICE_PRO` |
| 스토리지 | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` |
| 번역 | `DEEPL_API_KEY` |
| 모니터링 | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` |

> `JWT_SECRET_KEY` 와 `POSTGRES_PASSWORD` 는 절대 커밋하지 말 것 (서버 `.env` 에만 존재).

#### 4. 환경변수 검증 — `validate-env.sh --strict`

```bash
cd /opt/ifl-platform
./scripts/validate-env.sh --strict
```

`--strict` 모드는 production 전제로 추가 검증:
- 모든 `[REQUIRED]` 변수 채워졌는지 + `CHANGE_ME` 잔존 여부
- 형식: `JWT_SECRET_KEY` ≥32자, `STRIPE_SECRET_KEY` 가 `sk_test_`/`sk_live_`,
  `STRIPE_WEBHOOK_SECRET` 이 `whsec_`, `ANTHROPIC_API_KEY` 가 `sk-ant-`,
  Sentry DSN URL 형태, AWS Access Key 가 `AKIA...` 20자, S3 버킷명 규칙 등
- `--strict` 추가 검증: `DOMAIN` ≠ localhost, `SSL_EMAIL` 이메일 형식,
  모든 외부 URL 이 `https://` 로 시작, `STRIPE_SECRET_KEY` 가 `sk_test_` 면 경고

종료 코드 0 이 나올 때까지 반복. 0 이 아니면 다음 단계로 가지 말 것.

#### 5. 최초 배포 — `deploy.sh init`

```bash
DOMAIN=classauto.live EMAIL=admin@classauto.live ./scripts/deploy.sh init
```

`init` 가 하는 일 (자동):
1. `validate-env` 1차 검증
2. DB/Redis 컨테이너 기동 → Alembic 마이그레이션
3. Let's Encrypt 인증서 발급 (`scripts/init-ssl.sh`)
4. 전체 스택 기동 → `cmd_status` 헬스체크

#### 6. 배포 직후 검증 — `smoke-test.sh`

```bash
./scripts/smoke-test.sh classauto.live
```

`/health` JSON, 보안 헤더(HSTS/CSP/X-Frame-Options), TLS 1.3, 인증서 잔여일,
`/metrics` 외부 차단, OAuth 리다이렉트, rate-limit 동작, Stripe 웹훅 예외 등을
자동 점검. 종료 코드가 실패한 체크 개수.

#### 7. (선택) GitHub Actions CD 활성화

```
GitHub Repo → Settings → Secrets and variables → Actions
  DEPLOY_HOST  = <서버 IP>
  DEPLOY_USER  = ubuntu
  DEPLOY_SSH_KEY = <서버 ~/.ssh/authorized_keys 와 짝인 개인키>
```

이후 `main` 머지 시 `.github/workflows/ci.yml` 이
`./scripts/deploy.sh update` 를 SSH 로 호출 (rolling restart, 무중단).

> GHCR 패키지 visibility 는 GitHub Repo → Settings → Packages 에서 확인.
> private 으로 두면 위 `docker login` 이 필수, public 으로 풀면 익명 pull 가능.

### 배포 명령어

```bash
./scripts/deploy.sh init       # 최초 배포 (SSL 포함)
./scripts/deploy.sh update     # GHCR 이미지 pull → 재시작
./scripts/deploy.sh rollback   # 직전 버전 롤백
./scripts/deploy.sh status     # 서비스 상태 확인
```

### DB 백업/복원

운영 환경에서는 Celery beat 가 매일 UTC 03:00 (KST 12:00) 에
`app.tasks.backup.daily_db_backup` 태스크를 실행해 컨테이너 내부에서
`pg_dump -Fc` 결과를 gzip 압축한 뒤 `s3://${S3_BUCKET}/${BACKUP_S3_PREFIX}`
경로(기본 `backups/`)로 업로드한다. 호스트 장애와 무관하게 오프사이트에
백업이 보존되며, 30일 이상 된 객체는 S3 lifecycle rule 로 자동 만료시킨다
(콘솔에서 prefix `backups/` 에 expiration 30 days 규칙 등록 필요).

`scripts/backup.sh` 는 호스트 측 수동/복구 시나리오용으로 유지된다.
호스트에 S3 자격증명이 없거나 워커가 다운된 환경에서는 OS cron 으로
다음 줄을 직접 걸 수 있다:
`0 3 * * * cd /opt/ifl-platform && ./scripts/backup.sh backup`.

```bash
./scripts/backup.sh backup              # 호스트 로컬 수동 백업
./scripts/backup.sh list                # 호스트 로컬 백업 목록
./scripts/backup.sh restore backup.sql  # 복원 (.sql 또는 .sql.gz)
```

## 테스트

```bash
# 백엔드 단위 테스트
cd backend && pytest --tb=short --cov=app -q

# pgvector 통합 테스트 (PostgreSQL 필요)
docker compose -f docker-compose.test.yml up -d
cd backend && pytest -m integration --tb=short

# 외부 API 실연동 테스트 (API 키 필요)
cd backend && pytest -m external --tb=short

# 프론트엔드 테스트
cd frontend && npm test

# E2E 테스트 (Playwright)
cd frontend && npm run test:e2e

# 부하 테스트 (Locust)
cd loadtest && ./run.sh --headless -u 100 -r 10 -t 5m
```

### 배포 직후 스모크 테스트

실제 배포된 스택이 외부에서 동작하는지를 curl/jq/openssl 로 자동 검증한다.
`deploy.sh` 또는 GitHub Actions 배포 workflow 의 마지막 단계에서 호출하는 것을
권장한다. 종료 코드는 실패한 체크 개수(0 이면 전체 통과).

```bash
./scripts/smoke-test.sh ifl-platform.com
```

검증 항목: `/health` JSON(db/redis/s3 전부 ok) · 보안 헤더(HSTS ≥ 1년, CSP 에
`'unsafe-eval'` 없음, X-Frame-Options, X-Content-Type-Options) · TLS 1.3 +
인증서 잔여 ≥ 30일 · `/metrics` 인증 필요(401/403) 또는 외부 차단(404) ·
`/docs` / `/openapi.json` 외부 차단 · `/api/auth/google` 302 → accounts.google.com ·
`/api/auth/exchange` 미인증 POST 거부 · `/api/v1/qa` 130회 호출 시 rate-limit
트리거 · Stripe 웹훅 `/api/v1/payment/webhook` 은 100회 POST 해도 429 없음
(rate-limit 제외 확인).

의존성: `curl`, `jq`, `openssl`. 없으면 스크립트가 시작 시 종료 코드 2 로 중단.

## 프로젝트 구조

```
Interactive-flipped-learning/
├── backend/                     # FastAPI 백엔드
│   ├── app/
│   │   ├── api/v1/              # 15개 라우터 (48+ 엔드포인트)
│   │   ├── core/                # config, security, middleware, logging,
│   │   │                        # exceptions, sentry, metrics
│   │   ├── models/              # 15개 ORM 모델
│   │   ├── schemas/             # Pydantic 스키마
│   │   ├── services/            # 비즈니스 로직
│   │   │   └── pipeline/        # PPT→TTS→HeyGen 파이프라인
│   │   └── tasks/               # Celery 비동기 태스크
│   ├── alembic/                 # DB 마이그레이션
│   └── tests/                   # 270+ 테스트 케이스
│
├── frontend/                    # Next.js 프론트엔드
│   ├── src/
│   │   ├── app/                 # 15+ 페이지/레이아웃
│   │   ├── components/          # 공통 UI 컴포넌트
│   │   ├── contexts/            # AuthContext, I18nContext
│   │   ├── hooks/               # useAttention, useOnlineStatus
│   │   └── lib/                 # API 클라이언트, 토큰 관리
│   ├── messages/                # i18n 번역 (ko, en)
│   └── e2e/                     # Playwright E2E 테스트
│
├── nginx/                       # 리버스 프록시 + SSL + 보안 헤더
├── loadtest/                    # Locust 부하 테스트
├── scripts/                     # 배포, 백업, SSL, 환경변수 검증
├── docker-compose.yml           # 개발 환경 (6개 서비스)
├── docker-compose.prod.yml      # 프로덕션 (9개 서비스 + nginx + certbot)
└── docker-compose.test.yml      # 통합 테스트 (PostgreSQL + pgvector)
```

## API 엔드포인트 (48+)

| 모듈 | Prefix | 주요 기능 |
|------|--------|-----------|
| auth | `/api/auth` | Google OAuth, JWT 발급/갱신/로그아웃 |
| courses | `/api/v1/courses` | 강좌 CRUD |
| lectures | `/api/v1/lectures` | 강의 CRUD, 슬러그 |
| questions | `/api/v1/questions` | AI 문제 생성, 조회 |
| videos | `/api/v1/videos` | 스크립트 에디터, 상태 관리 |
| sessions | `/api/v1/sessions` | 6단계 상태머신, 진행률 |
| dashboard | `/api/v1/dashboard` | 출석/점수/참여도 분석 |
| render | `/api/v1/render` | PPT 업로드, HeyGen 렌더링 |
| webhooks | `/api/v1/webhooks` | HeyGen 웹훅 (HMAC) |
| attention | `/api/v1/attention` | 집중도 모니터링, 설정 |
| subscription | `/api/v1/subscription` | 구독 플랜 관리 |
| payment | `/api/v1/payment` | Stripe 결제 |
| qa | `/api/v1/qa` | RAG 기반 Q&A |
| translate | `/api/v1/translate` | 스크립트 번역 |

## 환경변수

필수 환경변수 목록은 [.env.example](.env.example) 참조. `[REQUIRED]` / `[OPTIONAL]` 태그로 구분.

```bash
# 환경변수 검증
./scripts/validate-env.sh
```

## 보안

- CORS: 프로덕션 명시적 오리진만 허용
- Rate Limiting: Redis 기반 슬라이딩 윈도우 (경로별 차등)
- JWT: HS256, 32자+ 키 강제, 15분 만료 + 7일 리프레시 (토큰 회전)
- OAuth: Google OAuth 2.0, CSRF state 파라미터 (Redis TTL 10분)
- 파일 업로드: PPTX 매직바이트 검증, 파일명 새니타이징, 100MB 제한
- SSRF: 내부 IP/localhost 접근 차단
- nginx: HSTS, TLS 1.3, OCSP Stapling, CSP, server_tokens off
- Swagger: 프로덕션 비활성화

## 모니터링

- **Sentry**: 백엔드(FastAPI+Celery+SQLAlchemy) + 프론트엔드(Next.js instrumentation)
- **Prometheus**: `GET /metrics` — 요청수, 응답시간, 진행중 요청, 외부 API 호출
- **구조화 로깅**: JSON 포맷, request_id 전파 (contextvars)
- **헬스체크**: `GET /health` — DB, Redis, S3 상태

## 라이선스

Private repository.
