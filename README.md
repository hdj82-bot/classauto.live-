# IFL Platform — Infrastructure

Interactive Flipped Learning 플랫폼 인프라 구성 저장소.

## 서비스 구성

| 서비스 | 이미지 | 포트 | 설명 |
|--------|--------|------|------|
| db | pgvector/pgvector:pg16 | 5432 | PostgreSQL 16 + pgvector |
| redis | redis:7-alpine | 6379 | Redis 7 |
| backend | ./backend | 8000 | FastAPI (uvicorn) |
| frontend | ./frontend | 3000 | Next.js |

## 시작하기

### 1. 환경 변수 설정

```bash
cp .env.example .env
# .env 파일을 열어 API 키 및 시크릿 값 입력
```

### 2. Docker Compose 실행

```bash
docker compose up -d
```

### 3. 서비스 확인

```bash
docker compose ps
curl http://localhost:8000/health
```

## 프로젝트 구조

```
ifl-infra/
├── backend/          # FastAPI 앱
│   ├── app/
│   │   └── main.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/         # Next.js 앱
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## 브랜치 전략

- `main` — 프로덕션
- `feat/infra` — 인프라 작업 (현재)
