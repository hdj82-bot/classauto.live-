# MERGE_NOTES — R2W2: Backend Asks for W4 Student Flow (#1, #2, #3)

> Branch: `feat/lecture-public-fields` → `main`
> Source asks: [`docs/integration/2026-05-06-w1-to-w4/BACKEND_ASKS.W4.md`](docs/integration/2026-05-06-w1-to-w4/BACKEND_ASKS.W4.md) #1, #2, #3
> 작업자: Claude Opus 4.7 / 河斗振 (하두진)

---

## 1. 무엇을 했는가

W4 (student-flow) 가 머지 후 남긴 nice-to-have 백엔드 요청 4개 중 마이그레이션
없이 기존 컬럼만으로 처리 가능한 #1 / #2 / #3 을 묶어서 처리.

| Ask | 상태 |
|-----|------|
| #1 — `professor_name` (+ `course_name`) on `LecturePublicResponse` | ✅ |
| #2 — `duration_sec` on `LecturePublicResponse`                     | ✅ |
| #3 — pre-OAuth 힌트 (`name`, `locale`) 를 `complete-profile` 가 수용 | ✅ (locale 컬럼 미존재 — 로깅만, TODO 메모) |
| #4 — `POST /api/v1/lectures/{slug}/redeem-code` (학습 코드 4-4)      | ⏳ 본 PR 범위 외 — 별도 PR 권장 |
| #5 — 404 vs 401 시맨틱 sanity                                       | n/a (코드 변경 불필요) |

---

## 2. 변경 파일

| Path | 변경 |
|------|------|
| `backend/app/schemas/lecture.py` | `LecturePublicResponse` 에 `professor_name`, `course_name`, `duration_sec` 추가 (모두 Optional default None, Field description/example 포함) |
| `backend/app/services/lecture.py` | `get_public_lecture_by_slug` 가 `selectinload(Lecture.course → Course.instructor)` 로 한 트립에 fetch + `_resolve_lecture_duration_seconds` 헬퍼 추가 |
| `backend/app/schemas/auth.py` | `CompleteProfileRequest` 에 `name`, `locale` (Literal["ko","en"]) 추가 + 빈 문자열 → None 정규화 validator |
| `backend/app/api/v1/auth.py` | `complete_profile` 가 `body.name` 을 Google name 보다 우선 사용; `body.locale` 은 logger 로 기록 (컬럼 추가 시 자동 채울 수 있도록 TODO) |
| `backend/tests/test_lectures.py` | 공개 응답 새 필드 6 케이스 추가 |
| `backend/tests/test_auth_complete_profile.py` | (신규) complete-profile 12 케이스 — name override / locale 검증 / 회귀 보호 |
| `MERGE_NOTES.R2W2.md` | (이 파일) |

DEPS_TO_ADD.R2W2.md 는 **작성하지 않음** — 새 의존성 없음 (selectinload, pydantic Literal 등은 이미 사용 중).

---

## 3. /api/lectures/{slug}/public 응답 스키마

```jsonc
{
  // ── 기존 (그대로) ───────────────────────────────────────────────
  "id": "uuid",
  "course_id": "uuid",
  "title": "string",
  "description": "string | null",
  "thumbnail_url": "string | null",
  "slug": "string",
  "is_expired": false,
  "video_url": "string | null",

  // ── R2W2 추가 (모두 Optional, 키는 항상 존재) ──────────────────
  "professor_name": "string | null",   // 강좌 소유 교수자의 user.name
  "course_name":    "string | null",   // course.title
  "duration_sec":   123                // 최신 Video.duration_seconds | null
}
```

데이터 채움 규칙:
- `professor_name` = `lecture.course.instructor.name` (chain 어느 한 단이라도 NULL → `null`)
- `course_name` = `lecture.course.title`
- `duration_sec` = `Video.duration_seconds` 가 NULL 이 아닌 row 중 `created_at` 가장 큰 것의 값
  - Lecture 에 Video 가 없거나 모두 길이 메타가 비어있으면 `null`
  - frontend 의 `LectureMeta` 가 `typeof durationSec === "number" && durationSec > 0` 가드로 자연스럽게 숨김 처리

backward compatibility:
- 키 추가만 — 기존 W4 frontend (`StudentEntryContent.tsx`) 의 `PublicLecture` interface 가 추가 키를 모르더라도 axios 가 그대로 객체에 담아 넘기므로 런타임 에러 없음. TS 측에서는 새 키를 직접 read 하기 전까지 surface 되지 않음.
- frontend 가 `professorName` / `courseName` / `durationSec` 를 채우려면 별도 PR 에서 `PublicLecture` interface 와 `meta` useMemo 매핑을 갱신해야 한다 (backend 응답 형식만으로는 frontend 가 자동 사용하지 않음 — BACKEND_ASKS.W4 의 표현은 약간 낙관적이었음).

---

## 4. POST /api/auth/complete-profile 동작

### 새 입력 필드

```jsonc
{
  "temp_token": "...",
  "name":           "한국어 이름",       // optional, max 100, 공백 허용 X (정규화)
  "locale":         "ko",                // optional, Literal["ko", "en"]
  "school":         "...",               // 기존: 교수자 필수
  "department":     "...",               // 기존: 교수자 필수
  "student_number": "20240001"           // 기존: 학습자 필수
}
```

### 동작

1. **`name` 우선 적용**: 비어있지 않으면 (whitespace-only 도 None 으로 정규화) Google 의 `name` claim 을 덮어써 `User.name` 으로 저장. 미전송/공백이면 Google 의 name 그대로.
2. **`locale` 수용**: 현재 `User` 모델에 `locale` 컬럼이 없어 즉시 적용 불가 — `logger.info` 로 남기고 무시. 마이그레이션 추가 시 (별도 PR) `create_user_from_google` 인자에 추가하면 끝.
3. **기존 동작 100% 보존**:
   - 교수자 → `school`/`department` 필수 (없으면 422)
   - 학습자 → `student_number` 필수 (없으면 422)
   - 위조/만료 `temp_token` → 401
   - `student_number` 만 보내는 기존 호출자 (W4 의 sessionStorage 미사용 클라이언트) → 변경 없음

### Validation

- `name`: `max_length=100`, 공백 trim → 빈 문자열은 None
- `locale`: `Literal["ko", "en"]` — 그 외는 422 (pydantic 기본 에러)
- `school` / `department` / `student_number`: `max_length` 추가 (200 / 200 / 50 — User 모델의 컬럼 size 와 일치)

---

## 5. 절대 건드리지 않은 영역

| 경로 | 사유 |
|------|------|
| `frontend/` 전체 | 응답 추가는 backward-compatible — 별도 PR 에서 `PublicLecture` interface 와 `meta` mapping 갱신 |
| `backend/alembic/versions/` | 마이그레이션 추가 금지 — 모든 변경이 기존 컬럼만 사용 |
| `backend/app/main.py` | 라우터 등록 변경 없음 — 기존 `lectures.py`, `auth.py` 모듈 내 변경만 |
| `backend/pyproject.toml` / `requirements*.txt` | 새 의존성 없음 |
| `backend/app/services/pipeline/heygen*.py`, `polling.py` | W1 영역 — 영향 없음 |
| `backend/app/services/pipeline/tts*.py` | W2 영역 — 영향 없음 |
| `backend/app/api/v1/*.py` (lectures.py / auth.py 외) | 본 PR 범위 외 |

---

## 6. 후속 작업

### 6-1. Frontend 적용 (별도 PR — 본 PR 의 응답 변경에 의존)

- `frontend/src/app/v/[slug]/StudentEntryContent.tsx`
  - `interface PublicLecture` 에 `professor_name?: string | null` / `course_name?: string | null` / `duration_sec?: number | null` 추가
  - `meta` useMemo 에서 `null` 하드코딩 대신 응답 값 매핑
- 그 후 `LectureMeta` 가 `student.entry.fromProfessor` i18n 키를 자연스럽게 활용

### 6-2. `users.locale` 컬럼 (별도 PR — 마이그레이션)

- `alembic` revision 추가: `ALTER TABLE users ADD COLUMN locale VARCHAR(10)`
- `User.locale: Mapped[str | None]` 추가
- `create_user_from_google(..., locale=None)` 추가 + `complete_profile` 에서 `body.locale` 전달
- 본 PR 의 `logger.info("complete_profile locale hint accepted ...")` 가 자동으로 회계 자료가 됨

### 6-3. BACKEND_ASKS.W4 #4 — 학습 코드 redeem (별도 PR)

- `POST /api/v1/lectures/{slug}/redeem-code` 신규 엔드포인트
- 4-4 자리 코드를 받아 단기 게스트 토큰 발급
- 본 PR 범위 외 (스키마/redis/토큰 정책 결정 필요)

---

## 7. 검증 (CI 에서 실행 권장)

```bash
cd backend
ruff check app/schemas/lecture.py app/schemas/auth.py \
           app/services/lecture.py app/api/v1/auth.py \
           tests/test_lectures.py tests/test_auth_complete_profile.py

pytest tests/test_lectures.py::test_public_lecture \
       tests/test_lectures.py::test_public_lecture_exposes_professor_and_course_names \
       tests/test_lectures.py::test_public_lecture_duration_sec_is_none_when_no_video \
       tests/test_lectures.py::test_public_lecture_duration_sec_picks_video_duration \
       tests/test_lectures.py::test_public_lecture_duration_sec_picks_latest_video \
       tests/test_lectures.py::test_public_lecture_skips_video_without_duration \
       tests/test_lectures.py::test_public_lecture_response_keys_are_backward_compatible \
       tests/test_auth_complete_profile.py \
       -v

# 회귀: 기존 lectures / auth 통합 테스트
pytest tests/test_lectures.py tests/test_auth.py -v
```

본 워크트리의 호스트는 Python 인터프리터가 설치되어 있지 않아 자동 실행은
머지 후 GitHub Actions / `pytest-coverage` 60% 게이트로 검증한다.
