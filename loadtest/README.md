# 성능/부하 테스트 (Locust)

Interactive Flipped Learning 백엔드 API에 대한 성능·부하 테스트 환경입니다.

## 테스트 시나리오

| # | 시나리오 | 비중 | 설명 |
|---|---------|------|------|
| 1 | **학생 플로우** | 60 % | 강좌 목록 → 강의 조회 → 세션 시작 → heartbeat → 평가 응답 |
| 2 | **교수 대시보드** | 20 % | 출석·성적·참여도 조회 → CSV 내보내기 |
| 3 | **Q&A 질문** | 20 % | RAG 기반 질문·답변 |

## 목표 지표

| 지표 | 목표 |
|------|------|
| 동시 접속자 | 100 명 |
| p95 응답 시간 | < 500 ms (Q&A 제외) |
| Q&A p95 | < 3 000 ms (LLM 호출 포함) |
| 오류율 | < 1 % |
| Heartbeat 처리량 | > 200 req/s |

## 사전 준비

1. **테스트 토큰 발급**: 백엔드에서 학생/교수 JWT 토큰을 미리 발급합니다.
2. **시드 데이터**: 테스트에 사용할 강좌·강의 ID를 준비합니다.
3. 환경변수를 `.env` 파일이나 셸에서 설정합니다:

```bash
export TARGET_HOST=http://localhost:8000
export STUDENT_TOKEN=eyJhbG...
export PROFESSOR_TOKEN=eyJhbG...
export TEST_LECTURE_ID=<uuid>
export TEST_COURSE_ID=<uuid>
```

## 실행 방법

### 로컬 실행

```bash
# 의존성 설치
pip install -r requirements.txt

# Web UI 모드 (http://localhost:8089)
./run.sh

# Headless 모드 (CLI, 100유저, 5분)
./run.sh --headless

# 커스텀 파라미터
./run.sh --headless --users=200 --rate=20 --time=10m --host=https://staging.example.com
```

### Docker 실행 (master + 4 workers)

```bash
# Web UI 모드
./run.sh --docker

# Headless 모드
./run.sh --docker --headless
```

### Docker Compose 직접 실행

```bash
docker compose -f docker-compose.loadtest.yml up --scale locust-worker=4
# Web UI → http://localhost:8089
```

## 결과 확인

- **Web UI**: `http://localhost:8089` — 실시간 차트, 통계, 다운로드
- **Headless CSV**: 실행 후 `results_stats.csv`, `results_failures.csv` 생성
- **HTML 리포트**: `report.html`

## 주요 엔드포인트 커버리지

### 학생 API
- `GET /api/courses` — 강좌 목록
- `GET /api/courses/{id}/lectures` — 강의 목록
- `POST /api/v1/sessions` — 세션 시작
- `PATCH /api/v1/sessions/{id}` — 상태 업데이트
- `POST /api/v1/sessions/{id}/complete` — 세션 완료
- `POST /api/v1/attention/start` — 집중도 추적 시작
- `POST /api/v1/attention/heartbeat` — 하트비트
- `GET /api/questions/{id}` — 문제 조회
- `POST /api/responses` — 응답 제출
- `POST /api/v1/qa` — Q&A 질문

### 교수 API
- `GET /api/v1/dashboard/{id}/attendance` — 출석 분석
- `GET /api/v1/dashboard/{id}/scores` — 성적 분석
- `GET /api/v1/dashboard/{id}/engagement` — 참여도 분석
- `GET /api/v1/dashboard/{id}/qa` — Q&A 로그
- `GET /api/v1/dashboard/{id}/cost` — 비용 미터
- `GET /api/v1/dashboard/{id}/export/csv` — CSV 내보내기

## 파일 구조

```
loadtest/
├── locustfile.py                 # 테스트 시나리오 정의
├── requirements.txt              # Python 의존성
├── docker-compose.loadtest.yml   # Docker 분산 실행 구성
├── run.sh                        # 간편 실행 스크립트
└── README.md                     # 이 문서
```

## 팁

- **Worker 수 조정**: `--scale locust-worker=8` 로 worker를 늘려 더 높은 부하 생성 가능
- **태그 필터링**: 특정 시나리오만 실행하려면 `--tags student` 또는 `--tags professor`
- **Q&A 제외**: `--exclude-tags qa` (LLM 호출 비용 절약)
- **네트워크 지연 시뮬레이션**: Docker network에 tc 설정 추가 가능
