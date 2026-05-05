// IFL Platform — k6 baseline load test
//
// 시나리오:
//   1) anon_health    : 익명 GET /health, 100 RPS, 30s, VU 50
//   2) lectures_list  : 인증 GET /api/v1/lectures, 50 RPS, 60s, VU 25
//   3) ppt_render     : 인증 PPT 업로드 → 렌더 요청, 1 RPS, 10s, VU 1
//                       (외부 API 비용 ↑ — Stripe/HeyGen 호출 가능, 의도적으로 매우 낮은 RPS)
//
// 환경변수:
//   BASE_URL          : 대상 호스트 (기본 http://localhost:8000)
//   JWT               : 인증된 시나리오용 Bearer 토큰 (시나리오 2/3 에 필요)
//   LECTURE_ID        : 시나리오 3 에서 사용할 강의 UUID
//   K6_SCENARIO       : 단일 시나리오만 실행 시 지정 (예: anon_health). 미지정 시 모두 실행.
//
// 실행:
//   k6 run loadtest/k6/scenarios.js
//   BASE_URL=https://staging.classauto.live JWT=eyJ... k6 run loadtest/k6/scenarios.js
//   k6 run -e K6_SCENARIO=anon_health loadtest/k6/scenarios.js
//
// thresholds: p(95)<500ms, http_req_failed<1%.
// CI 통합 (.github/workflows) 은 별도 후속 PR 에서 진행.

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const JWT = __ENV.JWT || '';
const LECTURE_ID = __ENV.LECTURE_ID || '';
const ONLY = __ENV.K6_SCENARIO || '';

// ── 시나리오 정의 ─────────────────────────────────────────────────────────────

const SCENARIOS = {
  anon_health: {
    executor: 'constant-arrival-rate',
    rate: 100,                   // 100 RPS
    timeUnit: '1s',
    duration: '30s',
    preAllocatedVUs: 50,
    maxVUs: 100,
    exec: 'anonHealth',
    tags: { scenario: 'anon_health' },
  },
  lectures_list: {
    executor: 'constant-arrival-rate',
    rate: 50,                    // 50 RPS
    timeUnit: '1s',
    duration: '60s',
    preAllocatedVUs: 25,
    maxVUs: 50,
    exec: 'lecturesList',
    tags: { scenario: 'lectures_list' },
    startTime: '35s',            // anon_health 종료 후 시작
  },
  ppt_render: {
    executor: 'constant-arrival-rate',
    rate: 1,                     // 1 RPS — 외부 API 비용 고려해 의도적으로 낮음
    timeUnit: '1s',
    duration: '10s',
    preAllocatedVUs: 1,
    maxVUs: 2,
    exec: 'pptRender',
    tags: { scenario: 'ppt_render' },
    startTime: '100s',
  },
};

export const options = {
  scenarios: ONLY ? { [ONLY]: SCENARIOS[ONLY] } : SCENARIOS,
  thresholds: {
    // 전체 합산 thresholds
    'http_req_duration': ['p(95)<500'],
    'http_req_failed':   ['rate<0.01'],
    // 시나리오별 분리 thresholds — 외부 API 호출 시나리오는 별도 한도 가능
    'http_req_duration{scenario:anon_health}':   ['p(95)<200'],
    'http_req_duration{scenario:lectures_list}': ['p(95)<500'],
    // ppt_render 는 외부 API 호출로 변동성이 크므로 별도 임계치 미지정.
  },
};

// ── 공통 헬퍼 ────────────────────────────────────────────────────────────────

function authHeaders() {
  if (!JWT) {
    throw new Error(
      'JWT 환경변수가 필요합니다. lectures_list / ppt_render 시나리오는 인증된 토큰을 사용합니다.\n' +
      '예: JWT=eyJ... k6 run loadtest/k6/scenarios.js'
    );
  }
  return {
    'Authorization': `Bearer ${JWT}`,
    'Content-Type': 'application/json',
  };
}

// PK\x03\x04 매직바이트 + 패딩 — 백엔드 PPTX 검증 통과용 더미.
// 실제 .pptx 가 아니어도 되며, 업로드 경로에서 매직바이트 + 확장자 통과만 확인.
function fakePptxBlob(sizeBytes) {
  // 16KB 더미 (k6 의 http.file 은 ArrayBuffer 를 받는다).
  const len = sizeBytes || 16 * 1024;
  const buf = new Uint8Array(len);
  buf[0] = 0x50; buf[1] = 0x4B; buf[2] = 0x03; buf[3] = 0x04;  // "PK\x03\x04"
  for (let i = 4; i < len; i++) buf[i] = i & 0xff;
  return buf.buffer;
}

// ── 시나리오 1: 익명 /health ────────────────────────────────────────────────

export function anonHealth() {
  const r = http.get(`${BASE_URL}/health`);
  check(r, {
    'health status 200': (res) => res.status === 200,
    'health body has status': (res) => {
      try {
        const body = res.json();
        return body && (body.status === 'ok' || body.status === 'degraded');
      } catch (_) {
        return false;
      }
    },
  });
}

// ── 시나리오 2: 인증된 /api/v1/lectures ─────────────────────────────────────

export function lecturesList() {
  const r = http.get(`${BASE_URL}/api/v1/lectures`, { headers: authHeaders() });
  check(r, {
    'lectures status 200|401': (res) => res.status === 200 || res.status === 401,
    // 200 인 경우만 페이로드 검증
    'lectures body is array or list': (res) => {
      if (res.status !== 200) return true;
      try {
        const body = res.json();
        return Array.isArray(body) || (body && typeof body === 'object');
      } catch (_) {
        return false;
      }
    },
  });
}

// ── 시나리오 3: PPT 업로드 → 렌더 요청 ──────────────────────────────────────

export function pptRender() {
  if (!LECTURE_ID) {
    throw new Error(
      'LECTURE_ID 환경변수가 필요합니다 (시나리오 3 ppt_render). ' +
      '예: LECTURE_ID=<uuid> JWT=... k6 run ...'
    );
  }

  const uploadUrl = `${BASE_URL}/api/v1/render/upload?lecture_id=${LECTURE_ID}`;
  const formData = {
    file: http.file(fakePptxBlob(), 'loadtest.pptx', 'application/octet-stream'),
  };
  const headers = { 'Authorization': `Bearer ${JWT}` };

  const r = http.post(uploadUrl, formData, { headers, timeout: '30s' });
  check(r, {
    'upload status 200|400|413|429': (res) =>
      [200, 400, 413, 429].includes(res.status),
  });

  // 200 인 경우에만 후속 렌더 요청 시도 — 외부 API 호출 비용을 의식해 1 슬라이드만.
  if (r.status === 200) {
    const renderUrl = `${BASE_URL}/api/v1/render?lecture_id=${LECTURE_ID}`;
    const body = JSON.stringify([{ slide_number: 1, script: '안녕하세요' }]);
    const r2 = http.post(renderUrl, body, { headers: authHeaders(), timeout: '15s' });
    check(r2, {
      'render status 200|429': (res) => res.status === 200 || res.status === 429,
    });
  }

  // 1 RPS 안정화를 위해 작은 sleep — constant-arrival-rate 가 분당 도착률을 통제하지만,
  // VU=1 이라 외부 API 응답 지연이 누적되면 다음 iteration 이 늦게 시작될 수 있음.
  sleep(0.1);
}
