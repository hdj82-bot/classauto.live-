# IFL Platform — Interactive Flipped Learning

> **통합 백엔드** — FastAPI + Celery + PostgreSQL(pgvector) + Redis
> 프론트엔드: Next.js (frontend/)

---

## 프로젝트 구조

```
Interactive-flipped-learning/
├── docker-compose.yml          # 6개 서비스 (db/redis/backend/worker/beat/frontend)
├── .env.example                # 환경변수 템플릿
├── CLAUDE.md                   # 이 문서
│
├── backend/                    # ★ 통합 FastAPI 백엔드 (유일한 서버)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/versions/       # 0001~0006 마이그레이션
│   ├── app/
│   │   ├── main.py             # FastAPI 앱 진입점
│   │   ├── celery_app.py       # Celery 인스턴스
│   │   ├── api/
│   │   │   ├── deps.py         # 인증, 권한 의존성
│   │   │   └── v1/
│   │   │       ├── auth.py         # Google OAuth + JWT
│   │   │       ├── courses.py      # 강좌 CRUD
│   │   │       ├── lectures.py     # 강의 CRUD
│   │   │       ├── questions.py    # 평가 시스템
│   │   │       ├── videos.py       # 스크립트 에디터
│   │   │       ├── sessions.py     # 세션 관리 (상태머신)
│   │   │       ├── dashboard.py    # 교수자 대시보드
│   │   │       ├── render.py       # HeyGen 렌더링 요청
│   │   │       ├── webhooks.py     # HeyGen 웹훅
│   │   │       ├── attention.py    # 집중도 모니터링
│   │   │       ├── subscription.py # 구독 플랜
│   │   │       └── translate.py    # 번역
│   │   ├── core/
│   │   │   ├── config.py       # 전체 설정 (통합)
│   │   │   ├── security.py     # JWT
│   │   │   └── redis.py
│   │   ├── db/
│   │   │   ├── base.py         # DeclarativeBase + 모델 임포트
│   │   │   └── session.py      # AsyncSession + SyncSession
│   │   ├── models/             # 통합 ORM 모델
│   │   │   ├── user.py, course.py, lecture.py
│   │   │   ├── session.py      # LearningSession (6단계 상태머신)
│   │   │   ├── question.py, response.py
│   │   │   ├── video.py, video_render.py
│   │   │   ├── embedding.py, qa_log.py
│   │   │   ├── cost_log.py, subscription.py
│   │   │   ├── translation.py, assessment_result.py
│   │   ├── schemas/
│   │   ├── services/
│   │   │   ├── auth.py, course.py, lecture.py
│   │   │   ├── question.py, response.py, video.py
│   │   │   ├── session.py     # 세션 + 집중도 추적
│   │   │   ├── dashboard.py   # 대시보드 분석
│   │   │   └── pipeline/      # 파이프라인 서비스
│   │   │       ├── heygen.py, tts.py, s3.py
│   │   │       ├── parser.py, script_generator.py
│   │   │       ├── embedding.py, retriever.py, qa.py
│   │   │       ├── translator.py, notification.py
│   │   │       ├── cost_log.py, subscription.py
│   │   │       └── schemas.py
│   │   ├── tasks/             # Celery 태스크
│   │   │   ├── pipeline.py    # 5단계 PPT→스크립트 체인
│   │   │   ├── render.py      # TTS→S3→HeyGen 렌더
│   │   │   └── polling.py     # HeyGen 폴백 폴링
│   │   └── utils/
│   └── tests/
│
├── frontend/                   # Next.js 프론트엔드
└── ifl-web/                    # (레거시, 추후 정리)
```

## 로컬 실행

```bash
cp .env.example .env
# .env 편집 (JWT_SECRET_KEY, Google OAuth, API 키)
docker-compose up -d
docker-compose exec backend alembic upgrade head
```

| 서비스 | URL |
|--------|-----|
| 백엔드 API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| 프론트엔드 | http://localhost:3000 |

## 테스트

```bash
cd backend
pip install -r requirements.txt pytest pytest-asyncio pytest-cov aiosqlite httpx
pytest
```

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
