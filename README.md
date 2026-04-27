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
main 머지 → GitHub Actions
            ├─ backend / frontend 테스트
            └─ docker-build-push (matrix)
                ├─ ghcr.io/hdj82-bot/ifl-backend:{latest, sha-<short>}
                └─ ghcr.io/hdj82-bot/ifl-frontend:{latest, sha-<short>}
                       │
                       ▼
            deploy (SSH) → ./scripts/deploy.sh update
                            ├─ git pull origin main   (compose/scripts 갱신)
                            ├─ docker compose pull    (CI 가 push 한 이미지)
                            ├─ DB 백업 + alembic upgrade
                            └─ rolling restart        (무중단 — 아래 참조)
```

CI 에서 검증한 정확히 그 이미지가 서버에 배포된다 (서버에서 재빌드 안 함).
특정 SHA 로 핀하거나 롤백하려면 `.env` 의 `IFL_IMAGE_TAG=sha-abc1234` 로 변경
후 `./scripts/deploy.sh update`.

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

### 무중단 롤백

`./scripts/deploy.sh rollback` 도 update 와 동일한 rolling 패턴으로 동작한다 — 502 없이
직전 버전으로 복귀.

흐름:

1. `update` 시작 직전 자동으로 저장된 스냅샷(`$STATE_DIR/rollback.env`) 에서
   직전 git SHA + GHCR 이미지 태그(`sha-<short>`) 를 읽는다.
2. `git checkout <prev-sha>` (detached HEAD) — compose/script 가 그 시점 상태와
   일치해야 entrypoint 와 healthcheck 가 깨지지 않는다.
3. `IFL_IMAGE_TAG=sha-<prev>` 로 `docker compose pull` → backend / frontend 를
   `rolling_restart_scaled` 로 무중단 교체.
4. worker `stop -t 60` → 새(=이전) 이미지로 기동, beat 는 `--force-recreate`.

GHCR 에서 해당 태그가 사라진 경우 로컬 캐시된 이미지 SHA 로 폴백한다.
스냅샷이 없으면(스크립트가 처음 실행되거나 파일이 삭제됨) 안전하게 중단하고
수동 절차를 안내한다.

> **롤백은 1단계 뒤로만 지원한다.** 스냅샷은 매 update 시 덮어써지므로,
> 두 번 연속 rollback 을 호출해도 같은 SHA 로 돌아갈 뿐이다. 더 깊은 롤백은
> `IFL_IMAGE_TAG=sha-<원하는-sha>` 와 `git checkout` 으로 수동 처리.

> **DB 스키마는 자동 복귀하지 않는다.** 직전 update 가 파괴적 마이그레이션을
> 포함했다면 `./scripts/backup.sh restore <파일>` 또는
> `alembic downgrade -1` 을 별도로 수행해야 한다. update 가 마이그레이션 직전
> 자동 백업을 만들어두므로 `./scripts/backup.sh list` 로 가장 최근 백업을 확인할 것.

### 신규 서버 셋업

```bash
# 1. 서버 초기 설정 (Ubuntu)
sudo ./scripts/setup-server.sh

# 2. GHCR 로그인 (private 패키지일 경우 1회)
#    Personal Access Token (read:packages 권한) 또는 GITHUB_TOKEN 사용
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-username> --password-stdin

# 3. 환경변수 설정
vi /opt/ifl-platform/.env   # IFL_IMAGE_TAG=latest 확인

# 4. 환경변수 검증
./scripts/validate-env.sh

# 5. 최초 배포
DOMAIN=your-domain.com EMAIL=admin@example.com ./scripts/deploy.sh init
```

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
인증서 잔여 ≥ 30일 · `/metrics` / `/docs` / `/openapi.json` 외부 차단 ·
`/api/auth/google` 302 → accounts.google.com · `/api/auth/exchange` 미인증
POST 거부 · `/api/v1/qa` 130회 호출 시 rate-limit 트리거 · Stripe 웹훅
`/api/v1/payment/webhook` 은 100회 POST 해도 429 없음 (rate-limit 제외 확인).

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
