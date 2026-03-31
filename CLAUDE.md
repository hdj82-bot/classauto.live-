# IFL Platform — Interactive Flipped Learning

> **통합 백엔드** — FastAPI + Celery + PostgreSQL(pgvector) + Redis
> 프론트엔드: Next.js (frontend/)

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

## 프로덕션 배포

### 신규 서버 설정 (Ubuntu)
```bash
# 1. 서버 초기 설정 (Docker, 방화벽, 프로젝트 클론)
sudo ./scripts/setup-server.sh

# 2. 환경변수 설정
vi /opt/ifl-platform/.env   # CHANGE_ME 값 모두 수정

# 3. DNS 설정: A 레코드로 도메인 → 서버 IP

# 4. 배포
cd /opt/ifl-platform
DOMAIN=your-domain.com EMAIL=admin@your-domain.com ./scripts/deploy.sh init
```

### 배포 명령어
```bash
./scripts/deploy.sh init       # 최초 배포 (SSL 포함)
./scripts/deploy.sh update     # 업데이트 배포
./scripts/deploy.sh rollback   # 직전 버전 롤백
./scripts/deploy.sh status     # 서비스 상태 확인
./scripts/deploy.sh logs backend  # 로그 조회
```

### DB 백업/복원
```bash
./scripts/backup.sh backup              # 백업 생성
./scripts/backup.sh list                # 백업 목록
./scripts/backup.sh restore backup.sql  # 복원
```

### GitHub Actions CD
main 브랜치 push 시 자동 배포. GitHub Secrets에 설정 필요:
- `DEPLOY_HOST`: 서버 IP
- `DEPLOY_USER`: SSH 사용자
- `DEPLOY_SSH_KEY`: SSH 개인키

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

## 아키텍처

```
          ┌──────────┐
 ┌───────▶│  Nginx   │◀── HTTPS (443)
 │        │  (SSL)   │
 │        └──┬────┬──┘
 │           │    │
┌▼───────┐ ┌▼────▼──┐
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
