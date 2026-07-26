# 15 · 수강 등록·명단·반 관리 설계

> **대상**: Claude Code · **연계 문서**: `docs/planning/06-student-pages.md`, `docs/planning/10-research-data-model.md`, `docs/planning/11-analytics-dashboard.md`, `docs/planning/14-admin-console-v2.md`
> **상태**: ✓ 설계 확정 (v1.0) — 1단계 구현 착수
> **작성 근거**: 현 `main` 실코드 점검 (Alembic head `0071`, 공개 초대 머지 직후)

---

## 0. 한 줄 요약

교수자와 학생을 잇는 관계가 **저장돼 있지 않다.** `Enrollment` 를 도입해 "누가 내 학생인가"를
사실로 만들고, 그 위에 **학기 초 1회 배포**·명단·반별 통계·제적을 얹는다.

---

## 1. 왜 필요한가

### 1.1 배포 흐름 — 이것이 Enrollment 의 실질 가치다

지금 학생 진입은 `/v/[slug]` 로 **Lecture 단위**다. 12주차 수업이면 **링크도 QR 도 12개**고,
교수자가 매주 새로 뿌려야 한다. 매주 배포가 곧 매주의 이탈 지점이다.

```
[지금]   1주차 링크 배포 → 2주차 링크 배포 → … → 12주차 링크 배포   (12회)
[이후]   학기 초 Course QR 1회 → 매주 자동 노출 → 학기 말 만료      (1회)
```

| 시점 | 동작 |
|---|---|
| **학기 초 1회** | 첫 수업 슬라이드에 **Course QR** 을 띄운다 → 전원 스캔 → `Enrollment` 생성 |
| **매주** | 새 영상 발행 시 **등록 학생에게 자동 노출**. 링크 재배포 없음 |
| **학기 말** | Course 만료 |

→ **Course 단위 학생 진입 라우트**(`/c/[slug]`)와 **Course 단위 QR** 이 필요하다.
기존 `/v/[slug]` 는 지우지 않고 **병존**시킨다 — 단일 강의만 공유하는 용도(특강, 보강,
외부 공개)가 남는다.

### 1.2 "내 학생"은 저장된 관계가 아니라 사후 파생이다

```
LearningSession.user_id  →  users
LearningSession.lecture_id → lectures.course_id → courses.instructor_id
```

교수자의 학생 목록은 **세션 기록을 거꾸로 타서** 만들어진다. 그 결과:

| 증상 | 원인 |
|---|---|
| **등록했지만 한 번도 안 본 학생이 존재하지 않는다** | 세션 행이 없으면 어디에도 안 나타난다. "미시청 3명"을 특정할 수 없다 — 분모가 없다. |
| 출석률의 분모가 "본 사람 수"다 | `dashboard_svc.get_attendance` 는 lecture 단위 세션만 센다. |
| 학생을 반에서 뺄 방법이 없다 | 뺄 관계 자체가 없다. 세션을 지우면 연구 데이터가 사라진다. |
| 반 단위 집계가 불가능하다 | 집계 단위가 `lecture` 뿐이다. |

### 1.3 접근 제어가 없다 — 1단계에서 함께 닫는다

`POST /api/v1/sessions` (`app/api/v1/sessions.py`)는 `require_student` 만 본다.
**`lecture_id` 를 아는 로그인 학생이면 누구나 세션을 시작한다.** 타 학교 학생도 시청·퀴즈·
질문이 된다. Enrollment 가 생기면 자연히 막히지만, 8월 베타가 그 전에 시작되므로
**1단계에서 같이 닫는다**(§4.3).

### 1.4 ⚠️ 자동 등록은 "구멍 재개방"이 아니다 — 읽고 나서 판단할 것

`/v/[slug]` 진입 시 자동 등록이므로, **링크를 아는 사람은 여전히 누구나 등록되고 시청할
수 있다.** 접근 범위만 보면 §1.3 의 구멍과 똑같아 보인다. 그래서 나중에 이 코드를 보는
사람이 "게이트가 뚫렸다"고 판단하고 승인제를 다시 넣기 쉽다. **그러지 마라.**

**이건 우리가 고른 정책이다**(§5 — 승인제 기각, 열린 등록 + 명시적 제적). 플립러닝은
수업 전에 봐야 성립하는데 승인 대기로 못 보면 그 주 대면 수업이 망가지고, 학기 첫 주에
40명 승인 클릭은 그 자체가 이탈 지점이다.

> **닫힌 것은 "아무나 시청"이 아니라 "기록 없이 시청"이다.**

그 차이가 만드는 것:

- 누가 봤는지 **행으로 남는다** — 명단·미시청자·이탈이 관측 가능해진다(§8).
- 교수자가 **뺄 수 있다** — 제적하면 그 사람만 정확히 차단된다(§4.2). 종전에는 뺄
  대상 자체가 없었다.
- **강좌 단위 관계**가 생겨 매주 링크를 다시 뿌릴 필요가 없다(§1.1).

승인제로 바꾸는 건 정책 변경이지 버그 수정이 아니다. 바꾸려면 §5 를 먼저 고치고,
`enrollments.status` 에 `pending` 을 더하는 방식으로 하면 된다 — 모델은 이미 그 길을
열어 뒀다.

### 1.5 학기 구분이 없다

`courses` 는 `title` · `description` · `instructor_id` · `is_published` 뿐이다. 2027-1 에 같은
과목을 다시 열면 **지난 학기 학생과 섞인다.** 나중에 추가하면 기존 행 백필이 필요하므로
Enrollment 마이그레이션에 묶어 `courses.term` 을 함께 넣는다(§3.2).

### 1.6 이미 있는 것 (재구현 금지)

| 요소 | 위치 |
|---|---|
| 교수자 ↔ 강좌 소유 | `courses.instructor_id` |
| 강좌 ↔ 강의 | `lectures.course_id` |
| 강의별 출석·참여 분석 | `/api/v1/dashboard/{lecture_id}/attendance` · `/engagement` |
| 강의별 학습자 화면 | `/professor/learners/[lectureId]` |
| 학생 학번·소속 | `users.student_number` · `users.school` · `users.department` |
| 소유권 가드 | `assert_professor_owns_lecture` |
| 강의 만료 | `lectures.expires_at` |
| QR 생성 | `qrcode` + `components/admin/InviteQr.tsx` · `professor/studio/ShareLinks.tsx` |

---

## 2. 반의 단위는 `Course` — 분반은 쪼개지 않고 라벨로 둔다

`Course` 는 이미 `instructor_id` 를 갖고 `Lecture` 를 묶는다. 여기에 `Enrollment` 를 걸면
**교수자 → 강좌(반) → 학생** 이 한 번에 성립한다.

**`ClassGroup` 3단 계층을 만들지 않는 이유**: `Course → ClassGroup → Lecture` 가 되면 강의
소유권 판정·대시보드 집계·비용 귀속·분석 스펙(`analytics-spec.md`)의 집계 단위가 전부 바뀐다.

**분반마다 `Course` 를 만들지도 않는다.** 같은 과목의 여러 분반은 **같은 영상을 본다.**
분반별로 Course 를 만들면 **영상과 RAG 임베딩을 분반 수만큼 복제**해야 하고 렌더 비용이
배로 든다. 대신:

> **Course 하나 · 영상 한 벌 · 출석과 분석만 `enrollments.section` 으로 필터.**

`section` 은 `String(20) nullable` 라벨이다(예: `"01"`, `"화3"`). **스키마에는 1단계에서
넣되 UI 노출은 3단계로 미룬다** — 당장 분반이 적으면 빈 값으로 두면 된다. 나중에
필터를 붙일 때 마이그레이션이 필요 없다.

---

## 3. 데이터 모델

### 3.1 신규 테이블 `enrollments`

```
enrollments
  id            UUID PK
  course_id     UUID FK → courses.id   ON DELETE CASCADE   NOT NULL
  student_id    UUID FK → users.id     ON DELETE CASCADE   NOT NULL
  status        VARCHAR(16) NOT NULL DEFAULT 'active'   -- active | withdrawn
  section       VARCHAR(20) NULL                        -- 분반 라벨(§2). UI 는 3단계.
  source        VARCHAR(16) NOT NULL DEFAULT 'link'     -- link | manual
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  withdrawn_at  TIMESTAMPTZ NULL
  withdrawn_by  UUID FK → users.id ON DELETE SET NULL    -- 제적한 교수자
  note          TEXT NULL                                -- 교수자 메모(제적 사유 등)

  UNIQUE (course_id, student_id)
  INDEX  (course_id, status)          -- 명단 조회 핫패스
  INDEX  (student_id)                 -- "내가 듣는 강좌" 역방향
```

**설계 근거**

- **제적은 행 삭제가 아니라 `status='withdrawn'`.** 삭제하면 이미 쌓인 세션·평가 결과가
  주인 없는 데이터가 되고, 연구 데이터 모델(스펙 10)의 코호트 집계가 과거와 어긋난다.
  중도 이탈 이력 자체가 연구 대상이다.
- **`UNIQUE(course_id, student_id)`** 때문에 재등록은 새 행이 아니라 기존 행을 `active` 로
  되돌리는 것이다. 등록/제적/재등록이 같은 행의 상태 전이가 되어 이력이 한 줄에 모인다.
- **`source`** 는 링크 자동 등록(`link`)인지 교수자 수동 추가(`manual`)인지. 유입 경로를
  베타 운영 중 관찰할 수 있다.
- `withdrawn_by` — 스펙 14 §5 원칙대로 쓰기에는 추적이 따라붙는다.

### 3.2 `courses.term` 동반 추가

```
courses.term   VARCHAR(20) NULL     -- 예: "2026-2"
```

기존 행은 NULL 로 남긴다(백필하지 않는다 — 어느 학기였는지 알 방법이 없고, 추정해
넣으면 틀린 값이 사실처럼 굳는다). 신규 강좌 생성 폼에서 입력받고, 명단·통계는
`term` 이 있으면 함께 표시한다.

### 3.3 마이그레이션

`enrollments` 테이블 + 인덱스 3개 + `courses.term` 컬럼을 **한 리비전**에 넣는다.

> **리비전 번호 규칙: 착수 시점의 `alembic heads` 를 확인하고 그 다음 번호를 쓴다.**
> 기획 문서에 구체 번호를 적지 않는다 — 미구현 작업에 번호를 예약해 두면 먼저 머지되는
> 쪽과 계속 어긋난다(이 프로젝트에서 두 번 어긋났다).

---

## 4. 등록은 언제·어디서 생기는가

### 4.1 등록 생성은 **전용 진입점**에서만 한다

세션 시작 시점에 슬그머니 만들면 §1.3 의 구멍이 그대로 남는다(아무나 `lecture_id` 로
세션을 시작하면서 등록까지 자동 생성). 그래서 등록은 **명시적 진입 동작**으로 분리한다.

```
POST /api/v1/enrollments/join   { course_slug | lecture_slug }   (require_student)
  → slug → course 해석
  → enrollments UPSERT (course_id, student_id)
      · 없으면 status='active', source='link' 로 생성
      · 이미 'active' 면 통과 (멱등 — 두 탭을 열어도 안전)
      · status='withdrawn' 이면 → 403 (§4.2)
```

- `/c/[slug]` (Course QR) 로 들어오면 `course_slug`, `/v/[slug]` 로 들어오면 `lecture_slug`.
  둘 다 같은 `course_id` 에 수렴한다.
- `UNIQUE` 충돌은 정상 경로로 삼는다(`ON CONFLICT DO NOTHING` 후 재조회).

### 4.2 제적자의 재진입

**제적된 학생이 링크로 다시 들어오면 403.** 자동 복구되면 제적이 아무 의미가 없다.
재등록은 교수자가 명단에서 되돌리는 것으로만 가능하다.

학생 화면에는 **"이 강좌에서 수강이 종료되었습니다. 담당 교수님께 문의하세요."** 를 띄운다
— 로그인 실패나 링크 오류처럼 보이면 학생이 엉뚱한 곳을 헤맨다.

### 4.3 `create_session` 게이트 (§1.3 구멍 차단)

```
POST /api/v1/sessions (lecture_id)
  → lecture → course 해석
  → 해당 course 에 student 의 status='active' enrollment 가 있는가?
      · 없음     → 403 "이 강좌에 등록되지 않았습니다."
      · withdrawn → 403 (§4.2 와 같은 문구)
      · active   → 통과
```

**무엇이 닫히는가**: 종전에는 `lecture_id`(UUID) 하나만 알면 세션이 시작됐다. 이제는
**진입점(§4.1)을 통과한 사람만** 시청·퀴즈·질문을 할 수 있다. UUID 가 로그·API 응답·
공유 화면 등으로 새어도 그것만으로는 아무것도 못 한다. 범위에 대한 오해를 막으려면
**§1.4 를 함께 읽을 것.**

**이 게이트는 `settings.ENROLLMENT_GATE_ENABLED`(기본 `False`) 뒤에 있다.** 프론트와
백엔드를 원자적으로 배포할 수 없기 때문이며, 켜는 순서는 §11 이다.

**학생 회원가입 흐름은 건드리지 않는다**(스펙 14 §0-2). 가입은 그대로 강의 링크로
자유롭게 하고, 등록은 가입 이후의 별개 단계다.

### 4.4 교수자의 수동 추가 (`source='manual'`)

명단 화면에서 학번·이메일로 검색해 추가. **이미 가입한 학생만** 대상이다.

---

## 5. 접근 제어는 "열린 등록 + 명시적 제적"

승인제는 **하지 않는다.**

- 플립러닝은 **수업 전에 봐야 성립한다.** 승인 대기로 못 보면 그 주 대면 수업이 망가진다.
- 학기 첫 주에 40명 승인 클릭은 그 자체가 이탈 지점이다.
- 링크 유출은 `lectures.expires_at`(만료) + §4.3(등록 게이트) + 제적으로 막는다.

`enrollments.status` 에 `pending` 을 더하면 같은 모델 위에서 승인제로 확장된다 —
지금 만들지 않을 뿐 길은 막지 않는다.

---

## 6. 사전 명단(CSV)은 1단계에 넣지 않는다

- 수강정정 2주 동안 명단이 서너 번 바뀐다.
- `users.student_number` 는 **학생이 직접 입력한 값**이라 앞자리 0·하이픈·공백 표기가
  학교 명단과 어긋난다. 대조 실패로 학생이 못 들어오면 **교수가 이 도구를 버린다.**

나중에 붙이더라도 **"차단"이 아니라 등록 목록 옆 "수강신청 명단에 없음" 배지**로만 쓴다.
판단은 교수자가 하고, 도구는 신호만 준다.

---

## 7. 화면

### 7.1 `/c/[slug]` — Course 진입 (신규, 2단계)

Course QR 이 여는 화면. 강좌 제목·교수자·학기·수강 안내 → 로그인/가입 → `join` 호출 →
그 강좌의 발행 강의 목록. 이후 매주 새 영상은 이 목록에 자동으로 나타난다.

### 7.2 `/professor/courses/[courseId]/roster` — 명단 (신규, 2단계)

- 표: 이름 · 학번 · 소속 · 등록일 · 최근 활동 · 진도(수강 강의 n개 중 완료 m개) · 상태
- 필터: 활성 / 제적 / **미시청**(등록했지만 세션 0건 — §1.2 가 못 하던 것)
- 행 액션: 제적 / 재등록 / 메모
- 상단 요약: 등록 n명 · 활성 n명 · 미시청 n명
- **제적은 확인 대화상자 + 사유 입력(선택).** 되돌릴 수 있음을 문구로 알린다.

### 7.3 기존 학습자 화면과의 관계

`/professor/learners/[lectureId]` 는 **강의 단위**로 남긴다. 명단은 **강좌(반) 단위**다.
층위가 다르므로 통합하지 않고 서로 링크한다.

---

## 8. 반별 통계 (3단계)

`Enrollment` 가 생기면 **분모가 생긴다.** 이게 실질 가치의 절반이다.

| 지표 | 지금 | Enrollment 이후 |
|---|---|---|
| 출석률 | 세션 있는 학생 기준 | **등록 학생 기준** (안 본 사람이 분모에 든다) |
| 미시청자 | 알 수 없음 | 명단에서 특정 가능 → 개별 독려 |
| 이탈 | **관측조차 못 함** | 최근 n주 세션 0 → 이탈 위험군 |
| 반 평균 | 강의별만 | 반 단위 롤업 |
| 분반 비교 | 불가 | `section` 필터로 분반별 비교 |

신규 엔드포인트 `GET /api/v1/courses/{course_id}/roster-stats`. 기존 `dashboard_svc` 패턴
(N+1 금지, group by 후 파이썬 조인)을 따른다. 분석 스펙의 4시나리오 판정도 분모가
정확해지면 정밀도가 올라간다.

---

## 9. 단계 분할

| 단계 | 범위 | 규모 |
|---|---|---|
| **1** | `enrollments` + `courses.term` 마이그레이션 · `POST /enrollments/join` · **`create_session` 등록 게이트(§4.3)** · 제적자 403 | 백엔드, 중 |
| **2** | `/c/[slug]` Course 진입 + Course QR · 명단 화면 · 제적/재등록 | 백+프론트, 대 |
| **3** | 반별 통계 롤업 · 출석률 분모 교체 · `section` 필터 UI | 백+프론트, 중 |
| **4** | *(선택)* 수강신청 명단 대조 배지(§6) | 중 |

**1단계는 8월 베타 전에 넣는다** — 관계를 그때부터 기록해야 학기 말에 분석할 데이터가
있고, §1.3 구멍도 그 전에 닫힌다. 2·3단계는 학기 중 추가해도 소급 집계가 된다.

---

## 10. 범위 밖

- **학생 간 상호작용**(조 편성, 토론) — 별건.
- **성적 산출·이의신청** — LMS 영역. ClassAuto 는 학습 데이터를 제공하고 성적은 교수자가
  기존 LMS 에서 낸다.
- **학교 LMS 연동**(LTI, 수강생 자동 동기화) — 기관 계약 단계의 과제.
- **운영자의 반 간섭** — 스펙 14 §5 원칙상 콘솔은 읽기 위주다. 반 관리는 교수자의 것.

---

## 11. 배포 절차 — 게이트는 반드시 3단계로 켠다

**프론트(Vercel)와 백엔드(Railway)는 독립 배포다. 두 서비스를 원자적으로 올릴 수 없다.**
게이트를 켠 백엔드가 먼저 나가면, 아직 `join` 을 호출하지 않는 프론트 때문에 **그 순간
모든 학생이 재생 불가**가 된다. 그래서 게이트는 `settings.ENROLLMENT_GATE_ENABLED`
(기본 `False`) 뒤에 두고 순서대로 켠다.

| # | 배포 | 상태 | 학생 영향 |
|---|---|---|---|
| 1 | `flag=False` 로 백엔드(Railway) | 등록은 **기록**되지만 차단은 안 함 | 없음 (무해) |
| 2 | 프론트(Vercel) — `join` 호출 | 진입 시 등록이 쌓이기 시작 | 없음 |
| 3 | Railway 에서 `ENROLLMENT_GATE_ENABLED=true` | 게이트 실제 작동 | 미등록·제적자만 차단 |

##### 3단계(게이트 ON) 전 확인 체크리스트

**하나라도 어긋나면 켜지 않는다.** 켜는 순간 미등록 학생이 전부 403 이 된다.

**A. 등록이 실제로 쌓이고 있는가** — 가장 중요하다. 안 쌓이는데 켜면 전원이 막힌다.

```sql
-- 최근 24시간에 새 등록이 있는가? (프론트 join 배포 후 학생 진입이 있었다면 있어야 한다)
SELECT count(*) AS total,
       count(*) FILTER (WHERE joined_at > now() - interval '24 hours') AS last_24h,
       min(joined_at), max(joined_at)
FROM enrollments;
```

- `total = 0` → **켜지 마라.** 프론트 join 이 안 나가고 있다(2단계 배포 확인).
- `last_24h = 0` 인데 그 사이 학생 진입이 있었다면 → 마찬가지로 켜지 마라.

**B. 세션이 있는데 등록이 없는 학생이 남아 있지 않은가** — 게이트를 켜는 순간 이들이
막힌다. 프론트 join 배포 이전부터 보던 기존 학생이 여기 걸린다.

```sql
-- 활성 세션 이력이 있는데 해당 강좌 등록이 없는 (학생, 강좌) 조합
SELECT u.email, c.title, count(*) AS sessions
FROM learning_sessions s
JOIN lectures l ON l.id = s.lecture_id
JOIN courses  c ON c.id = l.course_id
JOIN users    u ON u.id = s.user_id
LEFT JOIN enrollments e
       ON e.course_id = c.id AND e.student_id = s.user_id
WHERE e.id IS NULL
GROUP BY u.email, c.title
ORDER BY sessions DESC;
```

- **0행이어야 켠다.** 행이 있으면 그 학생들은 다음 진입 때 join 이 자동으로 만들어 주므로
  며칠 더 기다리거나, 목록을 확인한 뒤 백필한다:

```sql
-- (선택) 기존 시청자 백필 — 게이트를 빨리 켜야 할 때만.
INSERT INTO enrollments (id, course_id, student_id, status, source, joined_at)
SELECT gen_random_uuid(), c.id, s.user_id, 'active', 'manual', min(s.created_at)
FROM learning_sessions s
JOIN lectures l ON l.id = s.lecture_id
JOIN courses  c ON c.id = l.course_id
GROUP BY c.id, s.user_id
ON CONFLICT (course_id, student_id) DO NOTHING;
```

**C. 제적자가 의도한 사람뿐인가** — 켜면 이들만 정확히 막힌다.

```sql
SELECT u.email, c.title, e.withdrawn_at, e.note
FROM enrollments e
JOIN users u ON u.id = e.student_id
JOIN courses c ON c.id = e.course_id
WHERE e.status = 'withdrawn';
```

**D. 프론트가 실제로 join 을 부르고 있는가** — 배포 확인. 브라우저 개발자도구
Network 에서 `/v/[slug]` 진입 시 `POST /api/v1/enrollments/join` 이 200 으로 나가는지.
(`/lecture/[slug]` 북마크 진입에서도 나가야 한다 — PlayerV2 가 세션 생성 직전에 부른다.)

**E. 롤백 경로 확인** — `ENROLLMENT_GATE_ENABLED=false` 로 되돌리면 즉시 원복된다.
재배포도 마이그레이션 되돌리기도 필요 없다. 등록 데이터는 그대로 쌓이므로 원인을 고친 뒤
다시 켜면 된다.

**켠 직후 볼 것**: 학생 문의·오류 로그에서 403 이 급증하는지. 급증하면 B 를 다시 확인한다.

**롤백은 환경변수 하나로 끝난다** — `ENROLLMENT_GATE_ENABLED=false`. 재배포도, 마이그레이션
되돌리기도 필요 없다. 등록 데이터는 그대로 쌓이므로 원인을 고친 뒤 다시 켜면 된다.

> 1단계 배포만으로도 §1.2 의 관측 문제(누가 등록했는지 기록)는 해결된다. 게이트는
> §1.3 의 접근 제어를 위한 별개 스위치다.

---

## 변경 이력

- 2026-07-26: **게이트를 feature flag 뒤로.** `ENROLLMENT_GATE_ENABLED`(기본 False) 신설 +
  §11 배포 절차 추가 — 프론트(Vercel)·백엔드(Railway)가 독립 배포라 게이트를 켠 백엔드가
  먼저 나가면 그 순간 모든 학생이 재생 불가가 된다. 롤백은 환경변수 하나.
  §1.4 추가 — 자동 등록이 "구멍 재개방"으로 오독돼 승인제가 다시 들어오는 것을 막기 위해,
  **닫힌 것은 "아무나 시청"이 아니라 "기록 없이 시청"** 임을 명시.
  마이그레이션 번호는 문서에서 제거하고 "착수 시점 head + 1" 규칙만 남김(스펙 14 도 동일).
- 2026-07-26: **설계 확정 (v1.0).** 열린 질문 3건 결정 + 2건 추가 확정.
  (1) 반의 단위는 `Course`, **분반은 Course 를 쪼개지 않고 `enrollments.section` 라벨** —
  같은 과목의 분반은 같은 영상을 보므로 Course 를 나누면 영상·RAG 임베딩을 분반 수만큼
  복제해 렌더 비용이 배가 된다. (2) 접근 제어는 **열린 등록 + 제적**, 승인제 없음 —
  플립러닝은 수업 전 시청이 전제라 승인 대기가 그 주 대면 수업을 망가뜨린다.
  (3) 사전 명단 CSV 는 1단계 제외 — `student_number` 표기 불일치로 대조 실패 시 교수가
  도구를 버린다. 붙이더라도 차단이 아니라 배지. (4) `create_session` 등록 게이트를
  1단계에 포함. (5) `courses.term` 을 같은 마이그레이션에 동반 추가.
  §1.1 에 학기 초 1회 배포 흐름과 `/c/[slug]` Course 진입 라우트 명시.
- 2026-07-26: 최초 작성. 공개 초대(1회용 링크·QR) 머지 후, 교수자↔학생 관계가 저장되지
  않는다는 점이 드러나 설계.
