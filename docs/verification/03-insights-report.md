# 인사이트 보고서 — 설계·검증 (상호작용 데이터 → 대면수업 솔루션)

> **상태**: v1.0 · 2026-06-05 · **브랜치**: `feat/insights-report`
> **목적**: RQ2 핵심 기능 신규 구축 — 집계 상호작용 데이터를 자동 분석해 학생
> 취약 개념을 드러내고, 교수자의 차주 대면 수업 초점을 제안하는 **합성 계층**.
> **근거 문서**: [09-beta-program.md](../planning/09-beta-program.md) §3·§10(RQ2·성공지표),
> [10-research-data-model.md](../planning/10-research-data-model.md)(G1·G8),
> [11-analytics-dashboard.md](../planning/11-analytics-dashboard.md) §F·§H·§5,
> [08-cost-optimization.md](../planning/08-cost-optimization.md)(비용 가드레일).

---

## 1. 무엇을 만들었나 (갭 → 구현)

데이터 캡처(questions/quiz/attention/sessions)와 raw 차트는 있었으나 **집계를
자동 분석해 보고서로 합성하는 계층이 없었다**. 또한 재시청 히트맵 raw 백엔드가
"미도착" 상태였다. 둘을 함께 구축했다.

| 갭 | 구현 | 위치 |
|---|---|---|
| 재생 히트맵 raw 미도착(G1) | `watch_events` 적재 + 슬라이드별 집계 + `slide_engagement` 롤업 | `services/dashboard.py`, `api/v1/dashboard.py` |
| 합성 계층 부재 | 집계기 + Claude 경량 합성 + `class_briefings`(G8) | `services/insights/**` |
| 보고서 노출 부재 | `GET /insights/{id}/report` + CSV + 교수자 보고서 페이지 | `api/v1/insights.py`, `frontend .../report` |

---

## 2. 데이터 모델 (마이그레이션 0039)

[10번 문서](../planning/10-research-data-model.md)의 컬럼명과 **1:1**로 맞췄다(소급
수집 불가 — 09 §3). ORM 모델은 `app/models/`(타 창 소유)를 건드리지 않기 위해
`app/services/insights/models.py` 에 정의하고 `Base.metadata` 에 등록한다.

- **`watch_events`** (§3.1, G1) — append-only. event_type(play/pause/seek/
  segment_enter/segment_complete/rewatch/speed_change/ended), slide_index,
  position_seconds, client_ts/server_ts, meta(JSONB). 인덱스 `(session_id,
  server_ts)`·`(lecture_id, slide_index)`. 클라이언트가 배치(≤200건/요청)로 전송.
- **`slide_engagement`** (§3.2, G1) — 롤업. (lecture_id, slide_index, session_id)
  유니크. 보고서 생성 시 강의 전체행(session_id=NULL) 재계산 → 재현 스냅샷.
- **`class_briefings`** (§3.10, G8) — payload(JSONB: summary/weak_concepts/
  recommendations/class_vs_individual), model, source_window(재현성).

> 마이그레이션은 0036(qa_answer_cache)의 검증된 패턴을 따른다(enum 명시 create/
> drop, JSONB, FK CASCADE). `alembic heads` = 단일 head `0039`. **이 창이 유일한
> 0039·main.py 소유자**(타 창과 합의).

---

## 3. 집계 (aggregator.build_aggregate)

강의별 신호를 한 dict 로 모은다 — 보고서 evidence 와 Claude grounding 의 단일 진실.

| 신호 | 출처 | 산식 |
|---|---|---|
| 완주율·진도 | `learning_sessions` | status=completed 비율, 평균 progress_pct |
| 퀴즈 오답 패턴 | `assessment_results` | 카테고리별 정답률, 오답 TOP(대시보드 get_scores 재사용) |
| RAG 거부·반복 질문 | `qa_logs`, `qa_answer_cache` | 거부율, cluster_key별 대표 질문(폴백: 텍스트 빈도) |
| 재시청 히트맵 | `watch_events` | replays=rewatch+(진입−진입세션), drops=진입−완료 |
| 딴짓 경고 | `learning_sessions` | warning_level 합·다발 학생 수, no_response_cnt |

**취약 개념 도출**(11 §H-2): 저정답률 카테고리(<70%, 표본≥3) + 고이탈 슬라이드
(drops≥2) + 고거부 토픽(거부율≥20%). 각 항목은 `severity(0~1)` + `evidence`(원수치)
+ 근거 링크(카테고리·슬라이드 index). 임계값은 베타 가정으로 문서화(학기 중 보정).

**개별 신호**(11 §E·§H-4): 진도 미달(<50%)·저성취(<60%)·무반응 다발(≥3) 학생을
취약 우선 정렬.

---

## 4. Claude 합성 + 비용 가드레일 (08 준수)

`briefing.generate_briefing` — 집계 → 합성 → `class_briefings` 저장.

- **경량 모델**: `settings.CLAUDE_MODEL`(Haiku, "공용 기본값"). 학생 인터랙션
  경로가 아니라 강의×주 1회 수준 — 가드레일 위험 낮음(11 §5).
- **환각 방지**: 시스템 프롬프트가 "제공된 집계 수치 외 인용 금지"를 강제하고,
  프롬프트에 집계 JSON 전체를 grounding 으로 주입. 출력은 구조화 JSON.
- **호출 상한**(비용 폭주 차단):
  - 재생성 최소 간격 6시간 — force(새로고침) 없으면 캐시(최신 브리핑) 반환.
  - 월 강의별 실제 Claude 호출 상한(백스톱) 초과 → 규칙 기반 폴백.
  - `CostLog(LLM_SUMMARY)` 서버 기록(교수자 UI 미노출 — 05 §1.1).
- **폴백**: `ANTHROPIC_API_KEY` 미설정/예외/JSON 파싱 실패 → **규칙 기반 합성**.
  키 없이도 결정적으로 동작(개발·테스트·오프라인·상한 초과). `model="rule-based-mock"`.

---

## 5. API & 화면

- `GET /api/v1/insights/{lecture_id}/report?refresh=&week=` — 집계 evidence +
  AI 브리핑. 교수자 본인 강의만(`assert_professor_owns_lecture`).
- `GET /api/v1/insights/{lecture_id}/report.csv` — 3섹션 CSV(취약개념/권고/개별), BOM.
- `POST /api/v1/dashboard/watch-events` — 학습자 재생 이벤트 배치 적재(세션 소유권 검증).
- `GET /api/v1/dashboard/{lecture_id}/watch-heatmap` — 슬라이드별 재시청·이탈.
  추가로 기존 `/engagement` 응답에 `slides` 를 포함시켜 분석 페이지 WatchHeatmap 자동 활성화.

**프론트**(`/professor/analytics/[id]/report`): 라이트 베이지+골드 v2 토큰,
localStorage 미사용, `prefers-reduced-motion` 존중, 한자 강조(`withHan` → `--font-han`
+ `--gold-on-light`). KPI 스트립 + 요약 + 취약 개념(근거 칩) + 권고 카드 + 학급/개별.
분석 상세 페이지 헤더에 "솔루션 보고서" 진입 버튼 추가.

---

## 6. 베타 연구(09 §3) 측정 스키마 정렬

| 09 §3 범주 | 본 작업 정렬 |
|---|---|
| 질문 이벤트(거부·클러스터) | `qa_logs`+`qa_answer_cache` 집계 → qa.rejection_rate·repeated_clusters |
| 시청(구간 체류·재시청·완주) | **`watch_events`/`slide_engagement` 신규** → watch heatmap |
| 교수자 루프(데이터 기반 행동) | `class_briefings` 저장 = RQ2 개입 산출물(권고 채택 로깅 `instructor_actions` 는 후속) |
| 성과(정답률) | `assessment_results` → quiz.by_category·weak_concepts |

성공 지표(09 §10) "교수자가 데이터로 대면 수업을 바꾼 횟수"의 **발생 지점**(보고서
권고)을 만들었다. 권고 채택→`instructor_actions`(G3) 로깅은 별도 후속 작업으로 남긴다.

---

## 7. 검증

### 자동 (backend/tests/test_insights.py — 9 PASS)
- 재생 이벤트 배치 적재 + 슬라이드별 집계(drops/replays/completion 수치 검증).
- 미지 event_type 무시(전방호환), 타인 세션 적재 404, 학습자 전용(교수자 403).
- 보고서: 소유 교수자 200 / 학습자 403 / 비소유 교수자 404.
- 규칙 기반 경로 스키마·플래그(model=rule-based-mock, is_ai_generated=false).
- 저정답률 카테고리가 evidence.weak_concepts 에 드러남.
- 재생성 간격 내 캐시(같은 브리핑 id) — 비용 가드레일.
- CSV 다운로드(text/csv, attachment, 헤더 텍스트).

### 회귀
- 백엔드 전체(비통합): **866 passed, 10 skipped, 3 xfail, 3 xpass** — 무회귀.
- 프론트: `tsc --noEmit`·`eslint` — 신규 파일 0 오류(기존 무관 오류 제외).
- `alembic heads` = 단일 head `0039`(0038←0039), 마이그레이션 import OK.

### 수동(운영 전 권장)
- staging Postgres 에 `alembic upgrade head` 적용해 0039 실DB 검증(pgvector 환경).
- `ANTHROPIC_API_KEY` 설정 후 실제 Claude 합성 1회 — JSON 파싱·CostLog 기록 확인.
- 슬라이드쇼 플레이어 연동 시 watch-events 배치 전송 → 히트맵 표시 확인.

---

## 8. 후속(범위 외 — 의도적 분리)

- 권고 채택/수정 → `instructor_actions`(G3) 로깅(RQ2 행동 계측 완성).
- 학생별 격려 메시지 발송 액션(11 §H-4) + 발송 로그.
- `cohort_daily_metrics`(C 추이)·`learning_goals`(H-3 달성률)·survey 척도.
- slide_engagement 학생별 행 + 야간 배치 롤업(스케일 시).
