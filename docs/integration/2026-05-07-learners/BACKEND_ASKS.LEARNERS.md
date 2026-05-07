# BACKEND_ASKS — feat/learners (2026-05-07)

> 이 문서는 `/professor/learners` 화면 구현 중 **백엔드 측 보강이 필요한 항목**을
> 정리한 것입니다. 본 PR 의 프론트는 모두 graceful fallback 으로 동작하지만,
> 아래 endpoint 가 추가되면 UI 가 자동으로 실데이터를 노출합니다.

| ID | 우선순위 | 사용처 | 영향 |
|---|---|---|---|
| §1.1 | High | 강의별 학습자 조회 단일 endpoint | 진행률 + 집중도 + 정답률 한 번에 |
| §1.2 | Medium | 위험 학생 서버 필터 | 클라이언트 계산 → DB 인덱스 활용 |
| §2.1 | High | 학습자별 Q&A 본문 조회 | 개별 학습자 상세 페이지의 Q&A 섹션 |
| §2.2 | High | 학습자별 평가 점수 | 개별 학습자 상세 페이지의 평가 섹션 |
| §3 | Medium | 일괄 알림(시청 독려/격려) | 보드 상단 일괄 작업 패널 |
| §4 | Low | dashboard `qa` 응답에 user_id 노출 | §2.1 의 임시 우회로로도 활용 가능 |

---

## §1. 강의 단위 학습자 조회

### §1.1 단일 합집합 endpoint (High)

**현재** — 프론트가 두 endpoint 응답을 user_id 기준 클라이언트단 머지

```
GET /api/v1/dashboard/{lecture_id}/attendance
GET /api/v1/dashboard/{lecture_id}/engagement
```

**요청** — 단일 endpoint 추가:

```
GET /api/v1/lectures/{lecture_id}/learners
  ?filter=all|at-risk|completed|in-progress    (선택)
  ?sort=progress|focus|qa|last-activity        (선택)
  ?dir=asc|desc                                (선택)
  ?search=<name|student_number>                (선택)

200 OK
{
  "lecture_id": "...",
  "summary": { "total": 47, "atRisk": 5, "completed": 12 },
  "learners": [
    {
      "user_id": "...",
      "name": "...",
      "student_number": "...",
      "progress_pct": 80,
      "watch_ratio": 75,
      "qa_count": 4,
      "responded_count": 3,
      "response_rate": 75,
      "no_response_cnt": 0,
      "watched_sec": 600,
      "total_sec": 800,
      "attendance_type": "live",
      "started_at": "2026-05-04T10:30:00Z",
      "last_activity_at": "2026-05-06T09:14:00Z",   ← 신규 — 마지막 세션 활동
      "status": "in_progress",
      "accuracy_pct": 88                              ← 신규 — 학습자별 정답률
    },
    ...
  ]
}
```

**프론트 측 영향** — `mergeLearnerRows()` 한 함수만 교체하면 됨.
`risk.computeRisk()` 의 입력 키와 1:1 매칭 (snake_case → camelCase 변환만).

### §1.2 위험 학생 서버 필터 (Medium)

대규모 강의(800명+) 에서는 클라이언트단 필터링이 비효율. §1.1 의
`?filter=at-risk` 가 서버에서 같은 룰로 평가되도록:

```python
# 동등 정의 (단일 진실의 원천 = backend)
def is_at_risk(s: LearningSession, now: datetime) -> bool:
    if s.status == "completed" or s.progress_pct >= 100:
        return False
    if s.started_at is None:
        return True
    if (now - s.started_at).days >= 3 and s.progress_pct < 100:
        return True
    return s.progress_pct < 30
```

룰 변경 시 `frontend/src/components/professor/learners/risk.ts` 의
`computeRisk()` 와 동기화 — 두 곳에 같은 임계값 (3일 / 30%) 이 박혀
있다는 사실을 PR 설명에 명시 권장.

---

## §2. 학습자 단위 상세 조회

### §2.1 학습자별 Q&A 로그 (High)

**현재** — `GET /api/v1/dashboard/{id}/qa` 가 있지만 응답에 `user_id` 가
빠져 있어 프론트가 학습자별로 필터할 수 없음 (`backend/app/services/dashboard.py`
의 `get_qa_logs` 의 직렬화 dict 에 `user_id` 미포함).

**요청** — 두 가지 중 하나:

(A) 새 endpoint
```
GET /api/v1/lectures/{lecture_id}/learners/{user_id}/qa
  ?page=1&limit=50

200 OK
{
  "user_id": "...",
  "lecture_id": "...",
  "page": 1,
  "totalCount": 23,
  "totalPages": 1,
  "logs": [
    {
      "id": "...",
      "question": "...",
      "answer": "...",
      "in_scope": true,
      "responded": true,
      "cost_usd": 0.0021,
      "created_at": "..."
    }
  ]
}
```

(B) 기존 endpoint 응답 확장 (§4 와 묶어 처리)
```
GET /api/v1/dashboard/{lecture_id}/qa?user_id=...
```

추천 — (A). 학습자 상세는 강의 단위 분석과 호출 패턴이 다르고, 권한
체크 (이 교수자가 해당 학습자에게 접근 가능?) 도 단위가 다름.

### §2.2 학습자별 평가 점수 (High)

**현재** — `GET /api/v1/dashboard/{id}/scores` 는 강의 전체 통계만
(`overallAccuracy`, `byType`, `byCategory`, `wrongAnswerTop`).
학습자 단위 정답률·문항별 답안은 API 로 노출되지 않음.

**요청**:
```
GET /api/v1/lectures/{lecture_id}/learners/{user_id}/assessment

200 OK
{
  "user_id": "...",
  "lecture_id": "...",
  "totalQuestions": 12,
  "correctCount": 10,
  "accuracyPct": 83.33,
  "byType": [{"type": "multiple_choice", "accuracy": 90, ...}],
  "results": [
    {
      "id": "...",
      "question_text": "...",
      "question_type": "multiple_choice",
      "category": "...",
      "user_answer": "...",
      "correct_answer": "...",
      "is_correct": true,
      "answered_at": "..."
    }
  ]
}
```

`AssessmentResult` 모델은 이미 `user_id` 필드를 갖고 있을 가능성이
높으니 (서비스 레이어에서 카운팅 시 사용 중), endpoint 추가만 필요.

---

## §3. 일괄 알림 발송 (Medium)

기획 출처 — `docs/planning/05-instructor-pages.md §8.3 액션`:
> - 알림 발송 (시청 부진 학습자에게)
> - 격려 메시지 보내기

본 PR 의 `BulkActions` 컴포넌트는 두 액션 슬롯을 미리 노출하지만,
백엔드 미흡 상태이므로 클릭 시 `toast` 로 "준비 중" 안내만 합니다.

**요청**:
```
POST /api/v1/lectures/{lecture_id}/learners/notify
Authorization: Bearer <professor_jwt>

{
  "user_ids": ["...", "..."],
  "type": "watch_nudge" | "encouragement",
  "message": "...(선택, 기본 템플릿 사용)..."
}

202 Accepted
{
  "queued": 5,
  "skipped": 0,
  "rate_limit_remaining": 95
}
```

### 가드레일 요구사항 (docs/planning/02-guardrails.md)

- 교수자당 일일 발송 한도 (예: 200건/일) — 학생 측 스팸 방지
- 같은 학습자에게 24시간 내 동일 type 중복 발송 차단
- 발송 채널은 학교 이메일 / 인앱 알림으로 한정 — **외부 메신저(카카오·위챗 등) 광고성 사용 금지**
- 발송 로그(audit trail)는 60일 보관 후 자동 삭제

### UI 측 후속

- 응답의 `rate_limit_remaining` 을 `BulkActions` 에 표시
- 202 수신 시 `bulkSendNudge` / `bulkSendEncouragement` 의 "준비 중" 라벨 제거
- 실패 시 toast `learners.toastNotImplemented` 대신 구체적 에러 메시지

---

## §4. dashboard `qa` 응답에 `user_id` 노출 (Low)

`backend/app/services/dashboard.py::get_qa_logs` 의 dict 직렬화에
`"user_id": str(log.user_id)` 한 줄 추가. §2.1 의 (A) 안이 채택되면
이 ASK 는 자동 폐기.

---

## 5. 머지 시 동기화 체크리스트

- [ ] §1.1 endpoint 가 추가되면 `mergeLearnerRows()` 호출부 (강의 보드, 상세 페이지) 를 단일 fetch 로 교체
- [ ] §1.2 가 추가되면 `LearnerTable` 의 `applyFilter`/`applySort` 를 옵션으로 만들고 서버 필터 사용 시 비활성화
- [ ] §2.1 / §2.2 가 추가되면 상세 페이지의 `learner-detail-qa-pending` /
      `learner-detail-assessment-pending` 영역을 실제 컴포넌트로 교체. 두
      안내 문구 i18n 키(`detailQaBackendPending`, `detailAssessmentBackendPending`)
      는 패치 파일에서 제거 가능.
- [ ] §3 이 추가되면 `BulkActions` 의 `bulkBackendPendingShort` 라벨 제거
      및 `onBulkPending` 핸들러를 실제 API 호출로 교체.
