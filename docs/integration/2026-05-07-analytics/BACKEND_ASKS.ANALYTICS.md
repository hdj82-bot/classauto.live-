# BACKEND_ASKS — feat/analytics (2026-05-07)

> 이 문서는 `/professor/analytics/[lectureId]` 화면 구현 중 **백엔드 측 보강이
> 필요한 항목**을 정리한 것입니다. 본 PR 의 프론트는 모두 graceful fallback
> 으로 동작하며, 아래 endpoint·필드가 추가되면 UI 가 자동으로 실데이터로
> 전환됩니다.

| ID | 우선순위 | 사용처 | 영향 |
|---|---|---|---|
| §1.1 | High | 슬라이드별 재시청·이탈 raw | 재생 구간 히트맵 활성화 (현재 "준비 중") |
| §1.2 | Medium | 시청 시점별 일시정지/되감기 카운트 | 슬라이드 내부 구간 히트맵 (Pro) |
| §2 | Medium | dashboard.qa 응답에 slide_index 노출 | "이 슬라이드에서 가장 많이 묻는 질문" 위젯 후속 PR |
| §3 | Low | 학습자 × 챕터 정답률 매트릭스 | Pro 취약점 히트맵 후속 PR |
| §4 | Low | 월 비용 한도(plan limit) 노출 | CostMeter 의 80% 경고 자동화 |

---

## §1. 재생 구간 히트맵 (Pro · `WatchHeatmap`)

### §1.1 슬라이드별 재시청·이탈 카운트 (High)

**현재** — `/api/v1/dashboard/{lecture_id}/engagement` 는 학생당 watched_sec /
total_sec / no_response_cnt 만 반환. 슬라이드 단위 분해 정보가 없습니다.

**요청** — 다음 둘 중 하나로 슬라이드 raw 데이터를 노출:

#### (a) `engagement` 응답 확장 (선호)

```jsonc
GET /api/v1/dashboard/{lecture_id}/engagement
200 OK
{
  "lecture_id": "...",
  "summary": { ... },
  "students": [ ... ],
  // ↓↓↓ 추가 필드 ↓↓↓
  "slides": [
    {
      "index": 0,                  // 0-based 슬라이드 인덱스
      "replays": 12,               // 누적 재시청(되감기 또는 재진입) 횟수
      "drops": 2,                  // 이탈 횟수 (이 슬라이드에서 영상 종료/이탈)
      "durationSec": 30            // 이 슬라이드의 영상 길이(선택)
    },
    ...
  ]
}
```

이 형태가 도착하면 프론트는 자동으로 `WatchHeatmap` 을 활성화합니다(분기
코드는 이미 들어있음 — `[lectureId]/page.tsx` 의 `engagementRes` 처리부).

#### (b) 별도 endpoint

```
GET /api/v1/dashboard/{lecture_id}/watch-heatmap
200 OK
{
  "lecture_id": "...",
  "slides": [ { "index": 0, "replays": 12, "drops": 2, "durationSec": 30 }, ... ]
}
```

(b) 로 가면 `[lectureId]/page.tsx` 의 fetch 한 줄 추가 + `setWatch` 분기
변경이 필요합니다. (a) 가 더 깔끔합니다.

#### 산정 정의(권장)

- **replays**: 한 학생이 같은 슬라이드를 두 번 이상 재생 시점 진입(또는 -10초
  되감기 후 재진입) 시 +1. 학생 단위가 아닌 강의 전체 합산.
- **drops**: 학생이 이 슬라이드 내에서 세션을 종료한 횟수(progress_pct 가 이
  슬라이드 구간을 넘기지 못하고 마지막 활동이 끝난 경우).
- **durationSec**: 슬라이드별 영상 길이(있으면 셀 색 농도 정규화 시 시간당
  재시청 빈도로도 활용 가능 — 우선순위 낮음).

### §1.2 슬라이드 내부 구간 카운트 (Medium · Pro)

슬라이드 단위가 아닌 **시점별** 일시정지/되감기 카운트(예: 0–10초, 10–20초)
가 도착하면 슬라이드 카드 안에 미니 sparkline 으로 농도 분포를 그릴 수
있습니다. Pro 단계 후속 PR 의 화제. 우선순위는 §1.1 보다 낮습니다.

---

## §2. dashboard.qa 응답에 `slide_index` 노출 (Medium)

후속 PR("이 슬라이드에서 자주 묻는 질문" 위젯)에서 사용 예정. 현재 `qa_logs`
는 question/answer/in_scope/responded/cost_usd/created_at 만 반환합니다. 학생
이 영상 안에서 질문을 던질 때 어느 슬라이드 시점이었는지(`slide_index`
또는 `timestamp_sec`) 함께 기록해주세요. 본 PR 의 `QaTrend` 는 영향받지
않습니다.

---

## §3. Pro 취약점 매트릭스 (Low)

`05-instructor-pages.md §7.2` 의 "취약점 히트맵 (Pro)" 는 학습자 × 챕터 정답률
매트릭스를 요구합니다. 현재 `/dashboard/scores` 는 `byCategory` / `byType` /
`wrongAnswerTop` 의 강의 단위 합산만 반환합니다. 학생별 분해를 위해 다음 둘 중
하나가 필요:

- (a) `dashboard/scores` 에 `byStudent: [{user_id, byCategory: [...]}]` 추가
- (b) 별도 endpoint `dashboard/scores/by-student`

본 PR 의 `ScoreHeatmap` 은 강의 단위 매트릭스만 그리고, 학생 차원은 후속 PR.

---

## §4. 월 비용 한도 노출 (Low)

`CostMeter` 는 `monthlyLimitUsd` props 를 받으면 진행 바 + 80% 초과 경고를
그립니다. 현재 본 PR 은 어디서 이 한도를 가져올지 확정하지 못해 props 를
넘기지 않고 있습니다. 다음 중 한 가지 형태로 노출되면 자동 활성화 가능:

- (a) `/dashboard/{lecture_id}/cost` 응답에 `monthlyLimitUsd` 추가(강의 단위가
  아니라 사용자 단위 한도라 부적절할 수 있음).
- (b) `/api/v1/subscription/me` 등 사용자 플랜 endpoint 에서 `monthlyCostLimitUsd`
  공식 노출.
- (c) `04-pricing-policy.md` 의 정책 상수를 프론트가 import (단, 정책 변동 시
  배포 필요).

(b) 가 정공법. 도착 시 `[lectureId]/page.tsx` 에서 `<CostMeter monthlyLimitUsd={...} />`
한 줄 변경.

---

## 부록: 임시 우회

§1 이 도착하기 전까지 본 PR 은 다음과 같이 동작합니다:

- `/professor/analytics/[lectureId]` 진입 시 `WatchHeatmap` 섹션은 카드 골격 +
  "준비 중" EmptyState 가 표시됩니다(레이아웃 점프 없음).
- 안내 카피에 "BACKEND_ASKS.ANALYTICS.md" 를 명시해 작업 큐 추적이 자연스러움.
- 백엔드 도착 후 프론트 코드 변경 없이 자동 활성화.
