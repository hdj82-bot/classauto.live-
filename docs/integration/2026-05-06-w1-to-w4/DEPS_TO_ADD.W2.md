# DEPS_TO_ADD — W2 (TTS 파이프라인)

> 워크트리: `feat/tts-elevenlabs`
> 머지 시 메인 `requirements.txt` / `requirements-test.txt` 에 반영 필요.
> 본 워크트리는 의존성 추가를 직접 커밋하지 않는다 (W1 / W2 / W3 충돌 회피).

---

## 1. 런타임 의존성 (`backend/requirements.txt`)

W2 범위에서 **새로 추가해야 할 패키지는 없다**. 다음 두 패키지는 이미
`requirements.txt` 에 들어 있으므로 W2 의 ElevenLabs / Google TTS 코드는
재사용한다:

| 패키지 | 현재 핀 | W2 사용처 |
|--------|---------|-----------|
| `httpx>=0.27.0,<1.0.0` | 유지 | `app/services/pipeline/elevenlabs_client.py` 의 비동기 HTTP 호출 |
| `google-cloud-texttospeech>=2.21.0,<3.0.0` | 유지 | `app/services/pipeline/google_tts_client.py` 의 폴백 합성 |

`google-cloud-texttospeech` 의 transitive dep 인 `google-api-core` 가
`google.api_core.exceptions.{Unauthenticated, ResourceExhausted, InternalServerError, ServiceUnavailable, DeadlineExceeded}` 를 제공하므로 별도 추가 불필요.

---

## 2. 테스트 의존성 (`backend/requirements-test.txt`)

| 패키지 | 추가 라인 | 사유 |
|--------|-----------|------|
| `respx>=0.21.0,<1.0.0` | `respx>=0.21.0,<1.0.0` | `tests/test_tts_clients.py` 가 ElevenLabs httpx 호출을 가로채 401/429/5xx 분기와 voice cloning URL 을 검증한다. 미설치 시 `pytest.importorskip` 으로 통째 skip 되도록 작성했지만, CI 에서 통과 여부를 셀 수 있도록 정식 dev dependency 로 추가하는 것이 좋다. |

추가 라인 (붙여넣기용):

```text
# TTS / HeyGen httpx 통합 테스트 (respx-mock)
respx>=0.21.0,<1.0.0
```

> `respx` 는 httpx 의 transport 를 monkeypatch 해 실제 네트워크 없이
> request 검증과 mock response 를 제공한다. tenacity 와 마찬가지로 stdlib
> 으로 동등 구현이 가능하지만 (`httpx.MockTransport`), respx 가 라우트
> 매칭/호출 횟수/요청 검사 API 가 풍부해 표준화한다.

---

## 3. 환경 변수 (`.env.example`)

기존 W1 머지 시 이미 다음 변수가 들어가 있어 W2 에서 추가 변경 없음:

```env
# ── TTS: ElevenLabs (primary) ────────────────────────────────────────────────
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_MODEL_ID=eleven_multilingual_v2

# ── TTS: Google Cloud (fallback) ─────────────────────────────────────────────
GOOGLE_TTS_CREDENTIALS_JSON=
GOOGLE_TTS_LANGUAGE_CODE=ko-KR
GOOGLE_TTS_VOICE_NAME=ko-KR-Neural2-A
```

W2 코드는 위 키들이 비어있어도 import 시점에 실패하지 않으며,
`ELEVENLABS_API_KEY` 가 비어있으면 `ElevenLabsAuthError` 를 raise → 폴백
경로에서 Google TTS (ADC 또는 service account JSON) 가 동작한다.

---

## 4. 패키지 핀 변경 / 제거

없음.
