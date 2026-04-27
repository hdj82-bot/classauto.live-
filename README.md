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
Infra (개발):  Docker Compose
Infra (프로덕션): Vercel(프론트) + Railway(백엔드/Celery/Redis) + Supabase(DB/pgvector/Auth/Storage)
AI:       Anthropic Claude (스크립트/문제) + OpenAI (임베딩)
Video:    HeyGen (아바타) + ElevenLabs/Google TTS
Monitor:  Sentry (에러) + Prometheus (메트릭) + 구조화 JSON 로깅
```

> **배포 전략 (2026-04 기준):** 초기 사용자 단계에서는 종량제 무료 티어 조합으로 시작 (월 $0~5).
> 사용자 증가 시 Pro 플랜으로 단계적 확장, 본격 확장 시 AWS ECS 등으로 마이그레이션 검토.

## 아키텍처 (프로덕션)

```
                  ┌─────────────┐
   사용자 ─HTTPS─▶│   Vercel    │  ← Next.js 프론트엔드 (CDN/Edge)
                  │  (프론트)    │
                  └──────┬──────┘
                         │ /api/* (rewrite)
                         ▼
                  ┌─────────────┐
                  │   Railway   │  ← FastAPI + Celery Worker + Celery Beat + Redis
                  │  (백엔드)    │     (컨테이너, Dockerfile.prod 재사용)
                  └──────┬──────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
       ┌────────────┐        ┌─────────────┐
       │  Supabase  │        │  외부 API   │
       │ Postgres   │        │ HeyGen/     │
       │ +pgvector  │        │ Claude/     │
       │ +Auth/     │        │ ElevenLabs/ │
       │  Storage   │        │ Stripe      │
       └────────────┘        └─────────────┘
                  │
                  ▼
            Sentry / Prometheus
```

## 아키텍처 (로컬 개발 — Docker Compose)

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


## 프로덕션 배포 (Vercel + Railway + Supabase)

> 초기 단계 종량제 구성. 무료 티어로 시작해 사용량 증가에 따라 단계적 확장.
> Lightsail/EC2 같은 고정 비용 VPS는 트래픽이 충분히 누적되기 전까지 사용하지 않음.
>
> **단계별 체크리스트**: [DEPLOYMENT_ROADMAP.md](DEPLOYMENT_ROADMAP.md) — Phase 0~7 + 트러블슈팅

### 1. Supabase — DB + Auth + Storage

1. [supabase.com](https://supabase.com) 프로젝트 생성 (Tokyo 리전 권장 — 한국 레이턴시)
2. SQL Editor에서 pgvector 활성화: `create extension if not exists vector;`
3. Connection String 복사: `DATABASE_URL` (Pooler 모드 권장 — Railway 컨테이너 풀링 충돌 방지)
4. (선택) Storage 버킷 생성 — PPT/오디오/영상 업로드 시 S3 대체 가능
5. 백엔드에서 `alembic upgrade head` 실행해 스키마 적용

### 2. Railway — FastAPI + Celery + Redis

1. [railway.app](https://railway.app) 프로젝트 생성 → GitHub 레포 연결
2. 서비스 3개 생성:
   - **backend**: `backend/Dockerfile.prod` 기반, 시작 명령 `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **celery-worker**: 같은 이미지, 시작 명령 `celery -A app.celery_app worker --loglevel=info --concurrency=2`
   - **celery-beat**: 같은 이미지, 시작 명령 `celery -A app.celery_app beat --loglevel=info`
3. Redis 플러그인 추가 (Railway 내장) → `REDIS_URL` 자동 주입
4. 환경변수 설정 (Supabase `DATABASE_URL`, JWT 키, Claude/HeyGen 키 등)
5. 배포 후 공개 도메인 확인 (예: `classauto-api.up.railway.app`)

### 3. Vercel — Next.js 프론트엔드

1. [vercel.com](https://vercel.com) 프로젝트 생성 → GitHub 레포 연결
2. **Root Directory**: `frontend`
3. **Build Command**: `npm run build` (기본값 사용)
4. 환경변수 설정:
   - `NEXT_PUBLIC_API_URL` = Railway 백엔드 도메인
   - Supabase Anon Key, OAuth 키 등

### 4. 도메인 연결

- 프론트: Vercel에 `classauto.live` 연결 (A 레코드 → Vercel IP, CNAME `www`)
- 백엔드: Railway에 `api.classauto.live` 연결 (CNAME → Railway 도메인)
- Google OAuth 콘솔에 production redirect URI 추가
- HeyGen Webhooks URL을 `https://api.classauto.live/api/v1/webhooks/heygen`로 등록

### 5. CI/CD

- main 브랜치 push 시 Vercel/Railway 자동 빌드/배포 (별도 GitHub Actions 불필요)
- 기존 `scripts/deploy.sh` 및 GitHub Actions deploy job은 자체 호스팅(VPS) 옵션 전용

### 비용 가이드

| 단계 | MAU | 예상 월 비용 |
|------|-----|-------------|
| 1단계 (현재) | ~10명 | $0~5 (모두 무료 티어) |
| 2단계 | 100~1,000 | $25~50 (Vercel/Railway/Supabase 일부 유료) |
| 3단계 | 1,000~10,000 | $100~300 (Pro 플랜 전환) |
| 4단계 | 10,000+ | AWS ECS/EKS 마이그레이션 검토 |

### DB 백업/복원

- Supabase는 자동 일일 백업 (Pro 플랜 7일 보관, Free는 PITR 미지원)
- 수동 백업: `pg_dump $DATABASE_URL > backup.sql`
- 복원: `psql $DATABASE_URL < backup.sql`

---

## (참고) 자체 호스팅 옵션 — Docker Compose VPS

기존 `docker-compose.prod.yml` + nginx + Let's Encrypt 구성은 그대로 유지됩니다.
서버 1대에 풀스택을 올리고 싶을 때 사용 (Vercel/Railway/Supabase가 부담될 만큼 트래픽이 누적된 후 검토).

> **전체 운영 플레이북**: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (서버 임대 → DNS → init → CD → 운영 점검)

### 핵심 명령어

```bash
sudo ./scripts/setup-server.sh                                   # 1회: Docker/UFW/swap/fail2ban 자동 설치
DOMAIN=your-domain.com EMAIL=admin@example.com ./scripts/deploy.sh init  # 최초 배포 (SSL 포함)

./scripts/deploy.sh update     # 무중단 rolling 업데이트 (GHCR 이미지 pull)
./scripts/deploy.sh rollback   # 직전 버전 롤백 (스냅샷 기반)
./scripts/deploy.sh status     # 서비스 상태
./scripts/deploy.sh logs backend  # 로그

./scripts/backup.sh backup | list | restore <file>   # 호스트 측 수동 백업/복원
./scripts/smoke-test.sh your-domain.com              # 외부 시점 스모크 테스트
```

### 무중단 (Rolling) 업데이트

`update`는 backend / frontend를 다음 패턴으로 교체:
1. 새 컨테이너 1개 추가 (`compose up -d --no-recreate --scale=2`)
2. healthcheck `healthy` 대기 (최대 120s)
3. 기존 컨테이너 graceful stop (SIGTERM, `stop_grace_period`)
4. 기존 컨테이너 제거 → 새 인스턴스 단독 운영

worker는 `docker compose stop -t 60`으로 SIGTERM + 60초 대기 후 새 이미지로 재기동 (Celery `acks_late=True` 가정).
beat는 단일 인스턴스라 `--force-recreate`로 즉시 교체.
nginx `upstream`에 `max_fails=2 fail_timeout=10s`로 unhealthy 컨테이너 자동 제외.

### 무중단 롤백

`rollback`은 `update` 시작 직전 저장된 스냅샷(`$STATE_DIR/rollback.env`)에서 직전 git SHA + GHCR 이미지 태그(`sha-<short>`)를 읽어 동일 rolling 패턴으로 교체.
- 1단계 뒤로만 자동 롤백 가능 (스냅샷은 매 update 시 덮어써짐)
- DB 스키마는 자동 복귀 안 함 — 파괴적 마이그레이션 시 `./scripts/backup.sh restore <file>` 또는 `alembic downgrade` 별도 처리

### GitHub Actions CD 게이트

자체 호스팅 시에만 활성화. 기본값은 비활성:

| 항목 | 위치 | 값 |
|------|------|-----|
| `DEPLOY_ENABLED` | Variables | `true` |
| `DEPLOY_HOST` | Secrets | 서버 IP/도메인 |
| `DEPLOY_USER` | Secrets | SSH 사용자 |
| `DEPLOY_SSH_KEY` | Secrets | SSH 개인키 PEM |
| `production` env | Settings → Environments | Required reviewers 1명 이상 권장 |

배포 트리거: 릴리스 태그 푸시(`git tag -a v1.2.3 ...`) 또는 Actions 탭 수동 트리거 (`deploy` 체크박스).
단순 main 푸시는 빌드/테스트만 실행되고 deploy job은 skip.

### 신규 서버 셋업 — 1회 체크리스트

상세 단계는 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) 참조. 요약:

1. **사전**: 도메인 DNS A 레코드, SSH 키, GHCR PAT(private 패키지 시)
2. **`scripts/setup-server.sh`**: Docker/UFW/fail2ban/swap/chrony/unattended-upgrades 자동 설치
3. **GHCR 로그인**: private 패키지인 경우만
4. **`.env` 작성**: `.env.production` 복사 후 `CHANGE_ME` 모두 교체
5. **`./scripts/validate-env.sh --strict`**: 형식/길이/HTTPS/도메인 검증, 종료코드 0까지 반복
6. **`./scripts/deploy.sh init`**: DB 마이그레이션 + Let's Encrypt + 전체 스택 기동
7. **`./scripts/smoke-test.sh`**: `/health`, 보안 헤더, TLS 1.3, OAuth 리다이렉트 등 자동 점검

