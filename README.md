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

```bash
# 1. 서버 초기 설정 (Ubuntu)
sudo ./scripts/setup-server.sh

# 2. 환경변수 설정
vi /opt/ifl-platform/.env

# 3. 환경변수 검증
./scripts/validate-env.sh

# 4. 배포
DOMAIN=your-domain.com EMAIL=admin@example.com ./scripts/deploy.sh init
```

### 배포 명령어

```bash
./scripts/deploy.sh init       # 최초 배포 (SSL 포함)
./scripts/deploy.sh update     # 업데이트 배포
./scripts/deploy.sh rollback   # 직전 버전 롤백
./scripts/deploy.sh status     # 서비스 상태 확인
```

### DB 백업/복원

```bash
./scripts/backup.sh backup              # 백업 생성
./scripts/backup.sh list                # 백업 목록
./scripts/backup.sh restore backup.sql  # 복원
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
