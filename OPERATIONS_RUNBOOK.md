# 운영 런북 (Operations Runbook) — Phase 6

> 이 문서는 **CI/CD·배포·롤백·상시 운영(모니터링/알림/백업) 절차**를 다룹니다.
> - 배포 환경/단계 현황: [DEPLOYMENT_PROGRESS.md](DEPLOYMENT_PROGRESS.md) (프로덕션 라이브 — 2026-06-05)
> - 배포 단계별 셋업 가이드: [DEPLOYMENT_ROADMAP.md](DEPLOYMENT_ROADMAP.md) (특히 `Phase 6 — CI/CD & 운영 정착`)
> - 근거: `.github/workflows/ci.yml`, `.github/workflows/backup.yml`, `scripts/deploy.sh`, `backend/Dockerfile{,.prod}`, `frontend/Dockerfile{,.prod}`, `docs/RAILWAY_DEPLOY.md` (2026-06-05 main 기준)
>
> 모든 절차는 위 실제 파일 내용에 근거합니다. 추측·미확인 절차는 포함하지 않습니다.
>
> 구성: **§1~§7 = 자체 호스팅(VPS) 경로** 중심 / **§8 = 현재 라이브 관리형 스택(Railway·Vercel·Supabase)의
> 상시 모니터링·알림·외부 API soft-limit·백업**. 현재 운영 기준은 §8 을 우선 본다.

---

## 0. 한눈에 — 현재 자동화 상태

| 파이프라인 | 트리거 | 동작 | 근거 |
|---|---|---|---|
| CI (lint/test/build) | `push`·`pull_request` → `main`·`develop`, 태그 `v*` | backend lint·test(cov≥60), frontend lint·test·build | `ci.yml:3-124` |
| Dockerfile Parity 가드 | 위 CI 와 동일 | `Dockerfile` ↔ `Dockerfile.prod` 베이스 이미지 불일치 시 CI red | `ci.yml:132-158` |
| Docker Build & Push (GHCR) | **모든 `push`** (PR 제외) | `Dockerfile.prod` 빌드 → Trivy(CRITICAL/HIGH) → GHCR push | `ci.yml:166-251` |
| Deploy to Production | **게이트 충족 시에만** (§1) | SSH → `./scripts/deploy.sh update` | `ci.yml:267-294` |
| Daily DB Backup | cron `0 18 * * *` (UTC) + 수동 | `pg_dump` → gzip → S3 | `backup.yml:22-26` |

> **핵심 사실**: `develop`/임의 브랜치에 push 하면 **이미지 빌드·Trivy·패리티까지는 돌지만 배포(deploy job)는 절대 실행되지 않는다.** 배포는 §1 의 게이트를 모두 통과한 경우에만 일어난다.

---

## 1. 프로덕션 배포 게이트 활성화 절차

> ⚠️ **이 절(§1)의 등록 작업은 전부 교수님(저장소 소유자)이 GitHub 웹 UI 에서 직접 수행하는 수동 단계입니다.** Claude/CI 가 대신 설정할 수 없습니다(시크릿·환경 보호 규칙은 저장소 관리자 권한 필요). 등록 전까지 배포 job 은 영구히 비활성입니다.

배포가 실행되려면 `ci.yml:271-278` 의 `deploy.if` 조건이 **모두** 참이어야 합니다:

```
always()
&& (needs.docker-build-push.result == 'success' || == 'skipped')
&& vars.DEPLOY_ENABLED == 'true'
&& ( startsWith(github.ref, 'refs/tags/v')
     || (github.event_name == 'workflow_dispatch' && inputs.deploy == true && github.ref == 'refs/heads/main') )
```

### 1.1 변수·시크릿 등록 (교수님 수동)

`Repository → Settings → Secrets and variables → Actions`

**Variables 탭:**
- `DEPLOY_ENABLED` = `true`  ← 이 값이 없거나 `true` 가 아니면 배포 job 자체가 스킵됨 (안전 기본값).

**Secrets 탭** — `ci.yml:284-291` 의 SSH 배포가 실제로 참조하는 값:
- `DEPLOY_HOST` — 배포 서버 호스트/IP
- `DEPLOY_USER` — SSH 사용자
- `DEPLOY_SSH_KEY` — SSH 개인키
- `DEPLOY_HOST_FINGERPRINT` — `ci.yml:290` 의 `fingerprint`
- `DEPLOY_HOST_KEY` — `ci.yml:291` 의 `known_hosts`. **MITM 방지용으로 필수.** `ssh-keyscan -t rsa,ed25519 <서버 IP>` 결과를 통째로 등록 (`ci.yml:287-289` 주석 근거).

> 사용자 지정 3종(`DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_SSH_KEY`)에 더해, **워크플로가 실제로 참조하는** `DEPLOY_HOST_FINGERPRINT`·`DEPLOY_HOST_KEY` 도 등록해야 SSH 단계가 통과합니다(빈 known_hosts 면 처음 보는 호스트로도 자동 접속 → MITM 위험).

### 1.2 production environment 보호 규칙 (교수님 수동, 권장)

`Settings → Environments → production → Deployment protection rules → Required reviewers`

- deploy job 은 `environment: production` 으로 묶여 있음 (`ci.yml:279`).
- **Required reviewers** 를 추가하면, 게이트를 통과한 배포라도 **교수님의 수동 승인** 후에만 SSH 단계가 진행됨 (사고 방지 2차 잠금장치). `ci.yml:261-264` 주석이 이를 명시적으로 권장.

### 1.3 활성화 후 배포를 실제로 일으키는 두 경로

게이트 등록을 마쳐도 **main push 만으로는 배포되지 않음.** 다음 중 하나여야 함 (`ci.yml:275-278`):

1. **릴리스 태그 푸시**: `git tag v1.2.3 && git push origin v1.2.3`
2. **수동 트리거**: `Actions → CI → Run workflow` 에서 `deploy` 입력 체크 (main 한정).

### 1.4 서버 사전 준비 (최초 1회)

- 서버에서 GHCR private 패키지 pull 가능하도록 `docker login ghcr.io` 1회 (`ci.yml:265-266` 주석).
- 배포 작업 디렉토리: `/opt/ifl-platform` (`ci.yml:293`). 이 경로에 레포가 클론되어 있고 `scripts/deploy.sh` 가 실행 가능해야 함.

---

## 2. `develop` 통합 검증 채널 SOP

`develop` 은 **배포 없이 프로덕션 빌드 경로(`Dockerfile.prod` + Trivy + 패리티)를 그대로 리허설**하는 채널입니다. `ci.yml:4-5,170` 근거로, `develop` push 는 `docker-build-push` 까지 돌지만 `deploy` job 의 `if` 조건(태그 v* 또는 main workflow_dispatch)을 만족하지 않아 배포는 일어나지 않습니다.

**표준 절차:**

1. 작업 브랜치를 `develop` 에 push (또는 `develop` 로 머지).
   ```
   git push origin <branch>:develop
   ```
2. `Actions → CI` 에서 해당 run 의 다음 잡이 **전부 그린**인지 확인:
   - `Backend Test` / `Frontend Test` / `Frontend Build`
   - `Dockerfile Parity (dev ↔ prod)`
   - `Docker Build & Push (backend)` / `(frontend)` — 여기서 **Trivy CRITICAL/HIGH 게이트**(`ci.yml:228-240`)가 실제 prod 이미지를 검사함.
3. 위가 모두 그린이면 같은 변경을 `main` 으로 올린다(머지/PR).
4. main 머지 후 §1 게이트가 켜져 있다면 §1.3 의 경로로 배포.

> **이 채널이 필요한 이유**: `docker-build-push` 는 `if: github.event_name == 'push'` 라 PR 에서는 안 돌고(`ci.yml:170`), main 에 직접 머지하면 **prod 도커 빌드·CVE 스캔이 main 에서 처음** 실행됨. 베이스 이미지 bump(예: python 3.14 #66, node 24)처럼 도커 빌드에서만 깨질 수 있는 변경은 반드시 `develop` 에서 먼저 검증한다. (DEPLOYMENT_PROGRESS.md `토큰 재발급 후 처리 큐` §2 의 "`develop` 채널 push → docker-build+Trivy 그린 검증 → main" 운영 결정과 동일.)

---

## 3. `Dockerfile` ↔ `Dockerfile.prod` 패리티 규칙

### 3.1 두 파일의 역할 (혼동 금지)

| 파일 | 용도 | Dependabot docker 가 보는가 |
|---|---|---|
| `backend/Dockerfile`, `frontend/Dockerfile` | **dev/compose 전용** (`docker-compose.yml` 이 `dockerfile: Dockerfile` 참조) | ✅ 본다 |
| `backend/Dockerfile.prod`, `frontend/Dockerfile.prod` | **CI·프로덕션 실제 빌드** (`ci.yml:180,185` 의 `docker-build-push`) | ❌ **사각지대** |

### 3.2 교훈 — Dependabot docker 사각지대

- Dependabot 의 docker 업데이터는 **정확히 `Dockerfile` 이름만** 스캔하고 `Dockerfile.prod` 는 보지 못한다 (`ci.yml:127-131` 주석 + DEPLOYMENT_PROGRESS.md `후속 발견 — Dockerfile.prod / Dependabot 사각지대`).
- 과거 실제 사고: 머지된 node bump(#151)가 `frontend/Dockerfile` 만 바꿔 **prod 에는 무효**(여전히 구버전). python 3.14(#66)도 dev 만 바꿨다면 동일하게 무효였을 것.

### 3.3 영구 차단 가드 (이미 CI 에 존재 — 신규 작업 불필요)

`ci.yml:132-158` 의 **`Dockerfile Parity (dev ↔ prod)`** 잡이 `FROM` 베이스 이미지(태그 포함)를 추출해 dev↔prod 가 어긋나면 CI 를 red 로 만든다. 또한 `docker-build-push.needs` 에 이 잡이 포함(`ci.yml:169`)되어 **패리티 실패 시 이미지 빌드·push 자체가 차단**된다.

**운영 규칙:**
- 베이스 이미지를 bump 할 때는 **`Dockerfile` 과 `Dockerfile.prod` 를 항상 같은 ref(태그 포함)로 함께** 수정한다. 한쪽만 바꾸면 패리티 잡에서 CI red.
- 현재 동기 상태(2026-05-16 main, 직접 확인): backend `python:3.14.0-slim-bookworm` (dev/prod 동일), frontend `node:24.1.0-alpine3.20` (dev/prod 동일).
- `Dockerfile.prod` 는 멀티스테이지 + `apt-get upgrade`/`apk upgrade` 로 OS 패치를 적용해야 Trivy 게이트를 통과한다 (`backend/Dockerfile.prod`, `frontend/Dockerfile.prod` 주석 근거). 새 스테이지 추가 시 모든 `FROM` 베이스를 dev 와 동일 ref 로 유지.
- Dependabot 이 dev `Dockerfile` 만 PR 로 올리면, 머지 전에 `Dockerfile.prod` 도 같은 ref 로 동기화 후 §2 `develop` 채널로 prod 빌드 검증.

---

## 4. 롤백 절차

배포는 `ci.yml:294` → 서버에서 `./scripts/deploy.sh update` 로 수행되며, `update` 는 교체 직전 **롤백 스냅샷**을 저장한다 (`scripts/deploy.sh:232-248` `save_rollback_snapshot`).

### 4.1 GHCR 이미지 태그 규칙 (`ci.yml:198-206`)

- `main` push → `:latest` + `:sha-<short>`
- 그 외 브랜치 push → `:branch-<name>` + `:sha-<short>`
- PR → push 안 함

`sha-<short>` 가 git SHA 와 1:1 대응하므로 롤백 좌표로 사용된다.

### 4.2 표준 롤백 — 무중단 (권장)

서버에서:

```bash
cd /opt/ifl-platform
./scripts/deploy.sh rollback
```

동작 (`scripts/deploy.sh:335-430` 근거):
- 스냅샷 `$STATE_DIR/rollback.env` (`/var/lib/ifl` 우선, 권한 없으면 `~/.ifl-deploy`) 에서 `IFL_PREVIOUS_GIT_SHA` / `IFL_PREVIOUS_TAG` 를 읽어 **직전 버전으로 1단계** 복귀.
- git 작업트리를 직전 커밋으로 checkout(detached HEAD) → GHCR 에서 이전 태그(`sha-<short>`) pull → backend·frontend **rolling** 교체 → worker graceful(60s) → beat 재생성 → nginx reload. 502 없이 복귀.
- GHCR 에서 태그가 사라졌으면 로컬 캐시 이미지(sha256)로 자동 폴백(`deploy.sh:373-390`).

**제약 (스크립트가 명시):**
- **1단계 뒤로만** 지원 (스냅샷은 직전 `update` 때만 갱신).
- **DB 스키마는 자동 복구되지 않음.** 직전 배포가 파괴적 마이그레이션을 했다면 코드/스키마가 어긋남 → 아래 4.4.
- 롤백 후 `detached HEAD` 상태. 문제 해결 뒤 `git checkout main` 으로 복귀.

### 4.3 수동 롤백 (스냅샷 없음/손상 시 — 스크립트 안내 그대로)

`scripts/deploy.sh:343-348` 가 출력하는 절차:

```bash
git log                                   # 직전 정상 git SHA 확인
git checkout <prev-sha>
IFL_IMAGE_TAG=sha-<short> docker compose -f docker-compose.prod.yml pull
IFL_IMAGE_TAG=sha-<short> ./scripts/deploy.sh update
```

### 4.4 DB 스키마 동반 롤백 (파괴적 마이그레이션이 있었던 경우)

`scripts/deploy.sh:423-435` 안내:

```bash
# 한 단계 다운그레이드
docker compose -f docker-compose.prod.yml run --rm backend alembic downgrade -1

# 또는 최신 백업에서 복원 (backup.yml 의 일일 백업 산출물)
./scripts/backup.sh list
./scripts/backup.sh restore <파일>
```

### 4.5 관리형 플랫폼 경로 (참고)

[DEPLOYMENT_ROADMAP.md](DEPLOYMENT_ROADMAP.md) `6.1` 에 명시된 대안: Vercel `Deployments → 이전 버전 Promote`, Railway `Deployments → 이전 commit Redeploy`. (현재 인프라가 Railway/Vercel 인 경우 — DEPLOYMENT_PROGRESS.md `현재 인프라 상태` 참조.)

---

## 5. 스모크/회귀 체크리스트 (링크 참조)

배포 직후·메이저 의존성 bump 후 수행하는 end-to-end 파이프라인 점검은 **여기서 중복 기술하지 않고** 단일 출처를 따른다:

➡️ **[DEPLOYMENT_PROGRESS.md](DEPLOYMENT_PROGRESS.md) §"(역사·재현 절차) Phase 5 스모크 테스트 시나리오"** (강좌 생성 → PPT 업로드→Celery 큐잉 → 스크립트 생성 → 학생 시청 흐름 + "시작 전 가벼운 확인" / "막힘 신호").

보조 체크리스트: [DEPLOYMENT_ROADMAP.md](DEPLOYMENT_ROADMAP.md) `Phase 5 — 스모크 테스트`(5.1 인증 / 5.2 핵심 API / 5.3 학생 경로 / 5.4 헬스·메트릭).

> 🗓️ **2026-06-05 정정**: 이전 판의 "PPT→Celery→Claude→HeyGen end-to-end 가 1회도 수행 안 됨 = 단일
> 최우선 블로커" 서술은 **무효**다. 프로덕션이 라이브가 되며 코어 루프가 운영에서 반복 검증됐다
> (DEPLOYMENT_PROGRESS.md `2026-06-05 현재 상태`). 따라서 이 스모크는 "블로커 해소"가 아니라
> **배포·메이저 의존성 bump 후 회귀 점검**으로 수행한다. 위험 의존성 bump 는 §2 `develop` 채널 +
> Trivy + Dockerfile parity 를 먼저 통과시킨 뒤 main 으로 올린다(예: openai/uvicorn bump 검증은
> [docs/verification/00-index.md](docs/verification/00-index.md) §V1).

---

## 6. 백업 운영 (Phase 6.2)

- `.github/workflows/backup.yml`: **매일 cron `0 18 * * *` (UTC)** + `workflow_dispatch`(사유 입력) 로 `pg_dump → gzip → S3`. postgresql-client 는 backend 이미지와 동일 pg16.
- 복원은 §4.4 의 `./scripts/backup.sh restore <파일>`.
- 한도/모니터링 항목은 [DEPLOYMENT_ROADMAP.md](DEPLOYMENT_ROADMAP.md) `6.3 모니터링` / `6.4 비용 모니터링` 참조.

---

## 7. 빠른 점검 (배포 전후 30초)

1. CI 그린: `Actions → CI` 최근 run 의 test/build/**parity**/**docker-build-push(Trivy)** 전부 ✅.
2. `develop` 리허설 완료(베이스 이미지/도커 변경이 포함된 경우 §2 필수).
3. 게이트(§1): `DEPLOY_ENABLED=true` + 시크릿 5종 + (권장) production Required reviewers.
4. 배포 트리거는 §1.3 의 태그 또는 workflow_dispatch 만.
5. 직후 §5 스모크 + `/health/deep`(DEPLOYMENT_PROGRESS.md `현재 인프라 상태` 의 5/5 ok 형태) 확인.
6. 이상 시 §4.2 `./scripts/deploy.sh rollback`(VPS) 또는 §4.5 관리형 Promote/Redeploy → 필요 시 §4.4 스키마 동반 롤백.

---

## 8. 운영 모니터링·알림·백업 (관리형 스택 — Railway/Vercel/Supabase)

> §1~§7 은 자체 호스팅(VPS + `scripts/deploy.sh` + GHCR) 경로 중심이다. **현재 프로덕션은
> 관리형 스택**(Railway 백엔드·Vercel 프론트·Supabase DB, DEPLOYMENT_PROGRESS.md `현재 인프라 상태`)이며,
> 이 절은 그 스택의 **상시 운영 모니터링·알림·백업**을 코드화/절차화한다.
>
> ⚠️ 아래 **대부분은 외부 SaaS 대시보드의 수동 설정**(교수님 권한 필요)이다. 콘솔 UI 는 변할 수 있으니
> "어떤 신호를 어디에 연결하는가"의 의도를 기준으로 읽고, 메뉴 명칭은 근사치로 본다.

### 8.1 외부 업타임 모니터 → `/health/deep` (`celery != ok` 알림) — **최우선**

**왜**: 컨테이너/플랫폼의 기본 healthcheck 는 `/health`(경량 liveness, #224)만 본다. 이건 **프로세스가
살아있는지**만 확인하고 **Celery 워커가 죽었는지는 못 잡는다**. 워커가 죽으면 룩 생성·영상 렌더·Q&A 야간
배치가 **에러 없이 조용히 영구 적체**한다([docs/RAILWAY_DEPLOY.md](docs/RAILWAY_DEPLOY.md) §1·§4). 그래서
외부 업타임 모니터는 반드시 **`/health/deep`** 를 폴링하고 응답 본문의 `checks.celery` 를 검사해야 한다.

**연결 절차(외부 모니터 — UptimeRobot/Better Stack/Pingdom 등 무료 티어 가능):**
1. 모니터 종류: **HTTP(S) keyword 모니터**.
2. URL: `https://api.classauto.live/health/deep`
3. 간격: 1~5분.
4. **정상 조건**: 응답이 HTTP 200 **이고** 본문에 `"celery":"ok"` 문자열이 포함.
   - keyword 모니터를 `"celery":"ok"` **부재 시 다운**으로 설정(= `no_workers`/`error` 면 알림).
   - 가능하면 `"status":"ok"` 도 함께 본다(5/5 종합).
5. 알림 채널: 이메일(`hdj82@kyonggi.ac.kr`) + (선택) Slack/SMS. 다운 1회 즉시 + 복구 시 알림.
6. **2차(선택)**: `https://classauto.live` (프론트, Vercel)도 별도 keyword 모니터로 — 빌드 사고·도메인 만료 조기 감지.

> 빠른 수동 점검: `curl -s https://api.classauto.live/health/deep` → `checks` 5종 전부 `ok` 인지.
> `celery` 가 `no_workers`/`error` 면 Railway → `celery-worker` 서비스 로그 확인 후 Redeploy(§4.5).

### 8.2 Sentry (에러) 알림

- 백엔드 `sentry-sdk[fastapi]`, 프론트 `NEXT_PUBLIC_SENTRY_DSN`(설정 시). 민감정보는 `core/sentry.py`
  `_SENSITIVE_KEYS` + `core/logging.py` KV 마스킹으로 학번·실명·OAuth ID 가 평문 전송되지 않게 차단됨(#160).
- **Sentry → Alerts** 에서 권장 룰(교수님 수동):
  - **새 이슈(first seen)** → 즉시 이메일.
  - **이슈 급증**(예: 1시간 내 동일 이슈 N건↑) → 알림 — 파이프라인/외부 API 연쇄 실패 조기 포착.
  - 환경 필터 `environment:production` 으로 한정(개발 노이즈 제외).
- DSN 미설정이면 Sentry 는 no-op(부팅은 정상). 베타 운영에서는 최소 백엔드 DSN 을 권장.

### 8.3 Railway (백엔드/워커) 알림

- **Project → Settings → Notifications**: 배포 실패·크래시·서비스 다운 시 이메일/웹훅(교수님 수동).
- **반드시 확인할 서비스 3종**: `backend`(web), `celery-worker`, `celery-beat`. 특히 **worker 는 healthcheck
  대상이 아니므로**(의도적, [docs/RAILWAY_DEPLOY.md](docs/RAILWAY_DEPLOY.md) §1) 다운을 플랫폼이 자동 통지하지
  않는다 → §8.1 의 `/health/deep` 외부 모니터가 워커 사망의 **실질적 1차 감지선**이다.
- **Usage**: 월 크레딧 소진 추세 — `Usage` 페이지 즐겨찾기([DEPLOYMENT_ROADMAP.md](DEPLOYMENT_ROADMAP.md) §6.4).

### 8.4 Vercel (프론트) 알림

- **Project → Settings → Notifications**: **빌드/배포 실패 시 이메일**(교수님 수동) — 프론트가 빌드 실패로
  이전 버전에 머무는 사고 조기 감지.
- 도메인/SSL 만료 알림도 켠다(apex `classauto.live` + `www` 308).

### 8.5 외부 API soft-limit · 비용 가드

**앱 내부 가드(이미 코드에 존재 — 근거):**
- HeyGen **예산 서킷 브레이커**·중복 렌더 차단·mock·단가 정정(#272·#274) — 영상 렌더 폭주/이중 청구 방지.
- 전 생성 경량 모델(Haiku) 기본화(#222)·스크립트 prompt caching(#202) — Claude 비용 절감.
- 본문 클라이언트 슬라이드쇼화(#326)로 슬라이드별 HeyGen 렌더 제거 — 렌더 단가의 구조적 절감.

**각 콘솔의 soft-limit(교수님 수동 — 폭주 시 과금 상한):**
| 제공자 | 콘솔 설정 |
|---|---|
| Anthropic (Claude) | console.anthropic.com → Billing/Limits → **monthly spend limit** + 사용량 알림 |
| OpenAI (임베딩·gpt-image) | platform.openai.com → Limits → **monthly budget / usage alert** |
| HeyGen (영상 렌더) | 플랜 크레딧 한도 확인 — 앱의 예산 서킷 브레이커(#274)와 **이중 안전망** |
| ElevenLabs (TTS) | 구독 등급 문자수 한도 모니터 |

> 운영 원칙: **콘솔 하드 상한(과금 사고 방지) + 앱 서킷 브레이커(품질·UX) 를 둘 다** 둔다. 한쪽만으로는
> 부족하다 — 콘솔 상한은 사용자에게 갑작스런 503 을 줄 수 있고, 앱 가드는 콘솔 청구를 막지 못한다.

### 8.6 Supabase 백업 (무료 티어 한계 · 주 1회 `pg_dump` 대안)

**한계(반드시 인지)**: Supabase **Free 티어는 PITR(시점 복구) 미지원**이고 자동 백업 보관도 짧다(7일 일일
백업은 Pro 이상, [DEPLOYMENT_ROADMAP.md](DEPLOYMENT_ROADMAP.md) §7). 또한 GitHub Actions `backup.yml` 은
`vars.DEPLOY_ENABLED == 'true'`(= VPS 모드) 일 때만 도므로, **관리형 Supabase 스택에서는 기본적으로 돌지 않는다.**
→ 관리형 스택에서는 아래 **수동/반자동 주 1회 `pg_dump`** 가 현실적 안전망이다.

**주 1회 수동 `pg_dump`(권장 — 무료 티어용):**
```bash
# Supabase → Project Settings → Database → Connection string (Direct, psycopg/플레인)
# 비밀번호 포함 URL 은 셸 히스토리에 남지 않게 주의(환경변수로 주입).
PGURL="postgresql://postgres.<ref>:<password>@<host>:5432/postgres"
STAMP="$(date -u +%Y%m%d)"
pg_dump --no-owner --no-privileges --format=plain "$PGURL" | gzip -9 > "ifl-${STAMP}.sql.gz"
# 안전한 외부 저장(예: S3/로컬 보관). 복원: gunzip -c ifl-YYYYMMDD.sql.gz | psql "$PGURL"
```
- `--no-owner --no-privileges`: 다른 환경 role/permission 차이로 복원이 깨지지 않게(= `backup.yml` 과 동일 플래그).
- pg 클라이언트 버전은 서버와 맞춘다(현재 **pg16** — backend 이미지와 동일).

**반자동 옵션(원하면)**: `backup.yml` 워크플로를 그대로 재사용하되 **`DATABASE_URL_BACKUP` 를 Supabase
Direct URL 로** 두고, 별도 cron 워크플로(또는 `vars.DEPLOY_ENABLED` 게이트 분리)로 주 1회 트리거. 산출물은
동일하게 `s3://<버킷>/ifl-backup/<날짜>/`. 다만 이는 앱 빌드 잡과 무관한 운영 워크플로 변경이므로 별도 PR 로.

**확장 트리거**: DB 가 Free 한도(500MB)의 ~80% 에 도달하면 Supabase **Pro($25/월, 8GB + 7일 PITR)** 전환을
검토([DEPLOYMENT_ROADMAP.md](DEPLOYMENT_ROADMAP.md) §7). 그 시점부터는 PITR 가 1차 안전망이 되어 수동 `pg_dump`
부담이 줄어든다.
