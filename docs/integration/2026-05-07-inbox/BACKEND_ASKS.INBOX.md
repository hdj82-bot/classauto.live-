# BACKEND_ASKS — feat/inbox (2026-05-07)

> 이 문서는 `/professor/inbox` 화면 구현 중 **백엔드 측 보강이 필요한 항목** 을
> 정리한 것입니다. 본 PR 의 프론트는 모두 graceful fallback 으로 동작하지만,
> 아래 endpoint 가 추가되면 UI 가 자동으로 실데이터를 노출합니다.
>
> 우선순위 결정 근거:
> - **High** = mock 모드(`deferred=true`) 가 사라지는 데 필요한 최소 집합
> - **Medium** = 일괄 답변 / 강의별 미답변 카운트 / 알림 등 액션 흐름 완성
> - **Low** = Pro 클러스터링·확장 필드 (R3 이후)

| ID | 우선순위 | 사용처 | 영향 |
|---|---|---|---|
| §1.1 | **High** | 인박스 항목 단일 합집합 endpoint | mock 모드 종료 — 모든 강의의 Q&A 한번에 |
| §2.1 | **High** | 단건 답변 확정 PATCH | 답변 흐름 영속화 |
| §2.2 | High | 일괄 RAG 초안 확정 POST | "선택한 항목 모두 확정" 액션 |
| §3.1 | Medium | 강의별 미답변 카운트 aggregate | 사이드바 배지 정확도 |
| §4.1 | Medium | 답변 알림 발송 (이메일/푸시) | 학생 알림 통지 (composer / bulk 의 `notify` 플래그) |
| §5.1 | Medium | "교수자에게 전달" 학생 액션 | `off_topic_forwarded` 분류 정확화 |
| §6.1 | Low | 유사 질문 클러스터링 | Pro 차별 기능 — `rag.similarQuestionCount` |
| §7.1 | Low | dashboard `qa` 응답에 user_id/student_name | §1.1 도착 전 fan-out 경로의 익명 학습자 표기 해소 |

---

## §1. 인박스 항목 조회

### §1.1 단일 합집합 endpoint (High)

**현재** — 프론트가 fallback 으로 다음을 fan-out 함:

```
GET /api/courses
GET /api/courses/{course_id}/lectures
GET /api/v1/dashboard/{lecture_id}/qa?limit=200
```

이 경로는 N+1 호출에다, dashboard 응답에는 학생 이름·슬라이드 번호·재생 시점이
없어 인박스 §6.3 의 "어느 영상 어느 시점" 컨텍스트를 채울 수 없음.

**요청** — 단일 endpoint 추가:

```
GET /api/v1/inbox
  ?course_id=<uuid>            (선택, "all" 이면 전체 강좌)
  ?lecture_id=<uuid>           (선택, course_id 와 함께 또는 단독 사용)
  ?status=auto_answered|needs_professor|off_topic_forwarded   (선택)
  ?unanswered_only=true|false  (선택, 기본 false)
  ?sort=newest|oldest|similarity                              (선택, 기본 newest)
  ?search=<문자열>              (선택, question/answer contains)
  ?limit=50                    (페이지)
  ?cursor=<opaque>             (페이지)

200 OK
{
  "items": [
    {
      "id": "qa-uuid",
      "status": "needs_professor",       // 분류는 §5 정책 참조
      "inScope": true,                    // QALog.in_scope
      "professorAnswered": false,         // 신규 — 교수자가 확정 응답을 보냈는가
      "responded": true,                  // QALog.responded (RAG 응답 발송 여부)
      "question": "후커우 제도가...",
      "aiDraft": "후커우 제도는...",     // QALog.answer (in_scope 인 경우만)
      "professorAnswer": null,            // 신규 — 교수자 확정 답변 본문 (확정 시 채움)
      "costUsd": 0.0042,
      "createdAt": "2026-05-07T03:14:00Z",
      "reviewedAt": null,                 // 신규 — 교수자가 마지막 확인/응답한 시각
      "student": {
        "id": "user-uuid",
        "name": "박서연",                 // ← 익명 처리 학생은 null
        "studentNumber": "201912345",
        "email": "..."                    // (선택)
      },
      "lecture": {
        "lectureId": "lec-uuid",
        "lectureTitle": "2주차 — 호적제도와 도시화",
        "courseId": "course-uuid",
        "courseTitle": "현대중국사회의이해",
        "timestampSec": 412               // 신규 — 학생이 질문한 영상 재생 지점(초). 미저장 시 null
      },
      "rag": {
        "topSlideNumbers": [7, 8, 9],     // QALog.top_slide_numbers 를 list 로
        "topSimilarity": 0.78,            // QALog.top_similarity (0~1)
        "similarQuestionCount": 4         // §6.1 클러스터링 (Pro). 미구현 시 생략 가능
      }
    }
  ],
  "stats": {
    "total": 47,
    "byStatus": {
      "auto_answered": 28,
      "needs_professor": 12,
      "off_topic_forwarded": 7
    },
    "unanswered": 14,
    "avgResponseHours": 6.4               // 선택 — Pro 분석. 없어도 OK
  },
  "nextCursor": null
}
```

DB 쿼리 시 `qa_logs JOIN lectures JOIN courses JOIN users` (사용자 익명 정책에
따라 NULL-safe). `topSlideNumbers` 는 `top_slide_numbers` 컬럼의 콤마 문자열을
list 로 변환해 응답.

**권한** — `require_professor` + `qa_logs.lecture_id` 의 lecture 소유자만 결과
포함 (cross-tenant 누출 방지).

### §1.2 (선택) cursor 기반 페이지네이션

기획상 인박스에는 한 학기에 수십~수백 건이 누적될 수 있어 limit/offset 보다는
`created_at + id` 복합 cursor 권장. limit/offset 도 수용 가능 (현재 dashboard
경로와 동일).

---

## §2. 답변 처리

### §2.1 단건 답변 확정 (High)

```
PATCH /api/v1/inbox/{id}/answer
Content-Type: application/json

{
  "body": "교수자가 다듬은 답변 본문...",
  "notify": true,                   // 학생에게 즉시 알림 발송할지
  "mode": "send" | "save"          // send=학생에게 발송 + 확정, save=초안 저장만
}

200 OK
{
  "id": "qa-uuid",
  "professorAnswer": "...",
  "professorAnswered": true,        // mode=send 면 true, save 면 false
  "responded": true,                // mode=send 면 true 강제
  "reviewedAt": "2026-05-07T03:18:00Z"
}
```

DB: `qa_logs` 테이블에 다음 컬럼 추가 권장:

```sql
ALTER TABLE qa_logs
  ADD COLUMN professor_answer  text,
  ADD COLUMN professor_answered boolean NOT NULL DEFAULT false,
  ADD COLUMN reviewed_at        timestamptz;
```

마이그레이션은 R2 의 다른 워크트리와 충돌 없도록 `qa_logs` 테이블 변경만.

### §2.2 일괄 RAG 초안 확정 (Medium)

```
POST /api/v1/inbox/bulk-confirm
Content-Type: application/json

{
  "ids": ["qa-1", "qa-2", "qa-3"],
  "useAiDraft": true,               // true 면 각 항목의 aiDraft 를 그대로 professorAnswer 로 복사
  "notify": true
}

200 OK
{
  "successIds": ["qa-1", "qa-3"],
  "failedIds":  [{ "id": "qa-2", "reason": "out_of_scope_no_draft" }],
  "deferred":   false
}
```

**스킵 정책** — 다음 항목은 `failedIds` 로 분류:
1. `inScope === false` 인데 `useAiDraft === true` 인 경우 (RAG 초안 자체가 없음)
2. 본 교수자가 소유하지 않은 lecture 의 qa_log

기획상 인박스 일괄 액션의 핵심 가치는 "AI 가 잘 답변한 항목을 빠르게 확정" 이므로
`useAiDraft=true` 가 기본. `useAiDraft=false` 일 때는 단순 "검토 완료" 플래그만
세팅 (professorAnswered=true, professorAnswer 는 null 유지).

---

## §3. 사이드바 카운트

### §3.1 강의별 / 강좌별 미답변 카운트 (Medium)

`§1.1` 의 응답 `stats` 만으로도 사이드바 카운트는 충분하지만, 큰 학기엔 응답
크기가 부담 (수백 항목 + 학생 PII). 별도 lightweight aggregate endpoint 권장:

```
GET /api/v1/inbox/aggregate

200 OK
{
  "perCourse": [
    {
      "courseId": "...",
      "courseTitle": "...",
      "total": 23,
      "unanswered": 5,
      "lectures": [
        { "lectureId": "...", "lectureTitle": "...", "total": 12, "unanswered": 3 }
      ]
    }
  ]
}
```

프론트는 sidebar 렌더에 `aggregate` 만, 본문 렌더에 `list` 만 사용해 응답
중복을 피할 수 있음. 미구현 시 `aggregateByCourse(items)` (클라이언트) 로 계산
— 이미 구현되어 있어 backend 작업 없이도 정상 동작.

---

## §4. 답변 알림

### §4.1 학생 발송 (Medium)

`§2.1` / `§2.2` 의 `notify=true` 처리. 별도 endpoint 분리 불필요. 통지 채널:

| 채널 | 트리거 | 메시지 본문 |
|---|---|---|
| 이메일 (학생) | `notify=true && mode=send` | "교수님 답변이 도착했습니다" + 강의 + 본문 발췌 |
| 푸시 (Phase 4) | (학생 PWA push 구독 시) | 동일 |
| 인앱 알림 (학생 화면) | 항상 | unread badge — 학생 화면 R3 에서 처리 |

학생 측 R3 워크트리(학생 알림 패널) 와 합의 — 백엔드는 `notifications` 테이블에
`(user_id, type='qa_answer', payload={qa_id, lecture_id})` 한 줄만 insert 하면
양쪽 화면이 자연 동기화.

---

## §5. `off_topic_forwarded` 분류 정책 (Medium)

기획서 §6.2 의 3번째 탭 "범위 외 거부 (학생이 '교수님께 전달'한 것)" 은 학생
화면에 명시적인 "교수님께 전달" 액션이 있어야 의미가 있습니다.

### §5.1 학생 측 액션

학생이 RAG 거부 응답을 받았을 때 표시되는 패널에 "교수님께 전달" 버튼:

```
PATCH /api/v1/qa/{id}/forward-to-professor
(학생 본인 인증)
```

서버는 `qa_logs` 에 `forwarded_at` 컬럼을 세팅:

```sql
ALTER TABLE qa_logs ADD COLUMN forwarded_at timestamptz;
```

**인박스 분류 (§1.1)**:
- `forwarded_at IS NOT NULL` ⇒ `off_topic_forwarded`
- `in_scope = false AND forwarded_at IS NULL` ⇒ 인박스에서 **노출 안 함** (교수자 액션 불필요)
- `in_scope = true AND professor_answered = false AND (학생이 교수자 검토 요청 또는 cluster size ≥ 3)` ⇒ `needs_professor`
- 그 외 `in_scope = true` ⇒ `auto_answered`

본 PR 의 클라이언트 fallback 은 `forwarded_at` 정보가 없어 `in_scope=false` 인
모든 항목을 `off_topic_forwarded` 로 분류 (보수적). 백엔드가 위 정책으로 응답하면
정확도 향상.

---

## §6. Pro 기능

### §6.1 유사 질문 클러스터링 (Low)

기획서 §6.3 마지막 항목 — "이 질문은 다른 학생 12명도 비슷하게 물었습니다 →
다음 강의 보강 추천". 같은 lecture 내 임베딩 cosine ≥ 0.85 인 다른 qa_log 수.

```
응답 항목에 추가:
{
  ...,
  "rag": { ..., "similarQuestionCount": 12, "similarIds": ["qa-...", ...] }
}
```

미구현 시 0 또는 omit. 프론트는 `> 1` 일 때만 클러스터 카드 노출.

---

## §7. 보조 endpoint 개선

### §7.1 dashboard `qa` 응답에 user_id 노출 (Low)

`§1.1` 도착 전 fallback 경로의 익명 표기를 해소하기 위한 임시 우회. 우선순위
낮음 (학습자 페이지 PR 의 §4 와 같음).

```
GET /api/v1/dashboard/{lecture_id}/qa
응답의 logs 항목에 다음 추가:
  {
    ...,
    "user_id": "...",
    "student_name": "...",
    "student_number": "..."
  }
```

추후 §1.1 으로 본격 통합되면 본 임시 필드는 제거 가능.

---

## §8. 마이그레이션 요약

본 PR 도입에 필요한 DB 변경 (R2 지속성):

```sql
-- A. 교수자 답변 보존 (§2.1)
ALTER TABLE qa_logs
  ADD COLUMN professor_answer    text,
  ADD COLUMN professor_answered  boolean NOT NULL DEFAULT false,
  ADD COLUMN reviewed_at         timestamptz;

-- B. 학생 forward 액션 (§5.1)
ALTER TABLE qa_logs
  ADD COLUMN forwarded_at        timestamptz;

-- C. 인덱스 (인박스 조회 성능)
CREATE INDEX idx_qa_logs_inbox
  ON qa_logs (lecture_id, in_scope, professor_answered, created_at DESC);
```

다른 워크트리(R2W2 학습자, R2W4 분석)의 `qa_logs` 변경과 충돌 없음 — 본 PR 은
qa_logs 에만, 위 컬럼만 추가합니다.

---

## §9. 우선순위에 따른 도입 순서 권장

1. **Sprint A** — `§2.1` (PATCH 답변 확정) + `§8.A` 마이그레이션
   → 교수자가 인박스에서 답변을 영속화 가능 (현재는 sessionStorage)
2. **Sprint A** — `§1.1` (단일 인박스 endpoint)
   → mock 모드 종료, 학생 이름/슬라이드 컨텍스트 노출
3. **Sprint B** — `§2.2` (일괄 확정) + `§5.1` (학생 forward) + `§8.B`
4. **Sprint B** — `§4.1` 알림 연계
5. **Sprint C** — `§3.1` aggregate · `§6.1` 클러스터링 (Pro)

각 sprint 완료 후 프론트 코드 수정 없이 (이미 모두 graceful) 자동 활성화.
