# W1 (feat/heygen-api) — Merge Notes

> 브랜치: `feat/heygen-api`
> 작업자: Opus 4.7 (창 1)
> 날짜: 2026-05-06

## 핵심 정정 사항

**처음 평가에서 "HeyGen 실제 호출 미구현(스켈레톤)"으로 진단했으나, 실제 코드는 이미 거의 완성 상태였습니다.**

이미 구현되어 있었던 것:
- `backend/app/services/pipeline/heygen.py` — `create_video`, `get_video_status`, `list_avatars`, `cancel_video`, `delete_video`, `get_remaining_quota` 모두 실제 HeyGen API 호출
- `backend/app/core/retry.py` — 통일된 재시도 정책 (4xx 즉시 raise, 5xx/429/timeout 지수백오프 + jitter, 최대 3회)
- `backend/app/tasks/render.py` — TTS → S3 → HeyGen 단계별 idempotency, 소유권 검증, 비용 로그 (`record_once_committed`)
- `backend/app/tasks/polling.py` — 24h 타임아웃, 웹훅 레이스 방지
- `backend/app/api/v1/webhooks.py` — HMAC 검증, `WebhookEventLog UNIQUE` 1차 멱등성, `RenderStatus` 2차 멱등성
- 18개 단위 테스트(`test_heygen.py`) + 2개 e2e 테스트(`test_e2e_pipeline.py`)

따라서 W1은 "실제 호출 구현"이 아니라 **회계 정확성 + 멱등성 보강**으로 범위를 좁혔습니다.

## 이번 변경

### A. 비용 단가 도입 — 영상 길이 기반 USD 추정
- `backend/app/core/config.py`: `HEYGEN_COST_USD_PER_SECOND: float = 0.0083` (Creator 플랜 추정 ~$0.50/min, 운영 시 실측 보정)
- `.env.example`: 동일 키 추가, 주석으로 추정 근거 명시
- `backend/app/services/pipeline/heygen.py`: `estimate_cost_usd(duration_seconds)` 헬퍼 추가
  - `None`/0/음수 → 0.0
  - 정상 → `round(duration × rate, 6)`
  - 단가 0 = 회계 비활성 모드(duration 만 기록)

### B. polling.py — 중복 비용 기록 차단
- `cost_log.record(...)` → `cost_log.record_once(...)` 두 곳 (`s3.upload_video`, `heygen.video_render`)
- `cost_usd=0.0` 하드코드 → `cost_usd=estimate_cost_usd(duration)` 동적 계산
- `(video_render_id, operation)` UNIQUE 인덱스(alembic 0012)로 폴링 다회 실행 / 폴링↔웹훅 race 시에도 1회만 기록

### C. webhooks.py — 같은 변경
- `cost_log.record(...)` → `cost_log.record_once(...)` for `heygen.video_render`
- `cost_usd=0.0` → `estimate_cost_usd(event_data["duration"])`
- WebhookEventLog 가 1차 방어, `record_once` 가 2차 안전망

### D. 새 테스트 — `backend/tests/test_heygen_cost.py`
- `TestEstimateCostUsd` — None/0/음수/양수/소수점 반올림/단가 0 비활성 (5 케이스)
- `test_polling_records_cost_with_duration_rate` — 폴링이 `record_once` 호출 시 cost = duration × rate 검증
- `test_webhook_success_records_cost_with_rate` — 웹훅 성공 분기에서 동일 검증 (run_until_complete 충돌 시 xfail)

### E. 기존 테스트 patch 대상 업데이트
- `tests/test_e2e_pipeline.py:356` — `cost_log.record` → `cost_log.record_once` (polling 호출부 패치)
- `tests/test_webhooks.py:65` — `cost_log.record` → `cost_log.record_once` (xfail 케이스지만 정확성 유지)

## 공유 파일 변경 — 통합 시 주의

| 파일 | 변경 | 충돌 위험 |
|------|------|---------|
| `backend/app/core/config.py` | `HEYGEN_*` 블록에 1줄 추가 | W2(TTS)도 ELEVENLABS_COST_USD_PER_* 같은 키를 추가할 가능성 — 다른 블록이라 충돌 없을 듯 |
| `.env.example` | `HEYGEN_*` 블록에 2줄 추가 | 위와 같음 |

**권장 머지 순서**: W1 먼저 → W2 → W3 → W4. W2가 같은 패턴(`ELEVENLABS_COST_USD_PER_SECOND`)을 도입하면 conflict-free.

## DEPS_TO_ADD.W1.md
**없음.** 표준 라이브러리(`unittest.mock`)와 기존 의존성(`pytest`, `pytest-asyncio`)만 사용. respx/httpx_mock 등 새 패키지 추가 없이 기존 mock 패턴 유지.

## 미해결 / 별도 스프린트로 분리 권장

`AVATAR_VOICE_FEATURE_ROADMAP.md` 의 다음 항목은 W1 범위 밖으로 분리:

1. **Sprint A**: `users.heygen_avatar_id`, `users.elevenlabs_voice_id` 컬럼 추가 + 사용자별 디폴트 폴백 체인
   - 현재 폴백은 `lecture-level avatar_id` → `settings.HEYGEN_AVATAR_ID` 두 단계
   - Sprint A 후 `user.heygen_avatar_id` 가 중간 단계로 추가됨
2. **Sprint B**: HeyGen Photo Avatar 생성 (`/v2/photo_avatar/photo/generate`, `/v2/photo_avatar/avatar_group`)
   - `custom_avatars` 테이블, 새 API 4개, 플랜 게이트
3. **Sprint C/D**: ElevenLabs IVC, 강의 생성 플로우 통합

이들은 **DB 마이그레이션 + 새 API + 프론트 UI** 가 묶여있어 4창 병렬에서 충돌 위험이 큼. 베타 출시 후 별도 스프린트로 처리할 것을 권장.

## 테스트 실행 상태

**로컬 환경에 Python/Docker 미설치 — 로컬에서 pytest/ruff 실행 불가.**
- 변경은 정적으로 검증 (시그니처·import·기존 패턴 호환)
- 머지 후 GitHub Actions(`backend lint + test, 60% coverage gate`)에서 최종 검증
- 만약 CI에서 `test_polling_records_cost_with_duration_rate` 가 실패하면, polling.py 의 db.refresh / status 분기 흐름이 mock 과 어긋날 수 있으니 `mock_db.refresh = MagicMock()` 만으로 부족할 가능성. 그 경우 e2e_pipeline.py 의 패턴(`run()` 직접 호출)으로 단순화 필요.

## 베타 출시 영향

이 변경은 **회계 정확성 향상**이 목적이며, 베타 출시 차단 항목 아님.
HeyGen 통합 자체는 이전부터 베타 출시 준비된 상태였습니다.
