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

### 신규 서버 1회 셋업 (Ubuntu 22.04/24.04)

상세 체크리스트는 [README.md — "신규 서버 셋업 — 1회 체크리스트"](README.md#신규-서버-셋업--1회-체크리스트) 참조.
요약하면 다음 순서:

```bash
# 0. 사전: 도메인 DNS A 레코드 → 서버 IP, SSH 키 등록, GHCR PAT 발급(private 패키지 시)

# 1. 서버 초기화 — Docker/UFW/fail2ban/swap/chrony/unattended-upgrades 자동 설치
sudo apt-get install -y git
sudo git clone https://github.com/hdj82-bot/classauto.live-.git /opt/ifl-platform
cd /opt/ifl-platform
sudo ./scripts/setup-server.sh              # 옵션: SWAP_SIZE_GB / TIMEZONE / GHCR_USER / GHCR_TOKEN

# 2. (private 패키지 시) GHCR 로그인
echo "$GHCR_TOKEN" | sudo docker login ghcr.io -u <user> --password-stdin

# 3. .env 작성 (CHANGE_ME 모두 교체)
sudo cp .env.production .env && sudo vi .env

# 4. 환경변수 검증 — 형식/길이/프리픽스 + production 전제 강화
./scripts/validate-env.sh --strict

# 5. 최초 배포 (DB 마이그레이션 + Let's Encrypt + 전체 스택 기동)
DOMAIN=your-domain.com EMAIL=admin@your-domain.com ./scripts/deploy.sh init

# 6. 스모크 테스트
./scripts/smoke-test.sh your-domain.com
```

`validate-env.sh --strict` 가 0 으로 빠질 때까지 5단계로 진행하지 말 것.

### 배포 명령어
```bash
./scripts/deploy.sh init       # 최초 배포 (SSL 포함)
./scripts/deploy.sh update     # 무중단 rolling 업데이트 (아래 참조)
./scripts/deploy.sh rollback   # 직전 버전 롤백
./scripts/deploy.sh status     # 서비스 상태 확인
./scripts/deploy.sh logs backend  # 로그 조회
```

### 무중단 (Rolling) 업데이트
`update` 는 backend / frontend 를 다음 패턴으로 교체한다:
1. 새 컨테이너 1개 추가 (`compose up -d --no-recreate --scale=2`)
2. 새 컨테이너 healthcheck 가 `healthy` 가 될 때까지 대기 (최대 120s)
3. 기존 컨테이너 graceful stop (SIGTERM, `stop_grace_period` 동안 in-flight 요청 처리)
4. 기존 컨테이너 제거 → 새 인스턴스 단독 운영

worker 는 `docker compose stop -t 60` 으로 SIGTERM + 60초 대기 후 새 이미지로 재기동
(Celery `acks_late=True` 가정 — 시간 내 ack 못 한 태스크는 broker 에 남아 재큐잉).
beat 는 단일 인스턴스(동시 실행 금지)라 `--force-recreate` 로 즉시 교체.

nginx `upstream` 은 `max_fails=2 fail_timeout=10s` 로 unhealthy 컨테이너 자동 제외.
배포 중 5xx 가 발생하지 않는지 검증하려면:
```bash
while true; do curl -o /dev/null -s -w "%{http_code}\n" \
  https://api.$DOMAIN/health; sleep 0.2; done
```

### 무중단 롤백
`update` 는 시작 직전 `$STATE_DIR/rollback.env` (기본 `/var/lib/ifl/rollback.env`,
권한 없을 시 `~/.ifl-deploy/rollback.env`) 에 직전 git SHA 와 GHCR 이미지 태그
(`sha-<short>`) 를 기록한다. `rollback` 은 그 스냅샷을 읽어 `IFL_IMAGE_TAG=sha-<prev>`
로 GHCR 에서 이전 이미지를 pull → 위와 동일한 rolling 패턴으로 backend/frontend
교체 → worker graceful → beat force-recreate. GHCR 에서 태그가 삭제된 경우
로컬 캐시된 이미지 SHA 로 폴백.

제약: 1단계 뒤로만(직전 update 직전 상태) 자동 롤백 가능. DB 스키마는 자동 복귀
대상이 아니며, 파괴적 마이그레이션이 있었다면 `./scripts/backup.sh restore <파일>`
또는 `alembic downgrade` 로 별도 처리.

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
