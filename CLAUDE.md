# IFL Platform — Interactive Flipped Learning

> **통합 백엔드** — FastAPI + Celery + PostgreSQL(pgvector) + Redis
> 프론트엔드: Next.js (frontend/)
> **프로덕션 호스팅**: Vercel(프론트) + Railway(백엔드/Celery/Redis) + Supabase(DB/pgvector)

---

## 프로젝트 구조

```
Interactive-flipped-learning/
├── .github/workflows/ci.yml    # GitHub Actions CI/CD
├── docker-compose.yml           # 개발 환경 (6개 서비스)
├── docker-compose.prod.yml      # 프로덕션 환경 (9개 서비스 + nginx + certbot)
├── .env.example                 # 환경변수 템플릿
├── .env.staging                 # 스테이징 환경 템플릿
├── .env.production              # 프로덕션 환경 템플릿
├── nginx/nginx.conf             # 리버스 프록시 + SSL
├── scripts/init-ssl.sh          # Let's Encrypt SSL 초기화
│
├── backend/                     # ★ 통합 FastAPI 백엔드 (유일한 서버)
│   ├── Dockerfile               # 개발용
│   ├── Dockerfile.prod          # 프로덕션용 (멀티스테이지)
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/versions/        # 0001~0006 마이그레이션
│   ├── app/
│   │   ├── main.py              # FastAPI 앱 진입점 + 미들웨어
│   │   ├── celery_app.py        # Celery 인스턴스
│   │   ├── api/
│   │   │   ├── deps.py          # 인증, 권한 의존성
│   │   │   └── v1/
│   │   │       ├── auth.py         # Google OAuth + JWT
│   │   │       ├── courses.py      # 강좌 CRUD
│   │   │       ├── lectures.py     # 강의 CRUD
│   │   │       ├── questions.py    # 평가 시스템
│   │   │       ├── videos.py       # 스크립트 에디터
│   │   │       ├── sessions.py     # 세션 관리 (6단계 상태머신)
│   │   │       ├── dashboard.py    # 교수자 대시보드 분석
│   │   │       ├── render.py       # HeyGen 렌더링 요청 + PPT 업로드
│   │   │       ├── webhooks.py     # HeyGen 웹훅 (HMAC 검증)
│   │   │       ├── attention.py    # 집중도 모니터링
│   │   │       ├── subscription.py # 구독 플랜
│   │   │       ├── qa.py           # RAG 기반 Q&A
│   │   │       └── translate.py    # 번역
│   │   ├── core/
│   │   │   ├── config.py        # pydantic-settings 전체 설정
│   │   │   ├── security.py      # JWT 생성/검증
│   │   │   ├── logging.py       # 구조화 JSON 로깅
│   │   │   ├── middleware.py     # Request ID 미들웨어
│   │   │   └── redis.py         # Redis 클라이언트
│   │   ├── db/
│   │   │   ├── base.py          # DeclarativeBase + 모델 임포트
│   │   │   └── session.py       # AsyncSession + SyncSession
│   │   ├── models/              # 통합 ORM 모델 (15개)
│   │   ├── schemas/             # Pydantic 스키마
│   │   ├── services/            # 비즈니스 로직
│   │   │   └── pipeline/        # PPT→TTS→HeyGen 파이프라인 서비스
│   │   └── tasks/               # Celery 태스크
│   │       ├── pipeline.py      # 5단계 PPT→스크립트 체인
│   │       ├── render.py        # TTS→S3→HeyGen 렌더
│   │       └── polling.py       # HeyGen 폴백 폴링
│   └── tests/                   # 통합 테스트 (16개 파일)
│
└── frontend/                    # Next.js 프론트엔드
    ├── Dockerfile               # 개발용
    ├── Dockerfile.prod          # 프로덕션용 (standalone 멀티스테이지)
    └── src/app/                 # 페이지 (auth, dashboard, lecture, professor)
```

---

## 로컬 실행

```bash
cp .env.example .env
# .env 편집 (JWT_SECRET_KEY, Google OAuth, API 키)
docker-compose up -d
docker-compose exec backend alembic upgrade head
```

| 서비스 | URL |
|--------|-----|
| 프론트엔드 | http://localhost:3000 |
| 백엔드 API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |

---

## 프로덕션 배포 — Vercel + Railway + Supabase (2026-04 결정)

> **선정 사유**: 1인 사용자 단계에서 Lightsail/EC2 같은 고정비 VPS 대신 종량제 무료 티어로 시작.
> 기존 `docker-compose.prod.yml` + nginx 구성은 자체 호스팅 옵션으로 보존.
> **단계별 체크리스트**: [DEPLOYMENT_ROADMAP.md](DEPLOYMENT_ROADMAP.md) — Phase 0~7

### 구성 매핑

| 컴포넌트 | 프로덕션 호스팅 | 비고 |
|---------|----------------|------|
| Next.js 프론트엔드 | **Vercel** | `frontend/` 루트, GitHub 연결 시 자동 배포 |
| FastAPI 백엔드 | **Railway** | `backend/Dockerfile.prod` 재사용 |
| Celery Worker | **Railway** (별도 서비스) | 동일 이미지, 명령만 변경 |
| Celery Beat | **Railway** (별도 서비스) | 동일 이미지, 명령만 변경 |
| Redis | **Railway** 플러그인 | `REDIS_URL` 자동 주입 |
| PostgreSQL + pgvector | **Supabase** | `create extension vector;` 후 `DATABASE_URL` 사용 (Pooler 모드) |
| Auth (Google OAuth) | Supabase Auth 또는 기존 자체 JWT | 단계적 마이그레이션 가능 |
| Storage (PPT/오디오) | Supabase Storage 또는 기존 S3 | 환경변수 분기 |
| nginx / Let's Encrypt | **사용 안 함** | TLS는 Vercel/Railway가 자동 처리 |

### 배포 절차 (요약)

1. **Supabase**: 프로젝트 생성 (Tokyo) → `create extension if not exists vector;` → `DATABASE_URL`(Pooler) 발급 → 로컬에서 `alembic upgrade head`
2. **Railway**: GitHub 레포 연결 → 서비스 3개 (backend / celery-worker / celery-beat) — 모두 `backend/Dockerfile.prod` 사용, 시작 명령만 차별화. Redis 플러그인 추가
3. **Vercel**: GitHub 레포 연결 → Root Directory `frontend` → `NEXT_PUBLIC_API_URL` 등록
4. **CI/CD**: Vercel/Railway가 GitHub push 자동 감지 — 별도 GitHub Actions 불필요

### 비용 단계

| 단계 | MAU | 월 비용 |
|------|-----|---------|
| 1 (현재) | ~10 | $0~5 (모두 Free) |
| 2 | 100~1,000 | $25~50 |
| 3 | 1,000~10,000 | $100~300 (Pro) |
| 4 | 10,000+ | AWS ECS/EKS 검토 |

### DB 백업/복원

- Supabase는 자동 일일 백업 (Pro 7일 보관). Free 티어는 PITR 미지원
- 수동: `pg_dump $DATABASE_URL > backup.sql` / `psql $DATABASE_URL < backup.sql`

---

## (참고) 자체 호스팅 — Docker Compose VPS

기존 단일 서버(VPS) 배포 방식 — 트래픽이 충분히 누적된 후 비용 효율을 위해 사용 가능.
**전체 운영 플레이북은 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** 참조.

### 신규 서버 1회 셋업 (Ubuntu 22.04/24.04)

```bash
# 0. 사전: 도메인 DNS A 레코드 → 서버 IP, SSH 키 등록, GHCR PAT(private 패키지 시)

# 1. 서버 초기화 — Docker/UFW/fail2ban/swap/chrony/unattended-upgrades 자동 설치
sudo apt-get install -y git
sudo git clone https://github.com/hdj82-bot/Interactive-flipped-learning.git /opt/ifl-platform
cd /opt/ifl-platform
sudo ./scripts/setup-server.sh              # 옵션: SWAP_SIZE_GB / TIMEZONE / GHCR_USER / GHCR_TOKEN

# 2. (private 패키지 시) GHCR 로그인
echo "$GHCR_TOKEN" | sudo docker login ghcr.io -u <user> --password-stdin

# 3. .env 작성
sudo cp .env.production .env && sudo vi .env

# 4. 환경변수 검증
./scripts/validate-env.sh --strict

# 5. 최초 배포
DOMAIN=your-domain.com EMAIL=admin@your-domain.com ./scripts/deploy.sh init

# 6. 스모크 테스트
./scripts/smoke-test.sh your-domain.com
```

### 배포 명령어

```bash
./scripts/deploy.sh init       # 최초 배포 (SSL 포함)
./scripts/deploy.sh update     # 무중단 rolling 업데이트
./scripts/deploy.sh rollback   # 직전 버전 롤백
./scripts/deploy.sh status     # 서비스 상태 확인
./scripts/deploy.sh logs backend  # 로그 조회
./scripts/backup.sh backup | list | restore <file>
```

### 무중단 (Rolling) 업데이트 / 롤백

`update`는 backend / frontend를 다음 패턴으로 교체:
1. 새 컨테이너 1개 추가 (`compose up -d --no-recreate --scale=2`)
2. healthcheck `healthy` 대기 (최대 120s)
3. 기존 컨테이너 graceful stop (SIGTERM, `stop_grace_period`)
4. 기존 컨테이너 제거 → 새 인스턴스 단독 운영

worker는 `docker compose stop -t 60`으로 SIGTERM + 60초 대기 후 재기동 (Celery `acks_late=True` 가정).
beat는 단일 인스턴스라 `--force-recreate`로 즉시 교체.

`rollback`은 직전 update 시 저장한 `$STATE_DIR/rollback.env` 스냅샷을 사용해 GHCR에서 이전 이미지 pull → 동일 rolling 패턴.
1단계 뒤로만 자동 롤백 가능. DB 스키마는 자동 복귀 대상 아님 — `./scripts/backup.sh restore` 또는 `alembic downgrade` 별도 처리.

### GitHub Actions CD

자체 호스팅 시에만 활성화. 필요 Variables/Secrets:
- Variables: `DEPLOY_ENABLED=true`
- Secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`
- `production` environment에 Required reviewers 권장

---

## 테스트

```bash
cd backend
pip install -r requirements.txt
pip install pytest pytest-asyncio pytest-cov aiosqlite httpx python-pptx
pytest --tb=short --cov=app -q
```

---

## 세션 상태머신

```
NOT_STARTED → IN_PROGRESS
IN_PROGRESS → QA_MODE | PAUSED | ASSESSMENT | COMPLETED
QA_MODE     → IN_PROGRESS | PAUSED
PAUSED      → IN_PROGRESS
ASSESSMENT  → IN_PROGRESS | COMPLETED
COMPLETED   → (terminal)
```

## Video 상태 전이

```
draft → pending_review → rendering → done
                  ↓
               archived  (모든 상태에서 가능)
```

## 아키텍처 (프로덕션)

```
                  ┌─────────────┐
   사용자 ─HTTPS─▶│   Vercel    │  ← Next.js 프론트엔드 (CDN/Edge)
                  └──────┬──────┘
                         │ NEXT_PUBLIC_API_URL
                         ▼
                  ┌─────────────┐
                  │   Railway   │  ← FastAPI / Celery Worker / Celery Beat / Redis
                  └──────┬──────┘
                         │ DATABASE_URL
                         ▼
                  ┌─────────────┐
                  │  Supabase   │  ← Postgres + pgvector + Auth + Storage
                  └─────────────┘
```

## 아키텍처 (로컬 개발)

```
┌────────┐ ┌─────────┐
│Frontend│ │Backend  │
│Next.js │ │FastAPI  │
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
