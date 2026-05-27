# 연구·계측 데이터 모델 (베타 로깅 스키마)

> **상태**: 설계 v0.1 · 2026-05-27
> **목적**: [09-beta-program.md](./09-beta-program.md) §3의 로깅 스키마를 구현 가능한 데이터 모델로 구체화. **빌드 전 확정 필수** — 9월에 못 모은 데이터는 소급 불가.
> **스택**: SQLAlchemy 2.0 (`Mapped`/`mapped_column`) + PostgreSQL(pgvector) + Alembic. 관례: UUID PK(`default=uuid.uuid4`), `DateTime(timezone=True)` + `server_default=func.now()`, FK `ondelete="CASCADE"`, JSONB, 핫패스 인덱스.
> **관련 코드**: `backend/app/models/`, `backend/alembic/versions/`

---

## 1. 기존 자산 (재사용 — 새로 만들지 말 것)

현 스키마에 이미 상당 부분이 있다. 갭만 채운다.

| 테이블 | 모델 | 연구 용도 | 상태 |
|---|---|---|---|
| `learning_sessions` | `session.py` | 시청 진행·집중도 **집계**(watched_sec, progress_pct, warning_level, no_response_cnt, pause) | ✅ 재사용 |
| `qa_logs` | `qa_log.py` | 질문·답변·`in_scope`·`top_similarity`·토큰/비용 | 🔧 **확장** |
| `questions` | `question.py` | 문항(type, difficulty, timestamp, slide index) | ✅ 재사용 |
| `responses` | `response.py` | 형성평가 응답(is_correct, video_timestamp, timestamp_valid) | 🔧 확장 |
| `assessment_results` | `assessment_result.py` | 평가 결과(question_type, is_correct, category) | 🔧 확장 |
| `slide_embeddings` | `embedding.py` | RAG 임베딩(pgvector, 1536d) — 클러스터 centroid 비교 기준 | ✅ 참조 |
| `video_renders` | `video_render.py` | 아바타 렌더(heygen_job_id, s3_video_url) — Q&A 클립 참조 | ✅ 참조 |

---

## 2. 갭 (연구를 위해 새로 필요한 것)

| # | 갭 | 해결 |
|---|---|---|
| G1 | **이벤트 단위 시청 로그 없음** (play/pause/seek/구간 체류/재시청) — 하트비트가 세션 집계만 갱신 → 재생 히트맵 불가 | 신규 `watch_events` + 롤업 `slide_engagement` |
| G2 | qa_logs에 **아바타 요청·캐시 적중·클러스터·언어** 없음 | `qa_logs` 컬럼 확장 + 신규 `qa_clusters` |
| G3 | **교수자 "데이터 기반 행동" 로그 없음** (RQ2 핵심) | 신규 `instructor_actions` |
| G4 | **검증 설문(ARCS/TAM/인지부하) 없음** | 신규 `survey_responses` |
| G5 | **연구 동의·실험군 배정·익명 PID 없음** | 신규 `research_participants` + `lecture_research_config` |
| G6 | **사전/사후 성취 구분 없음** | `assessment_results.occasion` 추가 |
| G7 | **시계열 코호트 지표 없음** (성취율 추이 라인) | 신규 `cohort_daily_metrics` |
| G8 | **AI 대면 수업 브리핑 저장소 없음** | 신규 `class_briefings` |
| G9 | **학습 목표/기준 없음** (달성률 before→after) | 신규 `learning_goals` |

> G7~G9는 [11-analytics-dashboard.md](./11-analytics-dashboard.md)(학습 분석 대시보드)를 동작시키기 위해 도출됨.

---

## 3. 신규/확장 테이블 명세

### 3.1 `watch_events` (신규 · append-only) — G1

세그먼트 단위 재생 이벤트. 재생 히트맵·이탈 분석·RQ1/RQ3의 1차 자료.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | UUID PK | |
| session_id | UUID FK→learning_sessions | CASCADE, index |
| user_id | UUID FK→users | CASCADE, index |
| lecture_id | UUID FK→lectures | CASCADE, index |
| event_type | Enum(`WatchEventType`) | play, pause, seek, segment_enter, segment_complete, rewatch, speed_change, ended |
| slide_index | Integer\|null | 세그먼트(슬라이드) 번호 |
| position_seconds | Float | 발생 시점 재생 위치 |
| from_position_seconds | Float\|null | seek의 출발 위치 |
| playback_rate | Float\|null | speed_change 시 |
| client_ts | DateTime(tz) | 클라이언트 시각(드리프트 분석) |
| server_ts | DateTime(tz) | server_default now() |
| meta | JSONB\|null | 확장 필드 |

- 인덱스: `(session_id, server_ts)`, `(lecture_id, slide_index)`
- **적재 전략**: 클라이언트가 이벤트를 **배치(예: 10초/20건마다)** 전송 → 단건 POST 폭주 방지. 슬라이드쇼 플레이어(08 §4.1)가 자연 발생원.
- **볼륨/보존**: 베타 규모(교수 5~15·학생 수백)에선 무리 없음. 스케일 시 월 파티셔닝 + 원시 이벤트 N개월 후 집계만 보존.

### 3.2 `slide_engagement` (신규 · 롤업) — G1

`watch_events` 야간 집계. 대시보드 히트맵을 싸게 그린다(원시 이벤트 직접 조회 X).

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | UUID PK | |
| lecture_id | UUID FK→lectures | index |
| slide_index | Integer | |
| session_id | UUID FK→learning_sessions\|null | null이면 강의 전체 집계행 |
| dwell_seconds | Float | 체류 합 |
| rewatch_count | Integer | 재시청 횟수 |
| drop_count | Integer | 이 슬라이드에서 이탈 |
| avg_completion_pct | Float | |
| rolled_up_at | DateTime(tz) | |

- 유니크: `(lecture_id, slide_index, session_id)`

### 3.3 `qa_logs` 확장 — G2

기존 컬럼 유지, 다음 추가:

| 추가 컬럼 | 타입 | 비고 |
|---|---|---|
| detected_language | String(8)\|null | ko / zh / mixed — 중+한 분석(전공 특수성) |
| avatar_requested | Boolean default False | "아바타로 듣기" 탭 여부 |
| avatar_served | Enum(`AvatarServe`) | none, cache_hit, cache_miss_queued, batch_rendered |
| cluster_id | UUID FK→qa_clusters\|null | index |
| answer_latency_ms | Integer\|null | 질문→텍스트 답변 지연(UX) |

### 3.4 `qa_clusters` (신규) — G2

질문 클러스터링 + 캐시 아바타 클립. 08 §5.3의 비용 통제 핵심.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | UUID PK | |
| lecture_id | UUID FK→lectures | CASCADE, index |
| centroid | Vector(1536) | slide_embeddings와 동일 차원, 유사도 0.9 매칭 |
| representative_question | Text | 대표 질문(클러스터 최빈/최초) |
| member_count | Integer default 1 | 누적 유사 질문 수 → 배치 상위 3 선정 |
| answer_text | Text\|null | 캐시된 텍스트 답변 |
| avatar_render_id | UUID FK→video_renders\|null | 배치 렌더된 아바타 클립 |
| avatar_status | Enum | none, queued, ready, failed |
| created_at / updated_at | DateTime(tz) | |

- 벡터 인덱스: `slide_embeddings`와 동일(ivfflat/hnsw, cosine)
- 야간 배치: `member_count` 상위 3 클러스터만 `avatar_status=queued` → 렌더(영상당 3렌더 상한).

### 3.5 `instructor_actions` (신규) — G3 · **RQ2 핵심**

교수자가 대시보드 데이터를 보고 **실제 한 행동**. 제품 가치이자 논문 핵심 발견.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | UUID PK | |
| instructor_id | UUID FK→users | index |
| lecture_id | UUID FK→lectures\|null | |
| course_id | UUID FK→courses\|null | |
| trigger_source | JSONB | 어떤 데이터가 촉발(예: `{"widget":"weak_slide","slide_index":7,"accuracy":0.32}`) |
| action_type | Enum(`TeachingActionType`) | reorder_offline_session, add_review_topic, create_supplementary_lecture, adjust_quiz, contact_student, none, other |
| description | Text\|null | 교수자 자유 기술 |
| next_session_date | Date\|null | |
| created_at | DateTime(tz) | |

- 수집 경로: ① 대시보드 클릭 자동 로그 + ② 인앱 1문항 폼("이 데이터를 보고 무엇을 하시겠어요?") + ③ 교수자 인터뷰 코딩.

### 3.6 `survey_responses` (신규) — G4

검증 척도(게재 가능성↑).

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK→users | index |
| lecture_id | UUID FK→lectures\|null | |
| session_id | UUID FK→learning_sessions\|null | |
| instrument | Enum(`Instrument`) | arcs, imms, tam, cog_load_paas, social_presence, nps, custom |
| occasion | Enum | pre, mid, post |
| item_code | String(32) | 문항 코드(예: ARCS_A1) |
| response_value | Float\|null | 리커트/수치 |
| free_text | Text\|null | |
| created_at | DateTime(tz) | |

### 3.7 `research_participants` + `lecture_research_config` (신규) — G5

연구 동의·익명 PID·실험군.

`research_participants`:

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK→users | unique |
| anonymized_pid | String(32) | **내보내기용 가명** — user_id와 매핑은 제한 테이블에만 |
| cohort | String(40)\|null | 모집 코호트 |
| consent_status | Enum | granted, declined, withdrawn |
| consent_version | String(16) | |
| consent_at | DateTime(tz)\|null | |

`lecture_research_config` (A/B 조건 — 강의 단위):

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | UUID PK | |
| lecture_id | UUID FK→lectures | unique |
| experiment_condition | Enum | chat_only, avatar_qa |
| avatar_render_budget | Integer default 3 | 영상당 렌더 상한 |

### 3.8 `responses` / `assessment_results` 확장 — G6

- `responses.started_at` (DateTime\|null) 추가 → **응답 지연(time-to-answer)** = responded_at − started_at, 인지부하 간접 지표. (기존 유니크 제약은 재시도 데이터를 막으므로, 재시도 분석이 필요하면 별도 `response_attempts` 검토 — 베타에선 보류)
- `assessment_results.occasion` (Enum: pre, post, formative, summative) 추가 → 사전/사후 성취 비교.

---

### 3.9 `cohort_daily_metrics` (신규) — G7

강의×일자별 코호트 지표 스냅샷. 성취율 추이 라인([11](./11-analytics-dashboard.md) §C). 야간 배치 적재.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | UUID PK | |
| lecture_id | UUID FK→lectures | index |
| metric_date | Date | |
| completion_rate / attendance_rate / avg_accuracy | Float | 완료·출석·평균 정답률 |
| question_count / active_learners | Integer | |
| avg_focus_score | Float\|null | 집중도(산식 §11) |
| created_at | DateTime(tz) | |

- 유니크: `(lecture_id, metric_date)`

### 3.10 `class_briefings` (신규) — G8

AI 대면 수업 브리핑 결과 저장([11](./11-analytics-dashboard.md) §H, §5).

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | UUID PK | |
| lecture_id | UUID FK→lectures | index |
| course_id | UUID FK→courses\|null | |
| week_no | Integer\|null | 주차 |
| generated_at | DateTime(tz) | |
| payload | JSONB | summary[]/recommendations[]/student_feedback[] 구조화 |
| model | String(40) | 생성 모델·버전 |
| source_window | JSONB | 집계 대상 기간·필터(재현성) |

### 3.11 `learning_goals` (신규) — G9

강의/주차별 학습 목표·기준 → 달성률 before→after([11](./11-analytics-dashboard.md) §H-3).

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | UUID PK | |
| lecture_id | UUID FK→lectures | index |
| week_no | Integer\|null | |
| goal_type | Enum | completion, accuracy, attendance, custom |
| target_value | Float | 목표치 |
| baseline_value | Float\|null | 기준(before) |
| description | Text\|null | |
| created_at | DateTime(tz) | |

---

## 4. RQ → 테이블 커버리지

| RQ | 근거 테이블 |
|---|---|
| RQ1 상호작용 양상 | `watch_events`, `qa_logs`, `responses`, `slide_engagement` |
| **RQ2 데이터→대면수업 루프** | `slide_engagement`+`assessment_results`(취약점) → **`instructor_actions`** |
| RQ3 상호작용형 vs 수동 성취 | `lecture_research_config`(조건) × `assessment_results`(occasion) × `learning_sessions`(완주) |
| RQ4 아바타 vs 텍스트 | `qa_logs`(avatar_served) × `survey_responses`(social_presence) |

---

## 5. 익명화·내보내기·윤리

- 연구 export는 **`anonymized_pid` 기준**. `user_id`↔PID 매핑은 접근 제한 테이블/뷰에만(09 §8 IRB).
- export 뷰: 위 테이블 조인 후 PII 제거 → CSV (Pro 기능 "원시 데이터 CSV" `01-pricing-policy.md:176` 재사용).
- **동의·삭제 정합**: 연구 옵트인 데이터는 IRB 기준 보존, 제품 "졸업 후 자동 삭제"(`CLAUDE.md`)와 분리. `consent_status=withdrawn` 시 연구 export에서 제외.

---

## 6. 마이그레이션 순서 (Alembic)

독립적이라 점진 적용 가능. 권장 순서:

1. `qa_logs` 확장 + `qa_clusters` (Q&A 비용 통제 + 분석 동시) — Phase 2와 함께
2. `watch_events` + `slide_engagement` (슬라이드쇼 플레이어와 함께) — Phase 1
3. `research_participants` + `lecture_research_config` (베타 시작 전 필수)
4. `instructor_actions` (대시보드와 함께) — RQ2
5. `survey_responses`, `assessment_results.occasion`, `responses.started_at`

> 1~3은 **9월 베타 전 반드시 머지**. 4~5는 학기 중 보강 가능하나 빠를수록 좋다.

---

## 7. 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-05-27 | G7~G9 추가 — cohort_daily_metrics·class_briefings·learning_goals (11번 학습 분석 대시보드 동작용) |
| 2026-05-27 | 문서 신설 — 기존 스키마 재사용 분석 + 6개 갭(watch_events/slide_engagement, qa_logs 확장+qa_clusters, instructor_actions, survey_responses, research_participants+lecture_research_config, occasion/started_at) 명세, RQ 커버리지, 익명화·마이그레이션 순서 |
