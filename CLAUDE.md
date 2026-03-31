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

```bash
cp .env.production .env
# 모든 CHANGE_ME_ 값 변경!
DOMAIN=example.com EMAIL=admin@example.com ./scripts/init-ssl.sh
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

---

## 테스트

```bash
cd backend
pip install -r requirements.txt -r requirements-test.txt
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
