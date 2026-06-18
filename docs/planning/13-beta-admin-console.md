# 13 · 베타 운영자(계정주) 콘솔 구현 스펙

> **대상**: Claude Code · **연계 문서**: `docs/planning/09-beta-program.md`
> **목표 배포**: 2026년 8월 (교수진 베타) → 겨울 수정 → 2027년 1~2월 정식 런칭
> **작성 근거**: 현 `main` 브랜치 실코드 점검 결과 (Alembic head `0052`)

이 문서는 베타 운영자(계정주 `classauto101@gmail.com`)가 베타 테스터를 관리·관찰하기 위한
콘솔 기능 A~G의 구현 지시서다. **상당 부분이 이미 구현돼 있으므로**, 아래 "이미 있는 것
(재구현 금지)"를 먼저 읽고 **없는 것만** 만든다.

---

## 0. 절대 불변 규칙 (절대 깨지 말 것)

1. **초대 게이트는 교수자 전용이다.** 교수자 회원가입은 유효한 `ProfessorInvite`
   (이메일 잠금 + 단일 사용 + 만료)를 통과해야만 가능하다.
2. **학생은 초대 게이트와 무관하다.** 학생은 초대받은 교수자가 만든 **강의 링크로 자유
   가입**한다. 아래 G(코호트/동의)·기타 어떤 작업도 **학생 회원가입을 막아선 안 된다.**
3. 운영자 권한 검사는 `app/api/deps.py::require_admin` 이며 **`user.role.value == "admin"`**
   기준이다. `is_admin`/`ADMIN_EMAILS` 만으론 어드민 API에 접근되지 않는다.
   → **사전 확인: 계정주 계정의 `users.role` 이 `admin` 인지 DB에서 확인할 것.**
   (베타 테스터 통계의 "교수자" 모집단은 `role == professor`, `admin`/`student` 제외.)
4. 신규 모델은 SQLAlchemy 메타데이터에 등록돼야 한다. 기존 모델이 어떻게 import 되는지
   (`alembic/env.py`, `app/db/base.py`) 확인 후 **동일 패턴으로 신규 모델 모듈을 import**할 것.
   (`app/models/__init__.py` 는 현재 비어 있음 — 등록은 다른 경로로 이뤄짐.)
5. 마이그레이션은 **수기 작성**이다(autogenerate 아님). 기존 `00XX_*.py` 컨벤션
   (`Revision ID`, `Revises`, 한글 docstring, upgrade/downgrade)을 따른다. 다음 번호는 `0053`.

---

## 1. 이미 있는 것 (재구현 금지)

| 요구 | 상태 | 위치 |
|---|---|---|
| 운영자 권한(서버측 강제) | ✅ 완료 | `app/api/deps.py::require_admin`, `config.ADMIN_EMAILS` |
| 초대 전용 게이트(교수자) | ✅ 완료 | `app/models/invite.py`, `app/services/invite.py`, `app/api/v1/invites.py` (`/api/owner/invites`) |
| HeyGen 비용 계측 | ✅ 완료 | `render_cost_logs` (`service="heygen"`), `app/services/pipeline/cost_log.py` |
| 비용 멱등 기록 | ✅ 완료 | `record_once`, `record_once_committed` + `UNIQUE(video_render_id, operation)` |
| 웹훅 멱등 | ✅ 완료 | `WebhookEventLog` (`uq_webhook_event_logs_provider_external_event`) |
| 전역 예산 서킷브레이커 | ✅ 완료 | `app/services/pipeline/budget.py::assert_heygen_budget` (일/월 USD) |
| 교수자별 월 렌더 한도 | ✅ 완료 | `budget.py` QA 렌더 쿼터, `QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR=8` |
| 운영자 전역 통계/비용 뷰 | ⚠️ 부분 | `app/api/v1/admin.py` `/stats`, `/users`, `/costs`, `/system` |

**핵심 공백 2가지** (B 작업의 근거):
- `/api/v1/admin/costs` 는 **`render_cost_logs` 만 합산**한다. LLM 스크립트/문제/요약(STT 포함)
  비용이 들어가는 **`platform_cost_logs`(`CostLog`)가 집계에서 빠진다** → 베타 지출 수치가 과소.
- 비용·통계가 **교수자(사용자) 단위로 분해되지 않는다** → "테스터별 강의/월지출"이 안 보임.

### 확정된 데이터 모델 사실 (쿼리 작성 기준)
- `courses.instructor_id → users.id` (교수자 소유). `Course.instructor` 관계 존재.
- `lectures.course_id → courses.id`, `lectures.is_published: bool`.
- `video_renders.instructor_id → users.id` **(렌더 비용은 교수자에 1-조인 직결)**,
  `video_renders.lecture_id → lectures.id`, `RenderStatus` (lowercase: pending…ready/failed).
- `render_cost_logs.video_render_id → video_renders.id`, `service`, `operation`, `cost_usd`, `created_at`(index).
- `platform_cost_logs.lecture_id → lectures.id`, `category`(LLM_QA/…/STT/TTS/OTHER), `cost_usd`, `created_at`.
  → 교수자 귀속: `platform_cost_logs → lectures → courses.instructor_id`.
- `learning_sessions.user_id`(학생) + `lecture_id`, `SessionStatus`.

---

## 2. 작업 목록 (A~G 전부 채택)

신규 read 엔드포인트는 기존 `app/api/v1/admin.py` 라우터(`prefix="/api/v1/admin"`,
`Depends(require_admin)`)에 추가한다. 공통 집계 로직은 `app/services/admin_analytics.py`(신규)에 둔다.

### A. 테스터별 사용량 롤업  *(요청 핵심 — read only, 마이그레이션 없음)*

**신규 서비스** `app/services/admin_analytics.py`:
교수자(`role==professor`)별로 다음을 반환하는 async 함수들.
- `courses_count` : `courses WHERE instructor_id`
- `lectures_count`, `published_lectures_count` : `lectures JOIN courses` (`is_published`)
- `renders_count` : `video_renders WHERE instructor_id`
- `spend_this_month_usd`, `spend_total_usd`, `spend_monthly_avg_usd` :
  **두 비용 테이블 통합**(B 로직 재사용)
- `last_active_at` : `MAX(video_renders.created_at[instructor])` 와
  `MAX(lectures.updated_at[via course])` 중 더 늦은 값

통합 비용(교수자별, 기간 옵션) 참고 구현:
```python
from sqlalchemy import func, select, extract
from app.models.video_render import VideoRender, RenderCostLog
from app.models.cost_log import CostLog
from app.models.course import Course
from app.models.lecture import Lecture

async def spend_by_instructor(db, since=None) -> dict[uuid.UUID, float]:
    # 1) 렌더 비용: render_cost_logs → video_renders.instructor_id (직결)
    r = select(VideoRender.instructor_id, func.coalesce(func.sum(RenderCostLog.cost_usd), 0.0)) \
        .join(VideoRender, RenderCostLog.video_render_id == VideoRender.id) \
        .group_by(VideoRender.instructor_id)
    if since is not None:
        r = r.where(RenderCostLog.created_at >= since)
    # 2) 플랫폼 비용: platform_cost_logs → lectures → courses.instructor_id
    p = select(Course.instructor_id, func.coalesce(func.sum(CostLog.cost_usd), 0.0)) \
        .join(Lecture, CostLog.lecture_id == Lecture.id) \
        .join(Course, Lecture.course_id == Course.id) \
        .group_by(Course.instructor_id)
    if since is not None:
        p = p.where(CostLog.created_at >= since)
    out: dict = {}
    for iid, cost in (await db.execute(r)).all():
        out[iid] = out.get(iid, 0.0) + float(cost or 0.0)
    for iid, cost in (await db.execute(p)).all():
        out[iid] = out.get(iid, 0.0) + float(cost or 0.0)
    return out
```
- `spend_monthly_avg_usd` = `spend_total / (지출이 발생한 distinct year-month 수)` (0 가드).
  월별 분해가 필요하면 위 쿼리에 `extract("year"/"month", created_at)`를 group 에 추가.

**신규 엔드포인트** (admin.py):
- `GET /api/v1/admin/beta-overview` → 교수자 배열(위 필드 전부 + `id,email,name,cohort,last_active_at`),
  `?cohort=` 필터, 페이지네이션. 무거우면 `/stats` 처럼 Redis 5분 TTL 캐시 재사용.
- `GET /api/v1/admin/users/{user_id}/usage` → 단일 테스터 드릴다운(강의 목록 + 월별 지출 시계열).

### B. 비용 테이블 통합  *(read only, 마이그레이션 없음)*
- A의 `admin_analytics` 통합 로직을 단일 출처로 삼는다.
- 기존 `GET /api/v1/admin/costs` 수정: `by_service` 에 `platform_cost_logs` 의 카테고리별 합계를
  **추가 병합**하고, `total_cost_usd` 가 두 테이블 합이 되도록 한다. `by_month` 도 두 테이블 합산.
- 응답에 `source` 구분(예: `render` / `platform`)을 남겨 추후 검증 가능하게.
- **성능**: `platform_cost_logs.created_at` 에 인덱스가 없으면 월별 GROUP BY 핫패스용으로
  마이그레이션 `0056` 에서 `ix_platform_cost_logs_created_at` 추가(선택, 행 많아지면 필수).

### C. 아바타 비용 가드레일  *(배포 전 필수)*

#### C-1. 예산 서킷브레이커 값 상향  *(설정 — 확인/완료)*
기존 기본값이 베타에 치명적으로 낮았음(`HEYGEN_DAILY=3 / MONTHLY=15`) → 그대로면 전역 $ 한도에
걸려 **모든 교수자 렌더 차단**(`BudgetExceededError`).
- **확정 사실(2026-06 점검)**: Railway 3개 서비스(backend/celery-worker/celery-beat) 모두
  `HEYGEN_*_BUDGET_USD` **미설정** → `app/core/config.py` 기본값이 그대로 적용된다.
  `HEYGEN_COST_USD_PER_SECOND` 는 세 서비스 모두 **`0.0083`**(실측 ≈ $0.50/분)으로 일치.
- **조치(완료)**: `config.py` 기본값
  `HEYGEN_DAILY_BUDGET_USD = 250.0`, `HEYGEN_MONTHLY_BUDGET_USD = 600.0`.
  단가 0.0083 기준이라 월 600 은 약 1,200분 여유 → 20명 베타에 충분.
- `QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR`(8) 유지.
- **주의**: 이 전역 $ 브레이커는 `service="heygen"` 만 합산 → **VisionStory(본인 얼굴) 비용은
  포함 안 됨.** VisionStory 는 별도 $ 브레이커가 없다. 그 공백은 아래 C-2(재렌더 횟수 상한)가 메운다.

#### C-2. 강의당 아바타 재렌더 상한  *(신규 — 배포 전 필수, 마이그레이션 `0057`)*
**문제**: 월 렌더 쿼터(`QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR`)는 **"배포된 강의 수"** 를 세지
**"재렌더 횟수"** 를 세지 않는다. 같은 강의를 결과가 맘에 안 들어 여러 번 다시 뽑으면 슬롯은 1로
치지만 **비용은 매번 발생**한다. 특히 VisionStory(본인 얼굴, $ 브레이커 없음)는 이 재렌더 폭주를
막을 장치가 전무.

→ **강의 단위로 아바타 렌더 "횟수" 자체에 상한**을 둔다. **HeyGen(퍼블릭)·VisionStory(본인 얼굴)
둘 다 동일 적용.**

**규칙**:
- 설정 `AVATAR_RERENDER_MAX_PER_LECTURE: int = 5` (`config.py`). **첫 제작 1 + 재제작 4 = 총 5회.**
  교수자 안내 문구는 "재제작 4회까지".
- **카운트 단위 = 강의 + 렌더 패스**(개별 클립 아님). 한 번의 "재제작"이 클러스터 3개를 렌더해도 그
  패스는 **1로 센다.** 제공자(heygen/visionstory) 구분 없이 그 강의의 아바타 렌더 패스 총합.
- **성공(과금된) 패스만 카운트.** `status=failed`/`cancelled` 은 제외(기존 쿼터 정책과 동일,
  2026-06-16). 본인 잘못 아닌 실패로 교수자가 막히지 않게.
- **면제**: `QA_AVATAR_UNLIMITED_EMAILS`(계정주·테스트 계정) 재사용 → 무제한.
- **저장/카운트**: 마이그레이션 `0057` 로 `lectures.avatar_render_count INT NOT NULL DEFAULT 0` 추가.
  아바타 렌더 패스가 **성공 완료될 때**(웹훅/폴링 완료 경로)에 +1. (완료 전 다발 제출 in-flight edge 는
  전역 $ 브레이커 + 교수자 월 쿼터로 2차 방어 — 베타 허용.)
- **게이트 지점**: 강의 아바타 렌더 제출 진입부(`budget.assert_qa_render_budget` 호출 자리 인근)에
  `assert_avatar_rerender_quota(db, lecture_id)` 추가. 초과 시 신규 예외
  `AvatarRerenderQuotaError`(`BudgetExceededError` 계열) → API 가 명확한 4xx + 메시지 반환.
- **운영자 오버라이드**: `POST /api/v1/admin/lectures/{lecture_id}/reset-avatar-rerender`
  (`require_admin`) 로 카운터 0 리셋 → 베타에서 계정주가 개별 허용. 이 행위는 **E 감사 로그에 기록**
  (`action="lecture.reset_avatar_rerender"`).

**프론트 2단계 안내**:
- **사전**(아바타/스튜디오 페이지): "본인/표준 아바타 수정은 **강의당 재제작 4회**로 제한됩니다.
  성공한 제작만 카운트되니 신중히 진행해 주세요." + 남은 횟수 표시.
- **상한 도달**(차단): "이 강의의 아바타 제작 횟수를 모두 사용했습니다. 추가 제작이 필요하면 운영자에게
  문의해 주세요."

### D. 활성화 퍼널  *(read only, 마이그레이션 없음)*
**신규 엔드포인트** `GET /api/v1/admin/funnel` — 단계별 카운트(코호트 필터 선택):
1. `invited` : `professor_invites` 수(또는 distinct email)
2. `signed_up` : `professor_invites WHERE used_at IS NOT NULL` (초대→가입 연결)
3. `created_course` : `COUNT(DISTINCT courses.instructor_id)`
4. `published_lecture` : 발행 강의 보유 교수자 수
   `COUNT(DISTINCT courses.instructor_id)` (`JOIN lectures ON is_published = true`)
5. `ran_student_session` : 학생 세션이 한 번이라도 돈 교수자 수
   `learning_sessions → lectures → courses.instructor_id` distinct
- 각 단계 전이율(%)도 함께 반환하면 9월 코호트 이탈 지점 분석에 바로 쓰임.

### E. 운영자 감사 로그  *(신규 모델 + 마이그레이션 `0053`)*
`admin.py` 의 `PATCH /users/{id}`(역할 변경)·`DELETE /users/{id}` 와 초대 생성/삭제는 현재
기록이 없다. god-mode 추적용 불변 로그를 추가한다.

**신규 모델** `app/models/admin_audit_log.py`:
```python
class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"
    id: uuid PK
    actor_id: FK users.id (ondelete=SET NULL, nullable)   # 행위한 운영자
    actor_email: str(255)                                  # 스냅샷(유저 삭제돼도 보존)
    action: str(64)        # "user.update_role" | "user.delete" | "invite.create" | "invite.delete"
    target_type: str(32) | None     # "user" | "invite"
    target_id: str(64) | None        # uuid 또는 email 문자열
    detail: JSONB | None             # 변경 전/후, 바뀐 필드
    created_at: datetime (index, server_default now)
```
- 마이그레이션 `0053_add_admin_audit_logs.py`.
- **훅 지점**: `admin.py::update_user/delete_user`, `services/invite.py::create_invite/delete_invite`
  성공 직후 `AdminAuditLog` 1행 기록(헬퍼 `log_admin_action(db, actor, action, ...)`).
- **신규 엔드포인트** `GET /api/v1/admin/audit` (페이지네이션, action/actor 필터).

### F. 인앱 피드백 수집  *(신규 모델 + 마이그레이션 `0054`)*
9월 배포 목적이 교수 피드백 수집 — 흩어진 이메일 대신 유저·강의에 묶어 콘솔로.

**신규 모델** `app/models/feedback.py`:
```python
class Feedback(Base):
    __tablename__ = "feedbacks"
    id: uuid PK
    user_id: FK users.id (ondelete=SET NULL, nullable)
    user_email: str(255)            # 스냅샷
    role: str(20)                   # "professor" | "student"
    category: str(32)               # "bug" | "idea" | "confusing" | "other"
    message: Text
    lecture_id: FK lectures.id (ondelete=SET NULL, nullable)   # 맥락(선택)
    page: str(255) | None           # 제출 라우트
    status: str(20) = "open"        # "open" | "triaged" | "resolved"
    created_at: datetime (index, server_default now)
```
- 마이그레이션 `0054_add_feedbacks.py`.
- **신규 라우터** `app/api/v1/feedback.py` → `main.py` 에 `include_router` 추가:
  - `POST /api/v1/feedback` : 로그인 유저(교수/학생 모두) 제출. `Depends(get_current_user)`.
  - `GET /api/v1/admin/feedback` : 운영자 목록/필터(`Depends(require_admin)`) — admin.py 에 둬도 됨.
- 프론트: 전역 우하단 작은 "피드백" 버튼(교수/학생 공통). §3 참고.

### G. 코호트 태그 + 베타 모니터링 동의  *(컬럼 추가 + 마이그레이션 `0055`)*
- **마이그레이션 `0055_add_cohort_and_consent.py`**:
  - `users.cohort: str(40) | None` (예: `"2026-08"`, `"2026-09"`)
  - `users.beta_consented_at: datetime | None`
  - `professor_invites.cohort: str(40) | None`
- **코호트 전파**: 운영자가 초대 생성 시 `cohort` 지정(없으면 NULL) →
  `services/invite.py::consume_invite` 에서 **생성된 교수자 `users.cohort` 로 복사**.
  학생은 강의 링크 가입이므로, 학생 `cohort` 는 가입 시 **소속 교수자의 cohort 를 상속**(선택).
- **동의(PIPA)**: 초대 수락(교수자 가입) 화면에 **모니터링 고지 1줄 + 체크박스**를 두고,
  동의 시 `beta_consented_at` 기록. 미동의면 가입 진행 불가(교수자 한정 — 학생 흐름 불변).
  - 고지 문구(초안):
    > 베타 기간 동안 서비스 개선을 위해 생성한 강의·사용량·API 비용 등 이용 데이터가
    > 운영자에게 집계·열람될 수 있습니다. 정식 출시 전까지 적용되는 베타 약관에 동의합니다.

---

## 3. 프론트엔드 (Next.js — 기존 admin 패턴 따를 것)
백엔드가 우선이며, 프론트는 기존 운영자 화면(`/api/v1/admin/stats` 를 호출하는 페이지) 패턴과
ClassAuto 디자인 토큰을 그대로 따른다. 추가할 화면:
- **베타 개요 테이블** (A): 교수자별 강의/렌더/이번달·누적·월평균 지출/마지막활동, cohort 필터. 행 클릭 → 드릴다운(`/users/{id}/usage`).
- **퍼널 위젯** (D): 5단계 바 + 전이율.
- **감사 로그 뷰** (E): 최근 운영자 행위 테이블.
- **피드백 인박스** (F): 목록 + 상태 토글(open/triaged/resolved). + 전역 피드백 버튼(교수/학생 공통).
- **모니터링 동의** (G): 교수자 초대 수락 페이지에 고지/체크박스.

---

## 4. 마이그레이션 순서 (head `0052` 기준)
```
0053  admin_audit_logs            (E)
0054  feedbacks                   (F)
0055  cohort + consent 컬럼        (G)  # users.cohort, users.beta_consented_at, professor_invites.cohort
0056  ix_platform_cost_logs_created_at  (B, 선택/성능)
0057  lectures.avatar_render_count      (C-2)  # INT NOT NULL DEFAULT 0
```
각 파일은 기존 `00XX_*.py` 형식(Revision ID/Revises/한글 docstring/upgrade·downgrade) 준수.
적용: `docker compose exec backend alembic upgrade head`.

---

## 5. 수용 기준 체크리스트
- [ ] 계정주(`role=admin`)로 로그인 시에만 신규 어드민 엔드포인트가 200, 그 외 403.
- [ ] **교수자**는 유효 초대 없이는 가입 불가 / **학생**은 강의 링크로 변함없이 가입 가능(회귀 없음).
- [ ] `/admin/beta-overview` 가 교수자별 강의수 + 이번달·누적·월평균 지출(두 비용 테이블 합산)을 반환.
- [ ] `/admin/costs` 의 `total_cost_usd` = `render_cost_logs + platform_cost_logs` 합.
- [ ] `/admin/funnel` 5단계 카운트·전이율 반환.
- [ ] 역할 변경/유저 삭제/초대 생성·삭제가 `admin_audit_logs` 에 1행씩 남음.
- [ ] 교수·학생이 `POST /api/v1/feedback` 제출 → `/admin/feedback` 에 노출.
- [ ] 신규 교수자 가입 시 `cohort` 설정 + `beta_consented_at` 기록(동의 없이는 가입 불가).
- [ ] HeyGen 예산값이 베타 규모로 상향됨(C-1: config.py 기본 250/600, Railway 미설정 확인).
- [ ] 강의당 아바타 재렌더 6회째(첫 1+재제작 5) 시도 시 `AvatarRerenderQuotaError` 로 차단,
      성공 5회까지만 허용. **실패/취소 렌더는 카운트 안 됨.** HeyGen·VisionStory 동일 동작.
- [ ] 면제 계정(`QA_AVATAR_UNLIMITED_EMAILS`)은 재렌더 무제한.
- [ ] `POST /admin/lectures/{id}/reset-avatar-rerender` 로 카운터 리셋 + 감사 로그 1행.
- [ ] `alembic upgrade head` 무오류, 기존 테스트 스위트 그린.

---

## 6. 범위 외 (이번 작업 아님)
- 사용자 임퍼서네이션("이 유저로 보기") — 겨울 수정 때 검토.
- 결제/구독 로직 변경, 신규 가격 정책.
- 교수자별 **개별 $ 하드캡** — 베타 한정으로 보류. 재렌더 폭주는 C-2(강의당 횟수 상한)가 막고,
  전체 비용은 전역 $ 브레이커(HeyGen) + 교수자 월 쿼터로 충분.
- **VisionStory 전용 $ 서킷브레이커** — 보류. C-2 의 강의당 재렌더 상한 + 교수자 월 쿼터로
  본인 얼굴 비용이 횟수 기준으로 봉인되므로 베타엔 불필요. 정식 런칭 전 사용량 보고 재검토.
