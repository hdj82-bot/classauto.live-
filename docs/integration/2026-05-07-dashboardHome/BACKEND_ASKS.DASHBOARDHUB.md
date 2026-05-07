# BACKEND_ASKS — feat/dashboard-stats (2026-05-07)

> 이 문서는 `/professor/dashboard` 정상 분기(강의 1개 이상)의 통계·차트 구현
> 중 **백엔드 측 보강이 필요한 항목**을 정리한 것입니다. 본 PR 의 프론트는
> 모두 graceful fallback 으로 동작하며, 아래 endpoint·필드가 추가되면 UI 가
> 자동으로 실데이터로 전환됩니다.

| ID | 우선순위 | 사용처 | 영향 |
|---|---|---|---|
| §1 | High | 단일 합계 endpoint | fan-out 250+ 호출 → 1 회 |
| §2 | High | 7-day 추이 raw | StatCard sparkline + delta 라벨 활성화 |
| §3 | Medium | 학생별 last_activity_at 필드 | 시청 부진 학습자 정확도 ↑ |
| §4 | Medium | 학기 컨텍스트 (semester / week 번호) | 메인 차트 x 라벨, 인사 카드 |
| §5 | Low | 통합 활동 로그 endpoint | ActivityFeed 의 입력을 단일 소스로 |
| §6 | Low | qa.logs 응답에 user_id / 학생명 노출 | ActivityFeed 의 "익명 학습자" 텍스트 제거 |
| §7 | Low | 사용자 플랜 한도 노출 (월 영상 / 비용) | StatCard progress / CostMeter 자동 활성 |

---

## §1. 단일 합계 endpoint (High)

**현재** — 본 PR 은 강의 N 개 × dashboard endpoint 5 개 = `5N` 호출. 강의가
50 개면 이미 250 호출이며 학기 말이면 더 많아진다.

**요청** — 단일 endpoint 추가:

```jsonc
GET /api/v1/dashboard/summary
  ?semester=2026-spring          (선택)
  ?range=7|30|semester           (선택)

200 OK
{
  "lectureCount": 12,
  "summary": {
    "watchCompletionPct": 78.0,
    "avgAccuracyPct": 82.0,
    "pendingQaCount": 5,
    "activeLearners": 47,
    "monthlyVideoCount": 8,
    "totalCostUsd": 46.20
  },
  "deltaWeekOverWeek": {
    "watchCompletionPct": 4.0,
    "avgAccuracyPct": -1.0,
    "pendingQaCount": -2,
    "activeLearners": 1
  },
  "donut": { "completed": 28, "inProgress": 14, "notStarted": 5, "total": 47 },
  "mainChart": [
    { "lectureId": "...", "title": "...",
      "weeklyCompletion": [10, 30, 55, 70, 80, 88, 92, 95] },
    ...
  ],
  "attention": {
    "pendingQa": [...],
    "laggingLearners": [...],
    "frequentPauseSlides": [...]
  },
  "activity": [
    { "id": "...", "kind": "qa-asked", "lectureId": "...",
      "userId": "...", "name": "...", "excerpt": "...", "createdAt": "..." },
    ...
  ]
}
```

도착 시 본 PR 은 `aggregate.ts` 의 호출 측만 교체하고 합산 코드는 그대로 둔다
(테스트는 unit-level 이라 영향 없음). 응답 shape 가 `DashboardHubData` 와 거의
동일하므로 매핑 비용도 0 에 가깝다.

---

## §2. 7-day 추이 raw (High)

**현재** — `DashboardStats.{watch,accuracy,pendingQa,active,cost}Trend` 가
모두 `null` → StatCard 는 placeholder sparkline ("추이 데이터 준비 중") 으로
fallback. delta 도 모두 미표시.

**요청** — §1 응답에 다음 필드 추가:

```jsonc
"trends": {
  "watchCompletionPct": [72, 73, 74, 76, 75, 77, 78],
  "avgAccuracyPct":     [83, 82, 82, 80, 81, 82, 82],
  "pendingQaCount":     [3, 4, 5, 6, 5, 4, 5],
  "activeLearners":     [40, 41, 43, 44, 45, 46, 47],
  "totalCostUsd":       [12.0, 18.4, 23.8, 28.9, 35.0, 41.7, 46.2]
}
```

각 배열 길이 7 (지난 7일, 가장 오래된 → 가장 최신). 도착 시 프론트는 한 줄
변경 없이 자동으로 sparkline 채움 + delta 카운터 활성.

---

## §3. last_activity_at 노출 (Medium)

**현재** — `dashboard/{id}/attendance` 응답의 `students[]` 에 `started_at` 만
있음. 본 PR 은 임시로 "started_at 부터 지난 일수" 와 status 로 시청 부진
학습자를 정렬하지만 정확하지 않다 (시작은 했는데 다시 안 본 학생을 잡지 못함).

**요청** — `LearningSession` 모델에 `last_activity_at` 컬럼 추가 + attendance
응답에 포함:

```jsonc
"students": [
  { "user_id": "...",
    "started_at": "2026-04-30T10:00:00Z",
    "last_activity_at": "2026-05-02T14:00:00Z",
    "progress_pct": 50,
    "status": "in_progress",
    ... }
]
```

도착 시 `aggregate.ts` 의 `aggregateAttention.lagging` 정렬 키만 교체하면
끝. 알림 발송 endpoint (별도 PR) 와 결합되면 본격적인 부진 학습자 케어 흐름
완성.

---

## §4. 학기 컨텍스트 (Medium)

**현재** — 메인 차트 x 라벨이 `W1 ... W8` 처럼 임의 주차 번호. 인사 카드도
"○○ 봄학기" 컨텍스트가 비어있다.

**요청** — 사용자 프로필 또는 별도 endpoint 에 학기 메타:

```jsonc
GET /api/v1/users/me/semester
{
  "label": "2026 봄학기",
  "startDate": "2026-03-02",
  "endDate":   "2026-06-21",
  "currentWeek": 8
}
```

도착 시 인사 카드는 `dashboardHub.context` 키를 채워주고, 메인 차트는
`startDate` 기준으로 정확한 주차 번호 라벨링.

---

## §5. 통합 활동 로그 endpoint (Low)

**현재** — `ActivityFeed` 가 `dashboard/{id}/qa` 의 `logs[]` 만 사용. 영상
렌더 완료 / PPT 업로드 / 결제 같은 다른 이벤트는 노출 못 함.

**요청** —

```
GET /api/v1/dashboard/activity?limit=20
```

이벤트 종류 (kind 확장): `qa-asked` / `qa-responded` / `qa-out-of-scope` /
`render-done` / `lecture-published` / `payment-receipt`. 본 PR 의
`RecentActivity.kind` union 에 새 값을 추가하기만 하면 자동 노출.

---

## §6. qa.logs 에 user_id / 학생명 (Low)

**현재** — `dashboard/{id}/qa` logs 응답에 `id / question / answer / in_scope /
responded / cost_usd / created_at` 만 있음. 학생명이 없어 ActivityFeed 가
"익명 학습자" 텍스트로 fallback (BACKEND_ASKS.LEARNERS.md §4 와 동일 요구).

**요청** — `logs[]` 에 `user_id`, `name`, `student_number` 추가.

---

## §7. 사용자 플랜 한도 노출 (Low)

**현재** — `StatCard` 의 `progressLimit` 과 `CostMeterBar` 의 `limitUsd` 가
`null` → progress 바 / 80% 펄스 모두 비활성 상태 (placeholder).

**요청** — 사용자 플랜 endpoint 가 다음을 노출:

```jsonc
GET /api/v1/subscription/me
{
  "plan": "Pro",
  "monthlyVideoLimit": 20,
  "monthlyCostLimitUsd": 200
}
```

도착 시 `page.tsx` 의 `aggregateDashboardHub({ ..., monthlyVideoLimit,
monthlyCostLimitUsd })` 한 줄에 채워주면 자동 활성화.

---

## 부록: 임시 우회

§1 ~ §7 이 모두 도착하기 전까지 본 PR 은 다음과 같이 동작합니다:

- 모든 stat 카드 / 차트는 graceful fallback 으로 카드 골격을 유지.
- StatCard sparkline 영역에는 점선 placeholder + "추이 데이터 준비 중" 캡션.
- AttentionWidget 의 "자주 멈춘 구간" 섹션은 EmptyState + BACKEND_ASKS 안내.
- CostMeterBar 는 한도 미설정 hint 만 표시 (펄스 비활성).
- 백엔드 도착 후 프론트 코드 변경 없이 자동 활성화.
