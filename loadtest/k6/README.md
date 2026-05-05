# k6 baseline load test (`loadtest/k6/scenarios.js`)

기존 Locust 시나리오(`loadtest/locustfile.py`)와 별개로, 짧은 베이스라인 측정용
k6 스크립트입니다. CI / 스모크 / 회귀 비교에 적합합니다.

## 시나리오

| # | 이름 | RPS | 기간 | VU | 인증 | 비고 |
|---|------|-----|------|----|------|------|
| 1 | `anon_health`    | 100 | 30s  | 50  | ✗ | `GET /health` 베이스라인. p95 < 200ms |
| 2 | `lectures_list`  | 50  | 60s  | 25  | ✓ | `GET /api/v1/lectures` 핫 패스. p95 < 500ms |
| 3 | `ppt_render`     | 1   | 10s  | 1   | ✓ | PPT 업로드 → 렌더 요청. **외부 API 비용 ↑** — 의도적 저 RPS |

기본 thresholds (전 시나리오 합산):
- `http_req_duration p(95) < 500ms`
- `http_req_failed < 1%`

## 실행

### 0) 사전 준비
```bash
# Windows: choco install k6
# macOS:   brew install k6
# Linux:   https://grafana.com/docs/k6/latest/set-up/install-k6/
k6 version
```

### 1) 환경변수
| 변수 | 필수 | 설명 |
|------|------|------|
| `BASE_URL`    | ✗ | 대상 호스트 (기본 `http://localhost:8000`) |
| `JWT`         | 시나리오 2/3 | 인증 토큰 (Bearer) |
| `LECTURE_ID`  | 시나리오 3 | 업로드 대상 강의 UUID |
| `K6_SCENARIO` | ✗ | 단일 시나리오만 실행 (`anon_health` / `lectures_list` / `ppt_render`) |

### 2) 전체 실행
```bash
BASE_URL=http://localhost:8000 \
JWT=eyJhbG... \
LECTURE_ID=00000000-0000-0000-0000-000000000000 \
k6 run loadtest/k6/scenarios.js
```

### 3) 시나리오 단독 실행 (CI / 스모크용)
```bash
# 익명 health 만 — 토큰 없이 가장 가벼움
k6 run -e K6_SCENARIO=anon_health loadtest/k6/scenarios.js

# 인증 강의 목록만
JWT=eyJhbG... k6 run -e K6_SCENARIO=lectures_list loadtest/k6/scenarios.js
```

### 4) 결과 출력 / 비교
```bash
# JSON 요약 — 비교/회귀용
k6 run --summary-export=loadtest/k6/last-run.json loadtest/k6/scenarios.js

# Prometheus / InfluxDB 등 외부 출력 (별도 셋업 필요)
k6 run --out json=- loadtest/k6/scenarios.js | jq '...'
```

### 5) 로컬 inspect (실행 없이 스크립트 검증)
```bash
k6 inspect loadtest/k6/scenarios.js
```

## 주의사항

- **시나리오 3 의 비용**: PPT 업로드는 매직바이트만 통과시키지만, 후속 렌더 요청
  (`POST /api/v1/render`) 은 Celery 태스크를 enqueue 하고 ElevenLabs / HeyGen 외부
  API 를 호출합니다. 스테이징 환경에서만 실행하거나, mock 토큰을 사용하세요.
- **로컬 redis / postgres**: 시나리오 2/3 은 인증 미들웨어가 Redis blacklist 를
  조회합니다 — 로컬에서 `docker-compose up -d redis postgres` 가 떠 있어야 의미
  있는 결과가 나옵니다.
- **CI 통합**: 별도 후속 PR. 본 PR 은 스크립트 + 실행 가이드만 포함합니다.
