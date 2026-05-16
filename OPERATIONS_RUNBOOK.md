# 운영 런북 (Operations Runbook) — Phase 6

> 이 문서는 **CI/CD·배포·롤백 운영 절차**를 다룹니다.
> - 배포 환경/단계 현황: [DEPLOYMENT_PROGRESS.md](DEPLOYMENT_PROGRESS.md)
> - 배포 단계별 셋업 가이드: [DEPLOYMENT_ROADMAP.md](DEPLOYMENT_ROADMAP.md) (특히 `Phase 6 — CI/CD & 운영 정착`)
> - 근거: `.github/workflows/ci.yml`, `.github/workflows/backup.yml`, `scripts/deploy.sh`, `backend/Dockerfile{,.prod}`, `frontend/Dockerfile{,.prod}` (2026-05-16 main 기준)
>
> 모든 절차는 위 실제 파일 내용에 근거합니다. 추측·미확인 절차는 포함하지 않습니다.

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

## 5. Phase 5 스모크 체크리스트 (링크 참조)

운영 배포 전/직후 반드시 수행하는 end-to-end 파이프라인 검증은 **여기서 중복 기술하지 않고** 단일 출처를 따른다:

➡️ **[DEPLOYMENT_PROGRESS.md](DEPLOYMENT_PROGRESS.md) §"다음 세션 작업 — Phase 5 스모크 테스트"** (강좌 생성 → PPT 업로드→Celery 큐잉 → 스크립트 생성 → 학생 시청 흐름 + "시작 전 가벼운 확인" / "막힘 신호").

보조 체크리스트: [DEPLOYMENT_ROADMAP.md](DEPLOYMENT_ROADMAP.md) `Phase 5 — 스모크 테스트`(5.1 인증 / 5.2 핵심 API / 5.3 학생 경로 / 5.4 헬스·메트릭).

> **운영상 최우선 사실**(DEPLOYMENT_PROGRESS.md 상태 메모): PPT → Celery → Claude → HeyGen **end-to-end 검증은 아직 1회도 수행되지 않음 = 단일 최우선 블로커**. 본 런북의 배포 게이트(§1)를 켜기 전에, 그리고 의존성 메이저 bump(예: anthropic SDK) 머지 전에 **베이스라인 스모크 1회**를 먼저 수행한다 (DEPLOYMENT_PROGRESS.md `스모크 테스트 사전 점검` 의 ①→②→③ 순서).

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
5. 직후 §5 스모크 + `/health`(DEPLOYMENT_PROGRESS.md `현재 인프라 상태` 의 5/5 ok 형태) 확인.
6. 이상 시 §4.2 `./scripts/deploy.sh rollback` → 필요 시 §4.4 스키마 동반 롤백.
