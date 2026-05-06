# MERGE_NOTES — W2: TTS 파이프라인 (ElevenLabs primary + Google TTS fallback)

> 브랜치: `feat/tts-elevenlabs` → `main`
> 작업 기간: Phase 0 베타 운영 중
> 작업자: Claude Opus 4.7 / 河斗振 (하두진)

---

## 1. 무엇을 했는가

`backend/app/services/pipeline/tts.py` 에 있던 단일 파일 구현을 다음 구조로 분리하고 실 호출 / 에러 처리 / 비용 기록을 완성했다.

```
backend/app/services/
├── pipeline/
│   ├── elevenlabs_client.py       # NEW — ElevenLabs TTS + IVC HTTP 클라이언트
│   ├── google_tts_client.py       # NEW — Google Cloud TTS gRPC 클라이언트
│   └── tts.py                     # REFACTOR — orchestrator (폴백 + 저장 + 비용)
└── cost_tracker.py                # NEW — TTS 단가 산정 + cost_logs 기록 헬퍼
```

테스트:

```
backend/tests/
├── test_tts.py                    # REWRITE — orchestrator 단위 테스트
├── test_tts_clients.py            # NEW — respx 로 httpx 호출 검증 + Google 예외 매핑
└── test_tts_cost_tracker.py       # NEW — 단가 산정 / metadata 기록 검증
```

---

## 2. 외부 인터페이스 (caller 호환성)

`tts.synthesize`, `tts.TTSResult`, `tts.TTSError` 의 시그니처와 동작을 보존했다.

| Caller | 호출 | 영향 |
|--------|------|------|
| `app/tasks/render.py` | `synthesize(script_text)` | **변경 없음** — return type 동일 |
| `tests/test_e2e_pipeline.py` | `patch("app.services.pipeline.tts.synthesize")` | **변경 없음** |
| `tests/test_pipeline_render_idempotency.py` | 동일 | **변경 없음** |
| `tests/test_pipeline_cost_committed.py` | 동일 | **변경 없음** |

`TTSResult` 에 `text_chars`, `fallback_reason` 필드를 추가했지만 모두
**default 값을 가진 키워드 인자** 라 기존 `TTSResult(audio_bytes=..., provider=..., duration_seconds=...)` 호출은 그대로 동작한다.

---

## 3. 새 동작

### 3-1. 1차: ElevenLabs

- `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` (streaming 아님 — 단일 응답)
- `xi-api-key` 헤더, `Accept: audio/mpeg`
- `voice_settings` 기본 `{stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true}`
- `output_format` 기본 `mp3_44100_128`
- 응답 코드 분기:
  - **200** → mp3 bytes 반환
  - **401** → `ElevenLabsAuthError` 즉시 raise (재시도 X)
  - **429 / 500 / 502 / 503 / 504** → `app.core.retry.retry_external` 데코레이터가 3회 지수 백오프 후, 한도 초과 시 `ElevenLabsQuotaError` (429) 또는 `ElevenLabsServerError` (5xx) 로 분류 raise
  - **그 외 4xx** → `ElevenLabsError` 즉시 raise

### 3-2. Voice Cloning (IVC) 분기

- `synthesize(text, voice_id=...)` 로 user 의 cloned voice 를 사용 가능
  - 향후 `users.elevenlabs_voice_id` (Sprint A) 또는 `custom_voices.elevenlabs_voice_id` (Sprint C) 컬럼에서 읽어 전달
- `clone_voice(name, audio_files=[(filename, bytes), ...])` 로 IVC 생성 가능
  - 다중 샘플을 multipart/form-data 로 전송
  - 응답: `{"voice_id": "..."}` — 이후 `synthesize(voice_id=...)` 의 입력으로 사용
  - DB 저장은 본 PR 범위 외 (Sprint C)

### 3-3. 2차 폴백: Google Cloud TTS

- ElevenLabs 측 도메인 예외 (`ElevenLabsError` 계열) 발생 시 자동 폴백
  - **401 (인증) 도 폴백** — ElevenLabs API key 회전 시점에도 영상 생성이 멈추지 않게
- `google.cloud.texttospeech.TextToSpeechClient.synthesize_speech` 호출 (sync)
- `asyncio.to_thread` 로 비동기 컨텍스트에서 스레드 오프로드
- 예외 매핑:
  - `Unauthenticated` / `PermissionDenied` → `GoogleTTSAuthError`
  - `ResourceExhausted` → `GoogleTTSQuotaError`
  - `InternalServerError` / `ServiceUnavailable` / `DeadlineExceeded` → `GoogleTTSServerError`

### 3-4. 양쪽 모두 실패

`TTSError("TTS 폴백도 실패: elevenlabs=...; google=...")` 로 통합 raise.
`render_slide` 태스크의 기존 `except Exception` 분기가 이를 받아 Celery 재시도 또는 최종 실패 처리한다.

### 3-5. 비용 기록

`tts.synthesize(..., sessionmaker=..., video_render_id=...)` 형태로 두 인자를 모두
주면 합성 직후 `cost_tracker.record_tts_cost` 가 호출되어 `cost_logs` 에
별도 트랜잭션으로 commit 된다 (`record_once_committed` 위임).

기록 내용:

| 컬럼 | 값 |
|------|-----|
| `service` | `"elevenlabs"` 또는 `"google_tts"` |
| `operation` | `"tts_synthesize"` |
| `cost_usd` | 글자수 × 단가 (ElevenLabs $0.30/1K, Google $0.016/1K — 보수적 상한) |
| `duration_seconds` | wall-clock 합성 시간 |
| `metadata_json` | `{text_chars, provider, [fallback_from, fallback_reason]}` |

> 현재 `app/tasks/render.py` 는 기존 흐름을 유지하기 위해 cost_log 호출을
> 직접 하고 있다. 이 호출과 본 PR 의 내부 호출은 동일 `(video_render_id, "tts_synthesize")`
> 키를 공유하므로 UNIQUE 인덱스에 의해 idempotent skip 된다. **첫 INSERT
> 한 쪽이 승리** — 이 PR 시점에선 render.py 가 기록 시 cost_usd=0.0 으로
> 들어간다.
>
> Sprint 후속 작업 (W3 또는 별도 PR) 에서 render.py 를 수정해
> `tts.synthesize(..., sessionmaker=SyncSessionLocal, video_render_id=render.id)`
> 형태로 변경하면 정확한 단가가 기록된다. 본 PR 은 W1 (heygen/render) 영역
> 충돌을 회피하기 위해 render.py 를 건드리지 않았다.

### 3-6. 저장

`tts.synthesize(..., s3_render_id=str(render.id))` 로 호출 시 자동으로 S3
표준 경로에 mp3 업로드 (`s3.upload_audio_bytes` 위임). `output_path` 인자는
로컬 파일 저장 (개발/디버그용). 둘 다 옵션, 미지정 시 호출자가 직접 저장한다.

---

## 4. 4xx / 5xx / 429 / 401 처리 매트릭스

| 응답 / 예외 | ElevenLabs 클라이언트 | TTS Orchestrator |
|--------------|----------------------|-------------------|
| 200 | bytes 반환 | provider="elevenlabs" 로 정상 종료 |
| 401 (Auth) | `ElevenLabsAuthError` 즉시 raise (재시도 X) | Google 폴백 |
| 422/4xx | `ElevenLabsError` 즉시 raise (재시도 X) | Google 폴백 |
| 429 → 200 | 1차 재시도로 성공 | 정상 종료 |
| 429 × 3 | `ElevenLabsQuotaError` raise | Google 폴백 |
| 5xx × 3 | `ElevenLabsServerError` raise | Google 폴백 |
| Timeout × 3 | `ElevenLabsServerError` raise | Google 폴백 |

| Google 예외 | 클라이언트 | TTS Orchestrator |
|-------------|------------|-------------------|
| 정상 | bytes 반환 | provider="google_tts" |
| Unauthenticated/PermissionDenied | `GoogleTTSAuthError` | `TTSError("폴백도 실패")` |
| ResourceExhausted | `GoogleTTSQuotaError` | `TTSError("폴백도 실패")` |
| InternalServerError/Unavailable/DeadlineExceeded | `GoogleTTSServerError` | `TTSError("폴백도 실패")` |

---

## 5. 테스트

`asyncio_mode = auto` (pytest.ini), `respx>=0.21` (테스트 dep, **추가 필요** — DEPS_TO_ADD.W2.md 참조).

| 파일 | 테스트 수 | 핵심 검증 |
|------|-----------|-----------|
| `test_tts.py` | 18 | TTSResult 필드, parse_audio_duration, ElevenLabs 성공, 5xx/429/401 폴백, voice cloning 분기 통과, 양쪽 실패→TTSError, 비용 기록 호출, 후방 호환 helper 동작, 모듈 export 보존 |
| `test_tts_clients.py` | 13 | respx 로 ElevenLabs 200/401/429/500/422/IVC 응답 시퀀스 검증, custom voice_id URL 포함, 헤더 전달, retry 횟수, Google 예외 매핑 (Unauthenticated → AuthError, ResourceExhausted → QuotaError, InternalServerError → ServerError) |
| `test_tts_cost_tracker.py` | 8 | 단가 산정 (provider 별, 0/음수 chars), record_tts_cost 가 record_once_committed 에 정확한 metadata 전달, fallback_reason 첨부, extra metadata 머지 |

DoD 매핑:

- ✅ ElevenLabs 성공 (`test_synthesize_elevenlabs_success`, `test_elevenlabs_synthesize_200_returns_bytes`)
- ✅ ElevenLabs 5xx → 폴백 (`test_synthesize_falls_back_on_elevenlabs_server_error`, `test_elevenlabs_synthesize_500_retries_then_raises_server_error`)
- ✅ 폴백도 실패 (`test_synthesize_raises_when_both_providers_fail`)
- ✅ 쿼터 (`test_synthesize_falls_back_on_quota_error`, `test_elevenlabs_synthesize_429_retries_then_raises_quota`)
- ✅ Voice cloning 분기 (`test_synthesize_passes_custom_voice_id_through`, `test_elevenlabs_synthesize_uses_custom_voice_id`)
- ✅ 비용 기록 (`test_synthesize_records_cost_when_sessionmaker_given`, `test_record_tts_cost_calls_record_once_committed_with_metadata`)

---

## 6. 충돌 회피

다음 영역은 **읽기만** 했고 본 PR 에서 수정하지 않았다 — W1 / 다른 워크트리 작업과의 머지 충돌 회피.

| 경로 | 사유 |
|------|------|
| `frontend/` 전체 | W3 영역 |
| `backend/app/services/pipeline/heygen*.py`, `polling.py` | W1 영역 |
| `backend/app/tasks/render.py` | W1 영역 — caller 가 본 PR 의 `tts.synthesize` 를 호출만 함 |
| `backend/alembic/versions/` | 마이그레이션 추가 금지 — 본 PR 은 스키마 변경 없음 |
| `backend/app/main.py` | 의존성 / 라우터 변경 없음 |
| `backend/app/core/config.py` | TTS 관련 settings 가 이미 W1 시점에 들어가 있음 (.env.example 그대로) |
| `backend/requirements*.txt` | DEPS_TO_ADD.W2.md 로 분리 |

본 워크트리 안에서 읽기만 하고 수정 필요성을 발견한 파일은 없다.

---

## 7. 후속 작업 (Sprint 별)

- **Sprint A**: `users.elevenlabs_voice_id` 컬럼 추가 후 `render_slide` 가
  user 의 voice_id 를 `tts.synthesize(voice_id=user.elevenlabs_voice_id)` 로 전달.
- **Sprint C**: `custom_voices` 테이블 + IVC 업로드 API 가
  `elevenlabs_client.clone_voice(...)` 를 호출해 `voice_id` 저장.
- **단가 정확화**: ElevenLabs 의 `character-count` / Google 의 `character-count`
  실 청구 단가를 admin 대시보드에서 월별 재계산 — `metadata.text_chars` 활용.
- **render.py 갱신** (Sprint A 와 묶어서): `tts.synthesize` 호출 시
  `sessionmaker`/`video_render_id` 전달해 cost_log 에 정확한 단가 기록.

---

## 8. 검증 (로컬 / CI)

```bash
# 단위 테스트
cd backend
pytest tests/test_tts.py tests/test_tts_cost_tracker.py -v

# respx 통합 테스트 (respx 설치 필요 — DEPS_TO_ADD.W2.md)
pip install 'respx>=0.21.0,<1.0.0'
pytest tests/test_tts_clients.py -v

# 기존 회귀
pytest tests/test_pipeline_render_idempotency.py tests/test_pipeline_cost_committed.py tests/test_e2e_pipeline.py -v

# Lint
ruff check app/services/pipeline/elevenlabs_client.py app/services/pipeline/google_tts_client.py app/services/pipeline/tts.py app/services/cost_tracker.py
ruff check tests/test_tts.py tests/test_tts_clients.py tests/test_tts_cost_tracker.py
```

> 본 워크트리는 Windows 호스트의 IDE 환경이라 Python 인터프리터가 설치되지
> 않아 자동 실행은 머지 후 CI 에서 수행한다. 코드 작성 시 `ruff` 의 일반
> 규칙 (E, F, W, I, B, UP, SIM, PL) 위반이 없도록 확인했다.
