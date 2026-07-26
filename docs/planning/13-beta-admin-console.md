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

### C. 비용 가드레일  *(배포 전 필수)*

#### C-0. 브레이커 커버리지 — 어디에 상한이 있고 어디가 비어 있나  *(2026-07-26 신설)*

**이 표가 없어서 HeyGen 단가만 몇 시간 다듬었다.** 정작 실제 지출의 주축에는 상한이 없다.

| 비용 항목 | 쌓이는 곳 | $ 상한 | 다른 상한 |
|---|---|---|---|
| **TTS 본문**(ElevenLabs) | `render_cost_logs` `service='elevenlabs'` | ❌ **없음** | ❌ 없음 |
| **TTS 폴백**(Google) | `render_cost_logs` `service='google_tts'` | ❌ **없음** | ❌ 없음 |
| 본문 렌더(HeyGen) | `render_cost_logs` `service='heygen'` | ✅ `assert_heygen_budget` | — |
| Q&A 아바타(HeyGen) | `platform_cost_logs` `AVATAR_QA/heygen` | ✅ `assert_heygen_budget` | 월 렌더 쿼터·재렌더 상한 |
| Q&A 아바타(VisionStory) | `platform_cost_logs` `AVATAR_QA/visionstory` | ✅ `assert_visionstory_budget` | 재렌더 상한 |
| LLM(Claude 스크립트·문제·요약) | `platform_cost_logs` `LLM_*` | ❌ **없음** | 월 쿼터 일부 |
| 임베딩(OpenAI) | (미기록) | ❌ **없음** | — |
| S3 | `render_cost_logs` `service='s3'` | — | 비용 0 기록 |

> ⚠️ **본문 렌더는 HeyGen 을 쓰지 않는다.** `LECTURE_BODY_PROVIDER` 기본값이 `"slideshow"`
> 라 `tasks/render.py` 가 슬라이드 이미지 + TTS 음성까지만 만들고 조기 반환한다. 그래서
> **HeyGen 브레이커가 지키는 건 Q&A 아바타뿐**이고, **실제 지출의 주축인 TTS 는 무방비**다.
>
> 규모 감: 교수 20명 × 강의 12편 × 슬라이드 20장 × 발화 300자 ≈ 144만 자.
> ElevenLabs 단가 `$0.30/1k chars` 로 **≈ $432/월** — HeyGen 월 예산 $600 에 맞먹는데
> 재시도 루프나 대량 재생성 사고를 막을 장치가 하나도 없다.

**TTS 단가는 코드 상수다** — `services/cost_tracker.py` 의
`ELEVENLABS_USD_PER_1K_CHARS = 0.30` / `GOOGLE_TTS_USD_PER_1K_CHARS = 0.016`.
`settings` 가 아니라 env 로 조정할 수 없고, 둘의 단가 차이가 **약 19배**다(폴백이 훨씬 싸다).

**`CostCategory.tts` 는 enum 에만 있고 한 번도 기록되지 않는다.** platform_cost_logs 에
TTS 가 쌓인다고 착각하기 쉬운 함정이라 여기 적어 둔다 — TTS 는 전부 `render_cost_logs` 다.

→ **조치: §C-3 TTS 브레이커 신설**(8월 베타 전 필수).

현재 상태는 `python -m scripts.cost_audit` 이 "실제 지출 vs 브레이커 대상"으로 나눠 보여준다.

---

### C-1~C-2. 아바타 비용 가드레일  *(배포 전 필수)*

#### C-1. 예산 서킷브레이커 값 상향  *(설정 — 확인/완료)*
기존 기본값이 베타에 치명적으로 낮았음(`HEYGEN_DAILY=3 / MONTHLY=15`) → 그대로면 전역 $ 한도에
걸려 **모든 교수자 렌더 차단**(`BudgetExceededError`).
- **확정 사실(2026-06 점검)**: Railway 3개 서비스(backend/celery-worker/celery-beat) 모두
  `HEYGEN_*_BUDGET_USD` **미설정** → `app/core/config.py` 기본값이 그대로 적용된다.
  `HEYGEN_COST_USD_PER_SECOND` 는 세 서비스 모두 **`0.0083`**(실측 ≈ $0.50/분)으로 일치.

> **2026-07-26 재확인 — 단가 현황과 미확정 사항**
>
> | 값 | 출처 | 현재 |
> |---|---|---|
> | `HEYGEN_COST_USD_PER_SECOND` | Railway env (web·worker·beat **3개 모두**) | **0.0083** |
> | 〃 | `config.py` 기본값 | 0.0167 |
> | `VISIONSTORY_COST_USD_PER_SECOND` | env **없음** → 코드값 | 0.0334 |
> | 비율 (VS / HeyGen) | 실제 적용값 기준 | **4.02** (기대 2.0) |
>
> - **서비스 간 드리프트는 없다.** 세 서비스에 일관 적용됐다는 건 의도한 값이라는 뜻이고,
>   위 2026-06 기록도 이 값을 "실측 ≈ $0.50/분"으로 남겼다. `config.py` 의 0.0167 은
>   주석 근거뿐이라 **0.0083 이 진짜일 가능성이 높다.**
> - **그렇다면 틀린 쪽은 VisionStory 다.** 0.0083 이 맞다면 "HeyGen 의 정확히 2배"
>   (2026-06-19 확인)에 따라 `0.0166` 이어야 하는데 `0.0334` 다 — 코드 작성자가 HeyGen 을
>   0.0167 로 잡고 2를 곱한 결과로 보인다. 다만 **브레이커가 일찍 터지는 방향**이라 급하지 않다.
> - **청구서 확인 전까지 값은 아무것도 바꾸지 않는다.** `config.py` 도 Railway env 도 그대로
>   둔다. HeyGen 대시보드로 실측 단가를 확정한 뒤(§C-1b), **코드 기본값을 실측에 맞추고
>   env 를 제거해 `ratio=2.0` 으로 정렬**한다.
> - 그때까지 §C-1a 의 인원 산정은 보수적인 0.0167 기준을 유지한다.
- **조치(완료)**: `config.py` 기본값
  `HEYGEN_DAILY_BUDGET_USD = 250.0`, `HEYGEN_MONTHLY_BUDGET_USD = 600.0`.
  단가 0.0083 기준이라 월 600 은 약 1,200분 여유 → 20명 베타에 충분.
- `QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR`(8) 유지.
- **주의**: 이 전역 $ 브레이커는 `service="heygen"` 만 합산 → **VisionStory(본인 얼굴) 비용은
  포함 안 됨.** VisionStory 는 별도 $ 브레이커가 없다. 그 공백은 아래 C-2(재렌더 횟수 상한)가 메운다.

#### C-1a. 베타 인원 확대 시 절차  *(2026-07-26 추가)*

**이 브레이커는 전역이다. 한 명이 한도를 채우면 그 순간 나머지 전원의 아바타 제작이 동시에
멈춘다**(`BudgetExceededError`). 초대를 20명 이상으로 늘리려면 **초대를 발급하기 전에**
예산을 먼저 올려야 한다. 순서가 바뀌면 새로 들어온 교수자가 첫 강의를 만들다 전체를 세운다.

##### ⚠️ 단가 드리프트 — 산정 기준은 `0.0167` 로 통일한다

| 위치 | `HEYGEN_COST_USD_PER_SECOND` | 분당 |
|---|---|---|
| `config.py` 기본값 | **0.0167** | $1.00 |
| 위 C-1 의 2026-06 점검 기록(Railway 3개 서비스 env) | 0.0083 | $0.50 |

**2배 차이이며 아직 확정되지 않았다**(청구서 대조 대기 — 아래 §C-1b). 그때까지
**모든 산정은 보수적인 `0.0167` 기준**으로 한다.

> **왜 높은 쪽인가**: 브레이커가 **일찍 터지면 불편이고 늦게 터지면 사고**다.
> 실제가 0.0083 인데 0.0167 로 잡아 두면 월 $600 한도가 실질 $1,200 어치를 커버해
> 손해가 없다. 반대로 실제가 0.0167 인데 0.0083 으로 잡으면 $600 한도가 **$1,200 을
> 쓴 뒤에야** 터진다.

**시간순으로도 0.0167 이 더 최신 판단이다.** 위 C-1 의 Railway 점검은 2026-06 이고,
`config.py` 의 VisionStory 단가 주석("HeyGen 0.0167 의 정확히 2배 — 2026-06-19 사용자
확인")은 그 뒤다.

##### 조정 원칙 — 무엇을 env 로 바꾸고 무엇을 코드로 바꾸나

| 대상 | 어디서 바꾸나 | 이유 |
|---|---|---|
| **예산 금액** (`*_BUDGET_USD`) | **Railway env** | 인원이 늘 때마다 조정한다. 코드 재배포 없이 올려야 한다. |
| **단가** (`*_COST_USD_PER_SECOND`) | **`config.py` 기본값** | 공급자 가격이 바뀔 때만 움직이는 사실값이다. **개별 env override 금지.** |

- **단가 두 값은 반드시 함께 조정한다.** `VISIONSTORY_COST_USD_PER_SECOND` 는
  `HEYGEN_COST_USD_PER_SECOND` 의 2배로 유도된 값이라, 하나만 바꾸면 전제가 깨진다.
- **단가를 env 로 덮지 않는다.** 덮으면 코드값과 갈리는데, 그 상태가 로그 이전에는
  드러나지 않았다(실제로 갈려 있었고 아무도 몰랐다). 값이 바뀌면 코드를 고쳐 배포한다.
- 예산 금액은 반대다 — 인원 확대마다 조정하므로 env 가 맞다(§C-1a 적용 절차).

##### ⚠️ 두 단가는 결합돼 있다 — 하나만 env override 금지

`VISIONSTORY_COST_USD_PER_SECOND`(0.0334)는 `HEYGEN_COST_USD_PER_SECOND`(0.0167)의
**정확히 2배로 유도된 값**이다(config.py 주석). 그래서 **한쪽만** env 로 덮으면 이 전제가
조용히 깨진다 — HeyGen 만 0.0083 으로 낮추면 비율이 2 가 아니라 **4.02** 가 된다.

- **조정은 반드시 두 값을 함께 한다.** 한쪽만 바꾸지 않는다.
- 비율이 2.0 에서 벗어나면 **부팅 로그 경고**와 **콘솔 개요 예산 미터의 경고**가 뜬다
  (`app/core/cost_rates.py`, 스펙 14 §E). 그 경고가 보이면 env 를 먼저 정리한다.
- 지금 어느 단가로 돌고 있는지는 **부팅 로그 1행**(`[COST] 유효 단가 …`)과
  `GET /api/v1/admin/budget` 의 `unit_costs` 로 확인한다.
  **web·celery-worker·celery-beat 세 서비스가 각자 부팅 시 1행씩 남긴다**
  (`main.py` lifespan · `celery_app.py` 의 `worker_ready`/`beat_init` 시그널) —
  비용을 실제로 계산하는 건 worker 이므로 거기 로그가 특히 중요하고, 서비스 간
  드리프트도 Variables 탭을 뒤질 필요 없이 로그만으로 드러난다.

##### 권장 월 예산 계산식

```
월 예산(USD) ≥ N × L × S × C × R × K

  N = 교수자 수
  L = 교수자당 월 강의 수            (베타 관측 기본값 4)
  S = 강의당 아바타 초             (Q&A 클립 ≤3개 × 약 20초 ≈ 60)
  C = HEYGEN_COST_USD_PER_SECOND   (Railway 실측값을 넣을 것)
  R = 재제작 계수                   (AVATAR_RERENDER_MAX_PER_LECTURE=3 → 최악 3, 실무 1.5)
  K = 안전계수                      (1.3)
```

`L=4, S=60, R=1.5, K=1.3` 을 대입하면 **1인당 월 ≈ 468 × C**.

**기준 (C = 0.0167)** — 인원 확대는 이 표로 판단한다.

| 인원 | 20명 | 40명 | 60명 | 76명 |
|---|---|---|---|---|
| 월 예산 | ≈ $156 | ≈ $313 | ≈ $469 | ≈ $594 |

현재 기본값 **월 $600** 은 이 기준으로 약 **76명**까지 감당한다.

<details>
<summary>참고: C = 0.0083 이었을 경우 (청구서로 확정되기 전까지는 쓰지 말 것)</summary>

| 인원 | 20명 | 40명 | 60명 |
|---|---|---|---|
| 월 예산 | ≈ $78 | ≈ $155 | ≈ $233 |

이 값으로 예산을 잡았다가 실제 단가가 0.0167 이면 한도가 **두 배 늦게** 터진다.
</details>

**가정보다 실측이 우선이다.** 콘솔 개요의 예산 미터가 보여주는 `1인당 소진`이 계산식보다
크면 그 값으로 다시 계산하라(§E 개요 카드가 `headroom_professors` 로 이미 "이 소진율이면
N명 더 감당"을 계산해 준다).

일 한도는 월 한도의 **1/3~1/2** 로 둔다. 학기 초처럼 다수가 같은 주에 몰려 제작해도 하루에
월예산을 태우지 않게 하는 완충이며, 너무 낮으면 정상 사용도 막는다.

##### 적용 절차

1. **콘솔 개요의 예산 미터**에서 현재 소진율과 `1인당 소진`을 확인한다.
2. 위 식(또는 실측 1인당 소진)으로 목표 인원의 월 예산을 계산한다.
3. **Railway 3개 서비스 전부**(`backend` / `celery-worker` / `celery-beat`)에
   `HEYGEN_DAILY_BUDGET_USD` · `HEYGEN_MONTHLY_BUDGET_USD` 를 올린다.
   → **한 서비스만 올리면 안 된다.** 브레이커는 렌더를 실행하는 워커에서도 검사하므로
   빠뜨린 서비스가 병목이 된다.
4. VisionStory(본인 얼굴)를 쓰면 `VISIONSTORY_*_BUDGET_USD` 도 같은 비율로 올린다.
   **HeyGen 만 올리면 본인 얼굴 렌더가 먼저 막힌다.**
5. 배포 후 콘솔 개요에서 새 한도가 반영됐는지 확인한다.
6. **그 다음에** 초대를 발급한다.

##### 실질 하드캡

이 브레이커는 2차 방어선일 뿐이다. 진짜 상한은 **HeyGen 계정 잔액(auto-refill OFF)** 이다.
브레이커를 올려도 잔액이 없으면 렌더가 실패하므로, 인원 확대 시 잔액도 함께 확인한다.

#### C-1b. 단가 확정 — 추정치를 다른 추정치로 바꾸지 않는다  *(2026-07-26 추가)*

`0.0083` 이냐 `0.0167` 이냐는 **공급자 대시보드로 확정한다.** 그때까지는 §C-1a 대로
보수적인 0.0167 로 통일한다.

##### 확정 방법 — 우리 DB 로 역산하지 않는다

우리 DB 의 `cost_usd` 는 `duration × 설정단가` 로 저장된 값이라, 그걸로 단가를 역산하면
**설정단가가 그대로 돌아오는 순환**이다. 그래서 분자·분모를 **둘 다 공급자 쪽에서** 가져온다.

```
진짜 단가 = (HeyGen 이 집계한 청구액) ÷ (HeyGen 이 집계한 총 영상 초 수)
```

VisionStory 도 동일하게 크레딧 명세에서 (청구 크레딧 → USD) ÷ (총 초 수) 로 구한다.

##### 우리 `cost_audit` 은 **계측 검증용**이다 (확정용이 아니다)

```
docker compose exec backend python -m scripts.cost_audit --months 6
```

단가를 정한 **뒤에** 돌려서, 우리가 재는 값이 공급자와 맞는지 본다.

> **HeyGen 총 초 수 ↔ 우리 `SUM(duration_seconds)` 가 크게 다르면, 그것 자체가 별도 버그다.**
> 단가 문제가 아니라 **계측 누락·중복 적재** 신호다. 그때 볼 곳:
> - 실패·취소 렌더의 duration 이 잘못 적재되고 있지 않은가
> - 재시도가 같은 렌더를 두 번 기록하고 있지 않은가
> - 아래 커버리지 한계(Q&A 렌더 duration 미기록) 때문에 생긴 정상 차이인가

출력의 "추정단가" 컬럼은 그래서 **설정단가 검산용**이다 — 그 달에 단가가 일관 적용됐는지
(중간에 바뀌었으면 혼합값이 나온다)만 본다.

⚠️ **커버리지 한계 — DB 합계는 청구서와 1:1 이 아니다.**

| 테이블 | 대상 | duration | 단가 역산 |
|---|---|---|---|
| `render_cost_logs` | 본문 렌더(HeyGen) | 실측 O | **가능** |
| `platform_cost_logs` (`AVATAR_QA`) | Q&A 렌더(HeyGen · VisionStory) | **미기록** | 불가 |

HeyGen 청구액에는 Q&A 렌더분도 포함되는데 그쪽 duration 을 모르므로, 청구액을 본문
duration 으로 그냥 나누면 **과대 추정**된다. 스크립트가 출력하는 `Q&A $` 를 청구액에서
먼저 빼라.

**VisionStory 는 단가 역산이 아예 불가능하다.** 비용이 전부 `platform_cost_logs` 에만
쌓이고 duration 컬럼이 없으며, 게다가 VisionStory 상태 응답은 duration 을 주지 않아
**답변 길이로 추정한 값**으로 비용을 기록한다(`qa_batch._estimate_qa_render_seconds`).
크레딧 명세로 직접 확인해야 한다.

> 후속 과제: Q&A 렌더도 duration 을 적재하면(`platform_cost_logs` 에 컬럼 추가 또는
> `memo` 에 기록) **계측 검증의 사각지대가 사라진다.** 지금은 우리 `SUM(duration_seconds)`
> 에 Q&A 분이 빠져 있어, 공급자 총 초 수와 비교할 때 "정상 차이"와 "계측 버그"를 구분하기
> 어렵다. 지금 스키마로는 여기까지가 한계다.

#### C-2. 강의당 아바타 재렌더 상한  *(신규 — 배포 전 필수, 마이그레이션 `0057`)*
**문제**: 월 렌더 쿼터(`QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR`)는 **"배포된 강의 수"** 를 세지
**"재렌더 횟수"** 를 세지 않는다. 같은 강의를 결과가 맘에 안 들어 여러 번 다시 뽑으면 슬롯은 1로
치지만 **비용은 매번 발생**한다. 특히 VisionStory(본인 얼굴, $ 브레이커 없음)는 이 재렌더 폭주를
막을 장치가 전무.

→ **강의 단위로 아바타 렌더 "횟수" 자체에 상한**을 둔다. **HeyGen(퍼블릭)·VisionStory(본인 얼굴)
둘 다 동일 적용.**

**규칙**:
- 설정 `AVATAR_RERENDER_MAX_PER_LECTURE: int = 3` (`config.py`). **첫 제작 1 + 재제작 2 = 총 3회.**
  교수자 안내 문구는 "재제작 2회까지". (2026-06-19: 5→3 하향 — VisionStory 본인얼굴 이론상 천장 축소.)
- **카운트 단위 = 강의 + 렌더 패스**(개별 클립 아님). 한 번의 "재제작"이 클러스터 3개를 렌더해도 그
  패스는 **1로 센다.** 제공자(heygen/visionstory) 구분 없이 그 강의의 아바타 렌더 패스 총합.
- **성공(과금된) 패스만 카운트.** `status=failed`/`cancelled` 은 제외(기존 쿼터 정책과 동일,
  2026-06-16). 본인 잘못 아닌 실패로 교수자가 막히지 않게.
- **면제**: `QA_AVATAR_UNLIMITED_EMAILS`(계정주·테스트 계정) 재사용 → 무제한.
- **저장/카운트**: 마이그레이션 `0057` 로 `lectures.avatar_render_count INT NOT NULL DEFAULT 0` 추가.
  렌더 **제출 직전에 원자적으로 슬롯을 선점**(`budget.claim_avatar_render_slot` — 조건부 UPDATE
  `avatar_render_count < cap` 로 검사+증가를 한 번에)하고, 그 패스가 **0건 제출로 끝나면 되돌린다**
  (`release_avatar_render_slot`). 이로써 동시 요청(더블클릭·중복 태스크)이 같은 count 를 읽고 둘 다
  통과해 상한을 1 초과하던 TOCTOU 경쟁을 제거한다(2026-06-26). 선점이 제출 전에 일어나므로
  완료 전 다발 제출 in-flight 도 즉시 한도에 반영된다.
- **게이트 지점**: 강의 아바타 렌더 제출 진입부(`budget.assert_qa_render_budget` 호출 자리 인근)에
  `assert_avatar_rerender_quota(db, lecture_id)` 추가. 초과 시 신규 예외
  `AvatarRerenderQuotaError`(`BudgetExceededError` 계열) → API 가 명확한 4xx + 메시지 반환.
- **운영자 오버라이드**: `POST /api/v1/admin/lectures/{lecture_id}/reset-avatar-rerender`
  (`require_admin`) 로 카운터 0 리셋 → 베타에서 계정주가 개별 허용. 이 행위는 **E 감사 로그에 기록**
  (`action="lecture.reset_avatar_rerender"`).

**프론트 2단계 안내**:
- **사전**(아바타/스튜디오 페이지): "본인/표준 아바타 수정은 **강의당 재제작 2회**로 제한됩니다.
  성공한 제작만 카운트되니 신중히 진행해 주세요." + 남은 횟수 표시.
- **상한 도달**(차단): "이 강의의 아바타 제작 횟수를 모두 사용했습니다. 추가 제작이 필요하면 운영자에게
  문의해 주세요."

#### C-3. TTS 예산 브레이커  *(신설 예정 — 8월 베타 전 필수)*

§C-0 이 드러낸 공백. **실제 지출의 주축인 TTS 에 $ 상한이 없다.**

`assert_tts_budget` 을 기존 두 $ 브레이커와 **같은 패턴**으로 만든다.
- 일/월 한도(`TTS_DAILY_BUDGET_USD` / `TTS_MONTHLY_BUDGET_USD`), 0 이면 비활성
- 합산 = 완료분(`render_cost_logs` `service IN ('elevenlabs','google_tts')`) + in-flight 추정
- 검사 지점: TTS 합성 직전(`tasks/render.py` 의 `record_tts_cost` 호출 앞)
- mock 모드는 건너뛴다

**기본값은 실측을 보고 정한다.** `scripts/cost_audit` 의 최근 3개월 TTS 지출을 확인한 뒤
§C-1a 계산식과 같은 방식(1인당 실측 × 목표 인원 × 안전계수)으로 잡는다. 착수 순서상
스펙 14 §C(이슈 인박스) 다음이다.

> 폴백 단가가 19배 싸다는 점(ElevenLabs $0.30 vs Google $0.016 / 1k chars)을 이용해,
> 한도에 근접하면 **차단 대신 Google TTS 로 강제 폴백**하는 선택지도 있다. 브레이커가
> 터져 전원이 멈추는 것보다 품질을 낮춰 계속 돌리는 편이 수업 운영에는 낫다 — 다만
> 교수자에게 그 사실을 알려야 하므로 별도 판단이 필요하다.

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

> 갱신 2026-06-18: 백엔드 #513, C-2 #514, 동의 #515, 운영자 콘솔 프론트 #518 머지로 전 항목
> 구현 완료. (C-2 상한값은 config 기본 5 = 첫 제작 1 + 재제작 4 — 아래 6회째 표기는 5회 허용
> /6회째 차단의 의미.)
> 갱신 2026-06-19: C-2 상한 **5 → 3 하향**(첫 제작 1 + 재제작 2). 20명 베타 규모에서 VisionStory
> 본인얼굴 렌더의 이론상 천장 축소(전역 $ 브레이커 도입 전 노출 완화). 아래 체크리스트의 "5회"
> 표기는 이제 "3회"로 읽는다.

- [x] 계정주(`role=admin`)로 로그인 시에만 신규 어드민 엔드포인트가 200, 그 외 403.
- [x] **교수자**는 유효 초대 없이는 가입 불가 / **학생**은 강의 링크로 변함없이 가입 가능(회귀 없음).
- [x] `/admin/beta-overview` 가 교수자별 강의수 + 이번달·누적·월평균 지출(두 비용 테이블 합산)을 반환.
- [x] `/admin/costs` 의 `total_cost_usd` = `render_cost_logs + platform_cost_logs` 합.
      *(주의: QA 아바타 렌더 비용은 아직 어느 테이블에도 기록되지 않아 누락 — DEPLOYMENT_PROGRESS
      2026-06-18 "알려진 갭" 참조. 두 테이블 합산 로직 자체는 구현됨.)*
- [x] `/admin/funnel` 5단계 카운트·전이율 반환.
- [x] 역할 변경/유저 삭제/초대 생성·삭제가 `admin_audit_logs` 에 1행씩 남음.
- [x] 교수·학생이 `POST /api/v1/feedback` 제출 → `/admin/feedback` 에 노출.
- [x] 신규 교수자 가입 시 `cohort` 설정 + `beta_consented_at` 기록(동의 없이는 가입 불가 — 프론트 #515).
- [x] HeyGen 예산값이 베타 규모로 상향됨(C-1: config.py 기본 250/600, Railway 미설정 확인).
- [x] 강의당 아바타 재렌더 상한(첫 제작 1 + 재제작 2 = 3회, 2026-06-19 하향) 초과 시 `AvatarRerenderQuotaError`/429 로
      차단. **실패/취소(제출 실패) 패스는 카운트 안 됨.** HeyGen·VisionStory 동일(둘 다 _submit_cluster 경유).
      해석: '성공 완료 시 +1' 을 '성공 제출 시 +1' 로 구현(패스에 단일 완료 이벤트 없음).
- [x] 면제 계정(`QA_AVATAR_UNLIMITED_EMAILS`)은 재렌더 무제한.
- [x] `POST /admin/lectures/{id}/reset-avatar-rerender` 로 카운터 리셋 + 감사 로그 1행.
- [x] `alembic upgrade head` 무오류, 기존 테스트 스위트 그린(CI).

---

## 6. 범위 외 (이번 작업 아님)
- 사용자 임퍼서네이션("이 유저로 보기") — 겨울 수정 때 검토.
- 결제/구독 로직 변경, 신규 가격 정책.
- 교수자별 **개별 $ 하드캡** — 베타 한정으로 보류. 재렌더 폭주는 C-2(강의당 횟수 상한)가 막고,
  전체 비용은 전역 $ 브레이커(HeyGen) + 교수자 월 쿼터로 충분.
- ~~**VisionStory 전용 $ 서킷브레이커** — 보류.~~ **구현됨**(`budget.assert_visionstory_budget`,
  일 $200 / 월 $1500, `platform_cost_logs` category=AVATAR_QA·model=visionstory 합산). C-2(강의당
  재렌더 상한)가 1차, 이 $ 브레이커가 2차 방어선. 2026-06-26: 두 $ 브레이커(HeyGen·VisionStory)가
  **완료분 + in-flight 추정**(`budget.inflight_*_spend_usd`, `INFLIGHT_RENDER_ESTIMATE_SECONDS`)을
  합산하도록 보강 — 완료 전 다발 제출(재시도 폭주)도 한도 계산에 즉시 반영된다.
