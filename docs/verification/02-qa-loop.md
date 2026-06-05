# 검증 보고서 — 학생 Q&A 상호작용 루프 (창 2)

> 대상: 학생 영상 내 질문 → RAG 텍스트 답변(즉시·무료) → 캐시 미스 시 클러스터 큐 적립
> → 야간 배치가 상위 클러스터만 아바타 렌더 → 다음날 유사 질문은 캐시에서 아바타 즉시 제공
> 작성: 2026-06-05 · 브랜치 `verify/qa-loop`
> 방식: 코드 정독 + 자동 테스트(기존 + 신규) + 교수자·학생 수동 스모크 절차 정의
> 연관 정책: [02-guardrails.md](../planning/02-guardrails.md), [09-beta-program.md](../planning/09-beta-program.md) §5
> 환경: 백엔드 테스트는 로컬 Python 3.12 venv 에서 전량 통과(아래 §3). HeyGen·Claude·OpenAI
> **실호출은 mock 으로만 검증** — 실 비용 end-to-end 는 교수자 수동 스모크(§6)에서 최종 확인.

---

## 0. 결론 (한 줄)

루프는 **설계(09 §5)대로 동작하며 회귀 테스트로 고정**했다. 본 창에서 **버그 3건을 소유 파일
내에서 수정**했다: ① 1차 가드레일(입력 500자) 서버 사이드 미강제, ② 캐시 아바타 답변의 투명성
표기(09 §5.2) 누락, ③ "영상당 3렌더"(09 §5) 영상 단위 한도가 야간 배치 누적분에 미적용.
**남은 미검증은 프로덕션 실호출 end-to-end(§6 수동 스모크)** 이며 코드가 아니라 교수자가 실제로
1회 돌려야 닫힌다. **가드레일(02) 위반 없음** — 범위 밖 답변·무제한 Q&A 없음(§5).

---

## 1. 실제 아키텍처 (코드 기준)

```
[질문]   POST /api/v1/qa  (api/v1/qa.py:ask_question, require_student)
  1차 가드레일  QARequest.question: Field(min_length=1, max_length=500)  ※ 본 창 추가
  #316 하드닝   본인 세션 & 세션.lecture == body.lecture 아니면 403(answer_question 미호출)
  RAG          services/pipeline/qa.py:answer_question
                 → retriever.search_similar_slides(top_k=3) → is_in_scope(≥0.7)
                 → 범위 밖이면 Claude 미호출·비용 0·OUT_OF_SCOPE_MESSAGE
                 → 범위 안이면 Claude 호출 → 텍스트 답변 + 토큰/비용
  로깅          QALog INSERT (질문/답변/in_scope/유사도/토큰/비용)
  아바타 캐시    qa_avatar.resolve_avatar_for_question (SAVEPOINT 로 격리 — 실패해도 텍스트 반환)
                 적중(유사도≥0.9 ready) → avatar payload(+matched_question)  ※ 투명성 필드 본 창 추가
                 미적중 → status=pending 적립(렌더 없음)
  응답          { answer, in_scope, avatar, cost_usd }

[적립]   qa_answer_cache (models/qa_answer_cache.py)
  status: pending → rendering → ready | failed
  pending   미적중 질문(클러스터 대기) — 즉시 렌더하지 않는다(실시간 HeyGen 금지)

[야간 배치]  tasks/qa_batch.py:run_qa_avatar_batch (celery beat)
  process_qa_avatar_batch = 진행중 폴링 → 신규 제출 → 재폴링
  _submit_pending:
    교수자별   budget.qa_render_quota_remaining (월 6 = 2영상×3, 09 §5)
    영상별     _lecture_renders_used_this_month → 영상당 TOP_CLUSTERS(=3) 한도  ※ 본 창 추가
    클러스터링  qa_avatar.cluster_pending (임베딩 코사인 그리디 ≥0.9)
              → size≥MIN_CLUSTER_SIZE & 대표 임베딩 보유 → size 내림차순 상위 N 선정
    제출       대표 질문 답변 TTS → HeyGen create_video(본인 talking_photo / 표준 avatar)
              예산 게이트 assert_qa_render_budget(월 한도 + 전역 $ 서킷 브레이커)
              멤버 전체 cluster_key 공유 + status=rendering
  _poll_inflight: heygen_job_id 보유 대표 행 폴링 → completed → S3 이전 → 형제까지 ready
                 (MOCK 은 get_video_status 가 즉시 completed → 같은 실행에서 ready 도달)

[다음날 적중]  resolve_avatar_for_question → find_ready_avatar(pgvector <=> / 파이썬 폴백)
              유사도≥0.9 ready 클립 → hit_count++ → avatar payload 즉시 반환
```

프론트(학생): `components/player/PlayerV2.tsx` 의 Q&A 패널. 텍스트가 본답, 아바타 클립은 부가.
적중 시 **"비슷한 질문에 대한 답변입니다: …"** 표기(본 창 추가).
프론트(교수): `app/professor/inbox/**` — Q&A 종합 리포트 뷰 + CSV 내보내기(`/api/v1/qa/export`).

---

## 2. 발견·수정한 버그 (소유 파일 내)

| # | 심각도 | 증상 | 근거 | 수정 위치 |
|---|---|---|---|---|
| B1 | 중 | `/api/v1/qa` 가 질문 길이를 서버에서 검증하지 않음 — 1만자 보고서 붙여넣기가 RAG/Claude 까지 도달 | 02 §3.1 (텍스트 ≤ 500자, "백엔드 서버 사이드 검증") | `api/v1/qa.py` `QARequest.question = Field(min_length=1, max_length=500)` |
| B2 | 중(투명성) | 캐시 아바타 클립을 "이 학생 질문"인 양 재생 — 어느 원 질문에 맞춰진 클립인지 미표기 | 09 §5.2 ("비슷한 질문에 대한 답변입니다" + 원 질문 표시) | `qa_avatar.py` payload 에 `matched_question` 추가 + `PlayerV2.tsx` 표기 + i18n `qaSimilarAnswer(Of)` |
| B3 | 중 | "영상당 3렌더"가 **단일 배치 실행 내에서만** 보장 — 인기 영상 하나가 여러 밤에 걸쳐 교수자 월 한도(6)까지 렌더 누적 가능 | 09 §5 (아바타 Q&A 영상당 렌더 = "영상 전체에서 3렌더") | `qa_batch.py` `_lecture_renders_used_this_month` + `min(TOP_CLUSTERS, remaining, lecture_remaining)` |

> B3 보충: 교수자 월 6렌더 한도는 **이미** 비용 상한을 막고 있었다(09 §5 "월 6렌더로 고정"). B3 은
> 비용 폭주가 아니라 **분배 충실도** 문제 — 한 영상이 6을 독식해 "2영상×3" 모델과 어긋나는 것을 막는다.
> 영상 단위 한도값은 별도 설정 신설(=config.py 변경, 금지) 대신 의미가 동일한 `QA_AVATAR_TOP_CLUSTERS`(=3)
> 를 재사용한다.

수정은 모두 **단독 소유 파일**에서만 했다. `config.py`·`budget.py`·`heygen.py`·`main.py`·마이그레이션·
스키마는 손대지 않았다(`_month_start` 등은 budget.py 에서 **읽기**만).

---

## 3. 자동 증명 (테스트)

실행: `backend/` 에서 (Python 3.12 venv, `HEYGEN_MOCK` 경로 — 외부 비용 ₩0)

```
python -m pytest tests/test_qa.py tests/test_qa_avatar.py tests/test_qa_rag.py -q
→ 28 passed
전체 백엔드: 866 passed, 10 skipped, 3 xfailed, 3 xpassed
  (10 errors = test_integration_* 의 실 PostgreSQL/pgvector 필요분 — 환경 한계, 본 변경 무관)
```

프론트: `node_modules/.bin/tsc --noEmit` 에서 `PlayerV2.tsx` 오류 0. i18n 키 일치 검사 +
inbox 테스트 `vitest run __tests__/scripts/checkI18nKeys ... __tests__/inbox` → 37 passed.

### 3.1 RAG 범위 제한 (2차 가드레일, 임계값 0.7) — `tests/test_qa_rag.py` (신설)

| 테스트 | 고정하는 사실 |
|---|---|
| `test_is_in_scope_threshold_boundary` | 0.70=통과, 0.6999=거부, 결과 없음=거부, 첫 결과(최고 유사도) 기준 |
| `test_is_in_scope_respects_explicit_threshold` | 임계값 주입 가능(0.8) |
| `test_answer_question_out_of_scope_skips_claude` | 범위 밖이면 **`anthropic.Anthropic` 미생성** + 비용 0 + OUT_OF_SCOPE_MESSAGE |
| `test_answer_question_no_results_skips_claude` | 검색 결과 0건도 동일(거부·비용 0) |
| `test_answer_question_in_scope_calls_claude` | 범위 안에서만 Claude 호출·토큰·비용 채움 |

### 3.2 학생 권한 검증 (#316 하드닝 회귀 방지) — `tests/test_qa.py` (기존)

`test_ask_question_rejects_foreign_session` / `_rejects_lecture_mismatch` / `_rejects_missing_session`
모두 403 + `answer_question.assert_not_called()`(비용 발생 경로 차단). 교수자 호출 403.

### 3.3 1차 가드레일: 입력 길이 — `tests/test_qa.py` (신설)

`test_ask_question_rejects_overlong_question`(501자→422, 미호출) /
`_rejects_empty_question`(빈 문자열→422) / `_allows_500_char_boundary`(500자→200).

### 3.4 캐시 적중/미스·클러스터링·투명성 — `tests/test_qa_avatar.py`

| 테스트 | 고정하는 사실 |
|---|---|
| `test_resolve_out_of_scope_no_accrual` | 범위 밖은 적립·캐시 모두 없음(avatar=None) |
| `test_resolve_miss_accrues_pending` | 미적중 → status=pending 적립(텍스트 답변 보존), 실시간 렌더 없음 |
| `test_resolve_hit_returns_avatar_and_increments` | 적중 → payload(ready·video_url·cache_id·**matched_question**) + hit_count++, 새 pending 없음 |
| `test_cosine_similarity_basics` / `cluster_pending_*` / `representative_prefers_hit_count` | 코사인·그리디 클러스터·대표 선정 |

### 3.5 야간 배치·하드캡·예산 (mock) — `tests/test_qa_avatar.py`

| 테스트 | 고정하는 사실 |
|---|---|
| `test_batch_pending_to_ready_in_mock` | pending→ready 자체 폴링 완성, 대표 1개만 job_id·형제 클립 공유 |
| `test_batch_uses_talking_photo_for_self_avatar` | 본인 아바타 → talking_photo_id 경로 |
| `test_batch_uses_avatar_id_for_standard_avatar` | 강의 지정 표준 아바타 → avatar_id 경로 |
| `test_batch_respects_monthly_render_cap` | 교수자 월 한도 2 → 2건만 제출, 나머지 pending |
| `test_batch_caps_renders_per_lecture_across_nights` (신설) | **영상당 3렌더** — 1차 3건, 2차 0건, 영상 렌더 합계 정확히 3, 잔여 3 pending |
| `test_qa_render_budget_quota` | `assert_qa_render_budget` 가 월 한도 소진 시 `QARenderQuotaError` |

---

## 4. 코드 정독으로 확인(테스트 없이도 성립하는 불변식)

- **실시간 HeyGen 렌더 없음**: `resolve_avatar_for_question` 미적중 경로는 `accrue_pending`(DB 적립)만
  한다. HeyGen `create_video` 호출은 오직 `qa_batch._submit_cluster`(야간 배치)에만 존재.
- **텍스트 답변 가용성 우선**: 아바타 캐시 처리는 `db.begin_nested()`(SAVEPOINT) + `except`로 격리 —
  임베딩/캐시/적립 어떤 실패도 텍스트 답변·QALog 를 막지 않는다(qa.py).
- **임베딩 실패 graceful**: `embed_question` 실패 시 None → 적립은 되되(텍스트 보존) 임베딩 없는 행은
  배치 eligible 필터(`대표 임베딩 보유`)에서 자연 배제 → 잘못 렌더되지 않음.
- **클러스터 형제 일관성**: 완료 시 `_mark_cluster_ready` 가 같은 `cluster_key` 형제까지 동일
  `s3_video_url`·ready 로 전이 → 클러스터 내 모든 유사 질문이 같은 클립으로 적중.
- **본인 아바타 미준비 시 보류**: `_resolve_character` 가 talking_photo 확보 실패면 `None` 반환 →
  rendering 전이 전에 pending 유지(잘못된 avatar_id 로 렌더하지 않음).
- **예산 이중 방어**: 교수자 월 렌더 수 한도(mock 에서도 적용) + 전역 $ 서킷 브레이커(mock 면제).

---

## 5. 가드레일(02) 위반 점검 — 통과

| 방어선 | 상태 | 근거 |
|---|---|---|
| 1차 입력 제약 | ✅ 강제 | 서버 `Field(max_length=500)`(본 창) + 프론트 카운터(500/500). 첨부 미지원 |
| 2차 의미 필터(0.7) | ✅ 강제 | `is_in_scope(≥0.7)` 미만이면 Claude 미호출·비용 0 (§3.1) |
| 3차 빈도 한도 | ⚠️ 부분 | 전역 `RateLimitMiddleware`(Redis 슬라이딩 윈도우)가 `/api/v1/qa` 에도 적용돼 **절대 무제한은 차단**. 단, 02 §5.1 의 **플랜별 Q&A 한도 매트릭스(편당/일/월)는 미구현** — §7 플래그 |
| 4차 이상 탐지 | ⚠️ 범위 밖 | 시간당 배치 이상 탐지(02 §6)는 본 루프 소유 아님 — §7 플래그 |
| 다크 표면 | ✅ 허용 범위 | 학생 player 는 `PlayerSurfaceDark` — CLAUDE.md "다크 표면은 학생 영상 시청 player 한정"에 부합 |
| localStorage 금지 | ✅ 미사용 | `components/player/**`·`app/v/**` 에 localStorage 사용 0(grep 확인) |
| 범위 밖 답변 금지 | ✅ | 범위 밖은 거부 메시지만, LLM 호출 자체가 없음 |

---

## 6. 수동 스모크 절차 (코드로 닫을 수 없는 실호출 부분)

> 전제: `HEYGEN_MOCK=false`, 실 키(ANTHROPIC/OPENAI/HEYGEN) 설정, 교수자 베이스 아바타(룩 ready) 1개,
> 임베딩까지 끝난 발행 강의 1개.

### 6.1 학생 — 즉시 텍스트 + 거부 + (다음날) 캐시 아바타
1. 학생 계정으로 `/v/{slug}` 진입 → 세션 생성. Q&A 패널에 강의 내용 질문 입력.
   - 기대: **즉시** 텍스트 답변 + 출처. 아바타 없음(첫 질문이라 캐시 미스).
2. 강의와 무관한 질문(예: "오늘 환율 알려줘") 입력.
   - 기대: "강의 범위 밖" 메시지. (개발자도구 Network: `cost_usd≈0`, `in_scope=false`.)
3. 501자 붙여넣기 시도 → 입력 카운터 한도/422. (서버 강제 확인.)
4. **같은/유사 질문을 여러 학생이 반복**(클러스터 형성) → 야간 배치 시각(`QA_AVATAR_BATCH_HOUR_UTC`,
   기본 UTC18=KST03) 이후, **다음날** 그 질문류 입력.
   - 기대: 텍스트 답변 위에 **"비슷한 질문에 대한 답변입니다: …"** + 아바타 클립 재생.
   - 영상 로드 실패해도 텍스트 답변은 남아야 함(부가성 확인).

### 6.2 교수자 — 하드캡·예산·인박스
5. 한 영상에 비유사 질문 클러스터를 6개 이상 쌓고 야간 배치를 2~3회(또는 `run_qa_avatar_batch` 수동)
   실행. → 기대: 그 **영상**에 최종 ready 렌더가 **정확히 3건**(나머지 pending). 교수자 월 합계 ≤ 6.
6. 교수자 `/professor/inbox` → 강의별 Q&A 목록·요약. "리포트 다운로드(CSV)" → 강의/영상/학생/학번/질문/
   답변/시각 컬럼, BOM(엑셀 한글) 정상. 타 교수자 강의는 안 보임(소유 검증).
7. (선택) `qa_answer_cache` 에서 `instructor_id` 별 `heygen_job_id IS NOT NULL` 월 카운트가 ≤ 6,
   `lecture_id` 별 ≤ 3 임을 확인.

---

## 7. 남은 플래그 (본 루프 소유 밖 — 별도 결정/창 필요)

1. **플랜별 Q&A 빈도 매트릭스(02 §5.1)** 미구현 — 편당 20/100/∞, 일 30/100, 월 500/2000 카운터
   (Redis `counter:user:*` 패턴). 전역 RateLimitMiddleware 가 무제한은 막으나 플랜 차등은 없음.
   프론트 `PlayerV2` 의 쿼터 표시("편당 100", "오늘 12/30")는 **하드코딩 placeholder** — 실 카운터
   연동 전까지 실제 수치가 아님. 구현은 구독/플랜 티어 배선 + Redis 카운터로 별도 작업 권장.
2. **이상 탐지(02 §6)** — 시간당 배치 매크로/봇 탐지는 본 루프 외.
3. **범위 밖 거부 UI 버튼(02 §4.3 [교수님께 전달]/[취소])** — 백엔드 거부·무과금은 완비됐으나
   프론트는 거부 메시지 텍스트만 표시하고 전달 버튼·엔드포인트는 미배선. UX 보강 항목.
4. **임베딩 없는 pending 누적** — 임베딩 실패로 적립된 행은 렌더되지 않고 영구 잔류(비용 0이나
   테이블 누적). 정리(cleanup) 정책은 추후.

---

## 8. 변경 파일 요약 (본 창)

```
backend/app/api/v1/qa.py                 B1: 입력 500자 서버 검증
backend/app/services/pipeline/qa_avatar.py  B2: payload matched_question
backend/app/tasks/qa_batch.py            B3: 영상당 렌더 한도(누적)
backend/tests/test_qa.py                 B1 테스트 3종
backend/tests/test_qa_rag.py             RAG 0.7 범위 제한 테스트(신설)
backend/tests/test_qa_avatar.py          B2·B3 테스트 + matched_question 단언
frontend/src/components/player/PlayerV2.tsx  B2: 투명성 표기 + matchedQuestion
frontend/messages/ko.json, en.json       i18n qaSimilarAnswer(Of)
docs/verification/02-qa-loop.md          본 문서(신설)
```
