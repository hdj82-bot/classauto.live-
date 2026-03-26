# feat/infra → main 머지 준비 체크리스트

> 작성일: 2026-03-26
> 대상 브랜치: `feat/infra` → `main`

---

## 1. 자동 검증 완료 항목 ✅

### 1-1. Python 구문 검사
- ✅ 백엔드 Python 파일 **53개** 전체 `py_compile` 통과 (SyntaxError 없음)

### 1-2. Import 체인 검증
- ✅ `app.main` 임포트 성공 → **20개 API 엔드포인트** 정상 등록 확인
  - `GET /health`
  - 인증 5개, 강좌 2개, 강의 4개, 평가 4개, 스크립트 에디터 5개

### 1-3. Alembic 마이그레이션 체인
- ✅ 체인 연결 정상: `0001 → 0002 → 0003 → 0004 → 0005`
  | 파일 | 내용 | down_revision |
  |------|------|---------------|
  | 0001 | users, lectures, learning_sessions | `None` (최초) |
  | 0002 | UserRole enum, 프로필 필드 | `0001` |
  | 0003 | courses, lectures 확장 | `0002` |
  | 0004 | questions, responses (평가 시스템) | `0003` |
  | 0005 | videos, video_scripts (스크립트 에디터) | `0004` |

### 1-4. docker-compose.yml 구문
- ✅ YAML 구문 검증 통과 (4개 서비스: db, redis, backend, frontend)

### 1-5. Dockerfile 존재
- ✅ `backend/Dockerfile` 존재
- ✅ `frontend/Dockerfile` 존재

### 1-6. .env.example 정비
- ✅ `DATABASE_URL` asyncpg 드라이버 형식 (`postgresql+asyncpg://`)
- ✅ 필수 환경변수 전체 포함 (JWT, Google OAuth, Anthropic, 평가 튜닝)

---

## 2. 머지 전 수동 확인 항목

### 2-1. 실환경 시크릿 준비

```bash
# 필수 - 빈 값이면 서비스 실행 불가
cp .env.example .env
```

아래 항목 반드시 실제 값으로 채울 것:

| 변수 | 발급 방법 | 비고 |
|------|---------|------|
| `JWT_SECRET_KEY` | `openssl rand -hex 32` | 최소 32자, 프로덕션에서 절대 기본값 사용 금지 |
| `GOOGLE_OAUTH_CLIENT_ID` | Google Cloud Console | OAuth 2.0 클라이언트 ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google Cloud Console | OAuth 2.0 클라이언트 Secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | 직접 입력 | 개발: `http://localhost:8000/api/auth/google/callback` |
| `ANTHROPIC_API_KEY` | console.anthropic.com | 문제 자동 생성 API |

### 2-2. docker-compose up 실제 실행

```bash
# 전체 스택 시작
docker-compose up -d

# 헬스체크 (약 30초 후)
curl http://localhost:8000/health
# 기대 응답: {"status": "ok"}

# DB 마이그레이션
docker-compose exec backend alembic upgrade head

# 마이그레이션 현황 확인
docker-compose exec backend alembic current
# 기대 출력: <hash> (head) - 0005 버전
```

### 2-3. Google OAuth 플로우 실제 테스트

```
1. http://localhost:3000 접속
2. 교수자/학습자 선택 후 Google 로그인
3. Google 계정 선택 → OAuth 동의
4. 신규 유저: /auth/complete-profile 리다이렉트 확인
   기존 유저: /dashboard 리다이렉트 확인
5. Access Token 15분 만료 후 자동 재발급 확인 (axios 인터셉터)
```

### 2-4. Claude API 문제 생성 테스트

```bash
# 교수자 토큰으로 문제 생성 요청
curl -X POST http://localhost:8000/api/lectures/{lecture_id}/questions/generate \
  -H "Authorization: Bearer <professor_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "ppt_content": "슬라이드 1: Python 소개\n슬라이드 2: 변수와 자료형",
    "formative_count": 3,
    "summative_count": 2,
    "video_duration_seconds": 300
  }'
# 기대: 201 Created, formative_created=3, summative_created=2
```

### 2-5. 자동화 테스트 최종 실행

```bash
# Docker 컨테이너 내부에서
docker-compose exec backend pip install -r requirements-test.txt
docker-compose exec backend pytest --tb=short

# 또는 로컬 uv 환경에서
cd backend
uv run --with pytest --with pytest-asyncio --with httpx --with aiosqlite pytest
```

**기대 결과**: `37 passed, 0 failed`

---

## 3. PR 체크리스트 (리뷰어 안내)

### 코드 리뷰 포인트

- [ ] `backend/app/services/question.py` — Claude API 응답 파싱 로직 (`thinking` 블록 분리)
- [ ] `backend/app/services/response.py` — 타임스탬프 검증 로직 (`±120초 허용 오차`)
- [ ] `backend/app/services/video.py` — 상태 전이 규칙 (`pending_review` 에서만 편집 가능)
- [ ] `backend/alembic/versions/0004_*.py` — JSONB 타입 사용 (PostgreSQL 전용)
- [ ] `backend/alembic/versions/0005_*.py` — `videostatus` enum + 인덱스 생성
- [ ] `backend/tests/conftest.py` — SQLite 폴백 + FakeRedis 격리 방식

### 보안 확인

- [ ] `.gitignore`에 `.env` 포함 여부 확인 (시크릿 커밋 방지)
- [ ] `JWT_SECRET_KEY` 기본값(`change-me-in-production`)으로 서비스 배포 금지
- [ ] `ANTHROPIC_API_KEY` 실제 키가 코드에 하드코딩되지 않았는지 확인

### 알려진 제한사항

- **pgvector 검색**: 테스트는 SQLite + 인메모리 DB 사용 → pgvector 관련 쿼리는 실제 PostgreSQL에서만 테스트 가능
- **HeyGen 연동**: `approve` → `rendering` 전환까지만 구현. 실제 HeyGen API 호출은 `feat/heygen` 브랜치에서 구현 예정
- **AWS S3**: 파일 업로드 코드 미구현. `feat/pipeline` 브랜치에서 구현 예정

---

## 4. 머지 후 작업

```bash
# main 브랜치에서 태그 생성 (선택)
git tag v0.1.0-infra -m "feat/infra 머지 완료 - 백엔드 API 24개 + 통합 테스트"
git push origin v0.1.0-infra

# 후속 브랜치 생성 (필요 시)
git checkout -b feat/heygen   # HeyGen 영상 자동 생성
git checkout -b feat/pipeline # AI 스크립트 생성 파이프라인
```

---

## 5. 브랜치 커밋 요약

| 커밋 | 내용 |
|------|------|
| `88e79d9` | init |
| `a05eaca` | 초기 인프라 구성 (Docker Compose + FastAPI 스캐폴딩) |
| `1a290c9` | Alembic 마이그레이션 설정 및 초기 DB 스키마 |
| `850d16d` | JWT + Google OAuth 인증 모듈 구현 |
| `0e92dc5` | Next.js 초기화 + 인증 UI 구현 |
| `63f9856` | Lecture CRUD API 구현 (Course/Lecture + slug + 만료일) |
| `338f122` | 평가 시스템 API 구현 (Claude API 문제 자동 생성) |
| `e685670` | 스크립트 에디터 API 구현 |
| `105c8cf` | 백엔드 통합 테스트 37개 + CLAUDE.md 작성 |
| `7bfc242` | .env.example 정비 (DATABASE_URL 드라이버 수정 + 누락 변수 추가) |
