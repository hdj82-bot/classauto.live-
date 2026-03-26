# IFL Platform — ifl-infra

> **Interactive Flipped Learning Platform** 인프라 레포지토리.
> FastAPI 백엔드 + Next.js 프론트엔드 + PostgreSQL + Redis를 Docker Compose로 구성합니다.

---

## 목차

1. [프로젝트 구조](#1-프로젝트-구조)
2. [브랜치 역할](#2-브랜치-역할)
3. [로컬 실행 방법](#3-로컬-실행-방법)
4. [환경변수 설정](#4-환경변수-설정)
5. [DB 마이그레이션](#5-db-마이그레이션)
6. [API 엔드포인트 전체 목록](#6-api-엔드포인트-전체-목록)
7. [테스트 실행](#7-테스트-실행)
8. [아키텍처 개요](#8-아키텍처-개요)

---

## 1. 프로젝트 구조

```
ifl-infra/
├── docker-compose.yml          # 4개 서비스 정의 (db/redis/backend/frontend)
├── .env.example                # 환경변수 템플릿
├── CLAUDE.md                   # 이 문서
│
├── backend/                    # FastAPI 백엔드
│   ├── Dockerfile
│   ├── requirements.txt        # 프로덕션 의존성
│   ├── requirements-test.txt   # 테스트 의존성
│   ├── pytest.ini
│   ├── alembic.ini
│   ├── alembic/
│   │   └── versions/
│   │       ├── 0001_create_initial_tables.py
│   │       ├── 0002_add_user_role_and_profile_fields.py
│   │       ├── 0003_add_courses_and_update_lectures.py
│   │       ├── 0004_add_questions_and_responses.py
│   │       └── 0005_add_videos_and_scripts.py
│   ├── app/
│   │   ├── main.py             # FastAPI 앱 진입점
│   │   ├── api/
│   │   │   ├── deps.py         # 공통 의존성 (인증, 권한)
│   │   │   └── v1/
│   │   │       ├── auth.py     # 인증 라우터
│   │   │       ├── courses.py  # 강좌 라우터
│   │   │       ├── lectures.py # 강의 라우터
│   │   │       ├── questions.py# 평가 시스템 라우터
│   │   │       └── videos.py   # 스크립트 에디터 라우터
│   │   ├── core/
│   │   │   ├── config.py       # pydantic-settings 기반 설정
│   │   │   ├── security.py     # JWT 생성/검증
│   │   │   └── redis.py        # Redis 클라이언트 싱글턴
│   │   ├── db/
│   │   │   ├── base.py         # DeclarativeBase + 모델 임포트
│   │   │   └── session.py      # AsyncSession 팩토리
│   │   ├── models/             # SQLAlchemy ORM 모델
│   │   │   ├── user.py         # User (UserRole enum)
│   │   │   ├── course.py       # Course
│   │   │   ├── lecture.py      # Lecture (slug, expires_at)
│   │   │   ├── session.py      # LearningSession
│   │   │   ├── question.py     # Question (AssessmentType, QuestionType)
│   │   │   ├── response.py     # Response (타임스탬프 검증)
│   │   │   └── video.py        # Video + VideoScript (ToneTag)
│   │   ├── schemas/            # Pydantic 스키마 (요청/응답)
│   │   │   ├── auth.py
│   │   │   ├── course.py
│   │   │   ├── lecture.py
│   │   │   ├── question.py
│   │   │   ├── response.py
│   │   │   └── video.py
│   │   ├── services/           # 비즈니스 로직
│   │   │   ├── auth.py
│   │   │   ├── course.py
│   │   │   ├── lecture.py
│   │   │   ├── question.py     # Claude API 연동
│   │   │   ├── response.py     # 채점 + 타임스탬프 검증
│   │   │   └── video.py        # 스크립트 편집/승인
│   │   └── utils/
│   │       └── slug.py         # 한국어 지원 slugify
│   └── tests/
│       ├── conftest.py         # SQLite + FakeRedis 픽스처
│       ├── test_health.py
│       ├── test_auth.py
│       ├── test_courses.py
│       ├── test_lectures.py
│       ├── test_questions.py
│       └── test_videos.py
│
└── frontend/                   # Next.js 16 프론트엔드
    ├── Dockerfile
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx      # AuthProvider, lang="ko"
    │   │   ├── page.tsx        # → /auth/login 리다이렉트
    │   │   ├── auth/
    │   │   │   ├── login/      # 역할 선택 + Google OAuth 버튼
    │   │   │   ├── callback/   # 토큰 수신 + URL 클리어
    │   │   │   └── complete-profile/ # 추가 정보 입력
    │   │   └── dashboard/
    │   ├── lib/
    │   │   ├── api.ts          # axios + 401 자동 재발급
    │   │   └── tokens.ts       # localStorage 토큰 관리
    │   └── contexts/
    │       └── AuthContext.tsx  # 전역 auth 상태
    └── package.json
```

---

## 2. 브랜치 역할

| 브랜치 | 설명 |
|--------|------|
| `main` | 안정 릴리즈. PR merge만 허용 |
| `feat/infra` | **현재 브랜치.** Docker Compose + FastAPI + Next.js 전체 인프라 구축 |
| `feat/heygen` | HeyGen API 연동 (영상 자동 생성 파이프라인) |
| `feat/pipeline` | AI 스크립트 생성 파이프라인 (이미지→PPT→스크립트) |
| `feat/web` | 학습자용 프론트엔드 UI |
| `feat/auth` | OAuth 고도화 (학교 도메인 제한, 이메일 인증) |

---

## 3. 로컬 실행 방법

### 사전 요구사항

- Docker Desktop 4.x 이상
- `.env` 파일 설정 (아래 [환경변수 설정](#4-환경변수-설정) 참고)

### 전체 스택 시작

```bash
# 1. 레포 클론 후 ifl-infra 디렉토리로 이동
cd ifl-infra

# 2. 환경변수 파일 생성
cp .env.example .env
# .env 파일을 열어 필수 값 입력 (JWT_SECRET_KEY, GOOGLE_OAUTH_* 등)

# 3. 전체 서비스 시작
docker-compose up -d

# 4. DB 마이그레이션 실행 (최초 1회)
docker-compose exec backend alembic upgrade head

# 5. 상태 확인
docker-compose ps
```

### 서비스 접속

| 서비스 | URL |
|--------|-----|
| 프론트엔드 | http://localhost:3000 |
| 백엔드 API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| ReDoc | http://localhost:8000/redoc |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

### 개별 서비스 재시작

```bash
# 백엔드만 재시작
docker-compose restart backend

# 로그 확인
docker-compose logs -f backend
docker-compose logs -f frontend

# 특정 서비스 빌드 후 재시작
docker-compose up -d --build backend
```

### 전체 종료

```bash
# 컨테이너 중지 (데이터 보존)
docker-compose down

# 볼륨까지 삭제 (DB 초기화)
docker-compose down -v
```

---

## 4. 환경변수 설정

`.env.example`을 복사해 `.env`를 만든 후 아래 항목을 채웁니다.

### 필수 항목

```env
# JWT (반드시 변경)
JWT_SECRET_KEY=최소-32자-이상의-랜덤-문자열

# Google OAuth (Google Cloud Console에서 발급)
GOOGLE_OAUTH_CLIENT_ID=xxxxxxxxxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-xxxxxxxxxx
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8000/api/auth/google/callback

# Anthropic Claude API (문제 자동 생성에 필요)
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxx
```

### 선택 항목

```env
# DB / Redis (기본값으로 Docker 내부 서비스 연결)
DATABASE_URL=postgresql+asyncpg://user:pass@db:5432/ifl
POSTGRES_USER=user
POSTGRES_PASSWORD=pass
POSTGRES_DB=ifl
REDIS_URL=redis://redis:6379/0

# 평가 시스템 튜닝
FORMATIVE_SERVE_COUNT=5         # 회당 형성평가 제공 문항 수
SUMMATIVE_SERVE_COUNT=5         # 회당 총괄평가 제공 문항 수
TIMESTAMP_TOLERANCE_SECONDS=120 # 타임스탬프 허용 오차(초)

# HeyGen / AWS (스크립트 에디터 → 렌더링 파이프라인에서 필요)
HEYGEN_API_KEY=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
AWS_REGION=ap-northeast-2
```

### Google OAuth 설정 방법

1. [Google Cloud Console](https://console.cloud.google.com) → API 및 서비스 → 사용자 인증 정보
2. OAuth 2.0 클라이언트 ID 생성 (웹 애플리케이션)
3. 승인된 리디렉션 URI 추가:
   - 개발: `http://localhost:8000/api/auth/google/callback`
   - 프로덕션: `https://your-domain.com/api/auth/google/callback`

---

## 5. DB 마이그레이션

### 최초 적용 (모든 마이그레이션)

```bash
docker-compose exec backend alembic upgrade head
```

### 특정 리비전으로 이동

```bash
# 특정 버전으로 올리기
docker-compose exec backend alembic upgrade 0003

# 한 단계 롤백
docker-compose exec backend alembic downgrade -1

# 특정 버전으로 롤백
docker-compose exec backend alembic downgrade 0002
```

### 마이그레이션 현황 확인

```bash
docker-compose exec backend alembic current   # 현재 적용된 버전
docker-compose exec backend alembic history   # 전체 히스토리
```

### 새 마이그레이션 파일 생성

```bash
docker-compose exec backend alembic revision \
  --autogenerate \
  -m "add_new_table"
# → alembic/versions/XXXX_add_new_table.py 자동 생성
# 생성 후 반드시 내용 검토 (autogenerate는 모든 변경을 감지하지 못함)
```

### 마이그레이션 파일 목록

| 파일 | 내용 |
|------|------|
| `0001` | users, lectures, learning_sessions 테이블 + pgvector 확장 |
| `0002` | UserRole enum 추가, users 프로필 필드 추가 |
| `0003` | courses 테이블 생성, lectures 스키마 변경 (course_id, slug 등) |
| `0004` | questions, responses 테이블 + assessmenttype/questiontype/difficulty enum |
| `0005` | videos, video_scripts 테이블 + videostatus enum |

---

## 6. API 엔드포인트 전체 목록

> **인증 방식**: `Authorization: Bearer <access_token>`
> 교수자/학습자 구분은 JWT payload의 `role` 필드로 판단

### 6-1. 인증 (`/api/auth`)

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| `GET` | `/api/auth/google?role={professor\|student}` | 없음 | Google OAuth 로그인 시작 → 리다이렉트 |
| `GET` | `/api/auth/google/callback` | 없음 | OAuth 콜백 (Google → 백엔드 → 프론트엔드) |
| `POST` | `/api/auth/complete-profile` | temp_token | 신규 유저 추가 정보 입력 완료 |
| `POST` | `/api/auth/refresh` | 없음 | Refresh Token → 새 Access Token 발급 |
| `DELETE` | `/api/auth/logout` | 없음 | Refresh Token 무효화 |

**토큰 흐름**:
```
로그인 → Google OAuth → 기존 유저: /auth/callback?tokens=...
                      → 신규 유저: /auth/complete-profile?temp_token=...
                                   → POST /complete-profile → 정식 토큰 발급
```

### 6-2. 강좌 (`/api/courses`)

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| `GET` | `/api/courses` | 로그인 | 강좌 목록 (교수자: 내 강좌, 학습자: 전체 활성) |
| `POST` | `/api/courses` | 교수자 | 강좌 생성 |

### 6-3. 강의 (`/api/lectures`, `/api/courses/{id}/lectures`)

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| `GET` | `/api/courses/{course_id}/lectures` | 로그인 | 강좌별 강의 목록 |
| `POST` | `/api/lectures` | 교수자 | 강의 생성 (slug 자동 생성) |
| `PATCH` | `/api/lectures/{lecture_id}` | 소유 교수자 | 강의 수정 (title, is_published 등) |
| `GET` | `/api/lectures/{slug}/public` | 없음 | slug로 공개 강의 조회 (expires_at 적용) |

### 6-4. 평가 시스템 (`/api/questions`, `/api/responses`)

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| `POST` | `/api/lectures/{lecture_id}/questions/generate` | 교수자 | Claude API로 PPT 기반 문제 자동 생성 |
| `GET` | `/api/questions/{lecture_id}?assessment_type=formative` | 학습자 | 랜덤화된 문제 목록 조회 |
| `POST` | `/api/responses` | 학습자 | 응답 제출 (타임스탬프 검증 + 자동 채점) |
| `GET` | `/api/responses/{session_id}` | 로그인 | 세션 응답 결과 및 점수 조회 |

**문제 생성 요청 예시**:
```json
POST /api/lectures/{id}/questions/generate
{
  "ppt_content": "슬라이드 1: ...\n슬라이드 2: ...",
  "formative_count": 6,
  "summative_count": 10,
  "video_duration_seconds": 1800
}
```

**타임스탬프 검증 규칙**:
- 형성평가: `|video_timestamp_seconds - question.timestamp_seconds| ≤ 120초`
- 위반 시: `timestamp_valid=false`, `is_correct=false`

### 6-5. 스크립트 에디터 (`/api/videos`)

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| `GET` | `/api/videos/{id}/script` | 소유 교수자 | 슬라이드별 스크립트 타임라인 조회 |
| `PATCH` | `/api/videos/{id}/script` | 소유 교수자 | 스크립트 수정 (텍스트·톤·핀·타임스탬프) |
| `POST` | `/api/videos/{id}/script/reset` | 소유 교수자 | AI 원본 스크립트로 기본값 복원 |
| `POST` | `/api/videos/{id}/approve` | 소유 교수자 | 최종 승인 → `rendering` 상태 전환 |
| `POST` | `/api/videos/{id}/archive` | 소유 교수자 | 영상 보관 처리 |

**Video 상태 전이**:
```
draft → pending_review → rendering → done
                  ↓
               archived  (모든 상태에서 가능)
```

**ScriptSegment 구조**:
```json
{
  "slide_index": 0,
  "text": "발화할 텍스트",
  "start_seconds": 0,
  "end_seconds": 30,
  "tone": "normal",         // normal | emphasis | soft | fast
  "question_pin_seconds": 25  // null = 질문 핀 없음
}
```

---

## 7. 테스트 실행

### 테스트 의존성 설치

```bash
# Docker 외부 (uv 사용)
cd backend
uv pip install -r requirements-test.txt
uv pip install -r requirements.txt

# 또는 pip 사용
pip install -r requirements.txt -r requirements-test.txt
```

### 테스트 실행

```bash
cd backend

# 전체 테스트
pytest

# 커버리지 포함
pytest --cov=app --cov-report=term-missing

# 특정 파일만
pytest tests/test_videos.py -v

# 특정 테스트만
pytest tests/test_auth.py::test_refresh_token_success -v
```

### Docker 컨테이너에서 실행

```bash
docker-compose exec backend pytest
docker-compose exec backend pytest --cov=app --cov-report=term-missing
```

### 테스트 구조

| 파일 | 내용 |
|------|------|
| `conftest.py` | SQLite in-memory DB, FakeRedis, HTTP 클라이언트, 공통 픽스처 |
| `test_health.py` | `/health` 엔드포인트 |
| `test_auth.py` | 토큰 발급·갱신·로그아웃, 인증 오류 |
| `test_courses.py` | 강좌 목록·생성, 권한 검증 |
| `test_lectures.py` | 강의 CRUD, 공개 조회, 접근 제어 |
| `test_questions.py` | 문제 조회, 응답 제출, 채점, Claude mock |
| `test_videos.py` | 스크립트 편집, 승인, 보관, 상태 전이 |

> **참고**: 테스트는 SQLite + FakeRedis를 사용합니다. PostgreSQL 전용 기능(pgvector 검색 등)은 실제 DB가 필요한 별도 통합 테스트가 필요합니다.

---

## 8. 아키텍처 개요

```
┌─────────────────────────────────────────────────┐
│                   Docker Compose                 │
│                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐   │
│  │ frontend │───▶│ backend  │───▶│    db    │   │
│  │ Next.js  │    │ FastAPI  │    │PostgreSQL│   │
│  │ :3000    │    │ :8000    │    │ :5432    │   │
│  └──────────┘    └────┬─────┘    └──────────┘   │
│                       │                         │
│                  ┌────▼─────┐    ┌──────────┐   │
│                  │  redis   │    │ Anthropic│   │
│                  │  :6379   │    │ Claude   │   │
│                  │(RT저장)   │    │ API      │   │
│                  └──────────┘    └──────────┘   │
└─────────────────────────────────────────────────┘
```

**인증 플로우**:
- Access Token: 15분 만료 (JWT, 메모리 보관)
- Refresh Token: 7일 만료 (JWT, Redis `rt:{jti}` 키로 저장)
- Token Rotation: Refresh 시 이전 jti 삭제 → 재사용 방지
- Temp Token: 신규 유저 프로필 완성 전 10분 임시 토큰

**평가 시스템**:
- Claude `claude-opus-4-6` + adaptive thinking으로 PPT → 문제 생성
- `session_id` 시드 기반 결정론적 랜덤화 (같은 세션 = 같은 문제 순서)
- 형성평가 타임스탬프 검증: ±120초 허용 오차

**스크립트 에디터**:
- `ai_segments`(원본) / `segments`(편집본) 분리 보관
- `pending_review` 상태에서만 편집 가능
- 승인 시 `rendering` 전환 → HeyGen 파이프라인 트리거 예정
