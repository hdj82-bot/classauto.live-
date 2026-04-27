# 프로덕션 배포 플레이북 — classauto.live

> 새 컴퓨터 / 새 운영자 / 처음 배포 시작 시 **이 문서만 따라가면 끝까지** 갈 수
> 있도록 구성. 각 단계는 다음 단계의 전제이므로 순서대로 진행한다. 막히면
> 그 단계에서 멈추고 출력을 보존해 둔다.
>
> 관련 문서:
> - [README.md](../README.md) — 프로젝트 개요와 짧은 배포 요약
> - [CLAUDE.md](../CLAUDE.md) — 아키텍처와 코드 구조
> - [scripts/](../scripts/) — 자동화 스크립트 본체

---

## 한눈 체크리스트

```
[0] 사전 준비 (외부)
  ├─ 0-1. 서버 임대 + 공인 IP 확보
  ├─ 0-2. Namecheap DNS A 레코드 2줄 (@ / api)
  └─ 0-3. GHCR Personal Access Token 발급
[1] 서버 초기화 — sudo ./scripts/setup-server.sh
[2] GHCR 로그인 — docker login ghcr.io
[3] .env 작성 + CHANGE_ME 모두 채우기
[4] 환경변수 검증 — ./scripts/validate-env.sh --strict
[5] 최초 배포 — ./scripts/deploy.sh init
[6] 스모크 테스트 — ./scripts/smoke-test.sh classauto.live
[7] CD 활성화 — DEPLOY_ENABLED=true + secrets + Required reviewers
[8] 무중단 동작 검증 — update / rollback 폴링 테스트
[9] 운영 준비 — Stripe 웹훅, Sentry, 백업 검증, 모니터링
```

---

## 배경 — 왜 이 모델인가

수익화(24/7 + 결제 + 데이터 책임)를 가정한 self-hosted Docker Compose 모델.

- 대안 검토 결과 (2026-04-27 결정):
  - **Vercel + Resend** — Frontend는 가능하지만 backend(FastAPI + Celery + Postgres + Redis + pgvector + HeyGen 폴링)는 서버리스에 못 올라감 → 어차피 별도 호스팅 필요. 운영 단순성 위해 한 VM에 통합
  - **PaaS 조합** (Render + Supabase + Upstash) — 무료 플랜은 cold start / 30s timeout 등 트레이드오프, 유료 시 결국 비슷한 비용
  - **선택**: 단일 VM + Docker Compose. 코드(PR #42~#45)가 이 가정 위에서 완성
- 비용: VM 단독 $24~$48/월 (사양에 따라). 외부 API 비용은 사용량 기반 별도

---

## [0-1] 서버 임대

### 스펙 요구

| 항목 | 최소 | 권장 (수익화) |
|---|---|---|
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 또는 24.04 LTS |
| RAM | 4GB + swap 2GB | **8GB** |
| vCPU | 2 | 2~4 |
| 디스크 | 40GB SSD | **80GB+ SSD** |
| 리전 | (어디든) | 서울 |

### 추천 호스팅

| 호스팅 | 8GB 사양 | 월 비용 | 비고 |
|---|---|---|---|
| **AWS Lightsail** | 8GB / 2vCPU / 160GB | $48 | 가장 단순, snapshot 백업 편함 |
| Vultr | 8GB / 2vCPU / 160GB | $48 | 시간 단위 청구 |
| DigitalOcean | 8GB / 2vCPU / 160GB | $48 | 문서 풍부 |
| Naver Cloud | 비슷 | ₩60,000~ | 세금계산서 발행 |

### 절차 (Lightsail 기준)

1. https://lightsail.aws.amazon.com → **Create instance**
2. **Linux/Unix → OS Only → Ubuntu 22.04 LTS**
3. 인스턴스 plan: **$48 (8GB / 2vCPU / 160GB SSD)**
4. 리전: **Asia Pacific (Seoul) — ap-northeast-2**
5. SSH key: 기본값 사용 또는 새로 생성. **`.pem` 파일 다운로드 필수**
6. **Create instance**
7. 생성 후 인스턴스 → **Networking** 탭 → Firewall에 다음 룰 추가:
   - HTTP — TCP — 80
   - HTTPS — TCP — 443
   - (SSH 22는 기본 허용)
8. 인스턴스 → **Networking** 탭에서 **Static IP**를 만들어 attach (재부팅해도 IP 유지)

### 메모할 것

- **공인 IP** (예: `13.125.42.100`) — DNS 등록용
- **SSH key 파일 경로** (예: `~/Downloads/LightsailDefaultKey-ap-northeast-2.pem`)
- 인스턴스명, 리전 (백업/복구 시 필요)

### SSH 접속 검증

```bash
chmod 400 LightsailDefaultKey-ap-northeast-2.pem
ssh -i LightsailDefaultKey-ap-northeast-2.pem ubuntu@<공인IP>
# 비밀번호 안 묻고 들어가면 OK
exit
```

---

## [0-2] Namecheap DNS A 레코드

### 절차

1. https://www.namecheap.com → Sign In
2. **Account → Domain List** → `classauto.live` 옆 **MANAGE**
3. 상단 **Advanced DNS** 탭
4. **HOST RECORDS** 섹션에서 두 줄 추가 (`ADD NEW RECORD` 버튼):

| Type | Host | Value | TTL |
|---|---|---|---|
| A Record | `@` | `<서버 공인 IP>` | `Automatic` |
| A Record | `api` | `<서버 공인 IP>` | `Automatic` |

5. 각 줄 **녹색 체크 아이콘** 클릭 → 저장
6. 기존에 `URL Redirect Record` (`parkingpage.namecheap.com` 등) 있으면 **삭제**.
   안 지우면 [5] 단계 SSL 발급이 무한 루프

### 전파 확인 (5~10분 후)

PowerShell:
```powershell
Resolve-DnsName classauto.live -Type A -Server 8.8.8.8
Resolve-DnsName api.classauto.live -Type A -Server 8.8.8.8
```

bash:
```bash
dig +short classauto.live @8.8.8.8
dig +short api.classauto.live @8.8.8.8
```

둘 다 입력한 서버 IP 응답하면 OK. 30분 지나도 응답 없으면 Namecheap에서 저장 누락 가능 — Advanced DNS 탭 다시 확인.

---

## [0-3] GHCR Personal Access Token

GitHub Container Registry에서 Docker 이미지 pull 용도. **Public 패키지면 스킵** (확인: https://github.com/hdj82-bot?tab=packages 의 `ifl-backend`/`ifl-frontend` 옆 Private 표시).

### 절차

1. GitHub → 우상단 프로필 → **Settings**
2. 좌측 하단 **Developer settings**
3. **Personal access tokens → Tokens (classic) → Generate new token (classic)**
4. 입력:
   - **Note**: `classauto.live GHCR pull`
   - **Expiration**: `90 days` (3개월 후 갱신 알림)
   - **Scopes**: ☑ `read:packages` 만
5. **Generate token** → `ghp_xxxxxxxxxxxxxxxxxxxx` 형식
6. **즉시 1Password 등 비밀 저장소에 복사** — 다시 못 봄

---

## [1] 서버 초기화

```bash
ssh -i LightsailDefaultKey-ap-northeast-2.pem ubuntu@<공인IP>

# 서버 안에서 실행:
sudo apt-get update && sudo apt-get install -y git
sudo git clone https://github.com/hdj82-bot/classauto.live-.git /opt/ifl-platform
cd /opt/ifl-platform

sudo SWAP_SIZE_GB=2 TIMEZONE=Asia/Seoul ./scripts/setup-server.sh
```

### 자동 처리되는 것

- 시스템 패키지 업데이트, `chrony` 시간 동기화
- 2GB swap 파일 + `vm.overcommit_memory=1` (Redis OOM 방지)
- Docker + Docker Compose v2 설치, `$SUDO_USER`(=ubuntu) 를 docker 그룹 추가
- UFW (SSH/80/443만 허용)
- `fail2ban` (sshd jail 활성)
- `unattended-upgrades` (보안 패치 자동)

### 옵션 환경변수

```bash
sudo SWAP_SIZE_GB=4 TIMEZONE=Asia/Seoul \
     GHCR_USER=hdj82-bot GHCR_TOKEN=ghp_xxx \
     ./scripts/setup-server.sh
```

`GHCR_USER`/`GHCR_TOKEN` 같이 넘기면 [2] 단계가 자동 처리됨.

### 소요 / 검증

5~10분 소요. docker 그룹 추가 알림이 뜨면 **로그아웃 후 재접속 필수** (그래야 sudo 없이 docker 명령 가능).

```bash
exit  # 로그아웃
ssh -i LightsailDefaultKey-ap-northeast-2.pem ubuntu@<공인IP>

docker --version          # Docker version 24+ 또는 27+
docker compose version    # Docker Compose version v2+
sudo ufw status           # 22 / 80 / 443 ALLOW
free -h                   # Swap 2.0Gi
timedatectl               # Time zone: Asia/Seoul
sudo systemctl status fail2ban
```

---

## [2] GHCR 로그인

```bash
echo "ghp_xxxxxxxx" | sudo docker login ghcr.io -u hdj82-bot --password-stdin
# Login Succeeded
```

> 토큰을 명령 라인에 직접 쓰지 말 것 (bash history에 남음). stdin 또는
> `~/.ghcr_token` 파일에 저장 후 `cat ~/.ghcr_token | sudo docker login ...` 권장

### 검증

```bash
sudo docker pull ghcr.io/hdj82-bot/ifl-backend:latest
sudo docker pull ghcr.io/hdj82-bot/ifl-frontend:latest
# Status: Downloaded newer image (또는 Image is up to date)
```

---

## [3] .env 작성

```bash
cd /opt/ifl-platform
sudo cp .env.production .env
sudo vi .env
```

`CHANGE_ME` 가 들어간 모든 변수 교체. 카테고리별 필수 항목:

### 도메인 / SSL
| 변수 | 값 |
|---|---|
| `DOMAIN` | `classauto.live` |
| `SSL_EMAIL` | `<운영자 이메일>` (Let's Encrypt 만료 알림용) |
| `FRONTEND_URL` | `https://classauto.live` |
| `NEXT_PUBLIC_API_URL` | `https://api.classauto.live` |

### DB / 인프라
| 변수 | 값 만드는 법 |
|---|---|
| `POSTGRES_PASSWORD` | `openssl rand -base64 24` (≥16자) |
| `JWT_SECRET_KEY` | `openssl rand -hex 32` (≥32자, 64자 권장) |

### Google OAuth
1. https://console.cloud.google.com → 프로젝트 생성
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. **Authorized redirect URIs**: `https://api.classauto.live/api/auth/google/callback`

| 변수 | 값 |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | 발급된 client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | 발급된 secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://api.classauto.live/api/auth/google/callback` |

### AI 서비스
| 변수 | 발급처 |
|---|---|
| `ANTHROPIC_API_KEY` (`sk-ant-...`) | https://console.anthropic.com → API Keys |
| `OPENAI_API_KEY` (`sk-...`) | https://platform.openai.com → API keys |
| `HEYGEN_API_KEY` | https://app.heygen.com → API |
| `HEYGEN_CALLBACK_URL` | `https://api.classauto.live/api/v1/webhooks/heygen` |
| `ELEVENLABS_API_KEY` | https://elevenlabs.io → Profile → API |
| `DEEPL_API_KEY` | https://www.deepl.com/pro-api |

### AWS S3 (영상/PPT/백업 저장)
1. AWS Console → IAM → Users → Create user
2. Permissions: `AmazonS3FullAccess` (또는 특정 버킷 한정 정책)
3. Security credentials → Create access key

| 변수 | 값 |
|---|---|
| `AWS_ACCESS_KEY_ID` (`AKIA...` 20자) | IAM 발급 |
| `AWS_SECRET_ACCESS_KEY` | IAM 발급 (한 번만 보임) |
| `AWS_REGION` | `ap-northeast-2` (서울) |
| `S3_BUCKET` | 생성한 버킷명. 리전 동일해야 함 |

### Stripe (결제)
- 첫 배포 시엔 **test 키**로 시작 권장 (`sk_test_...`)
- 실서비스 결제 받기 직전 `sk_live_...` 로 교체 후 `deploy.sh update`

| 변수 | 값 |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` 또는 `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (웹훅 등록 후 받음 — [9-1] 참조) |

### Sentry / 모니터링
1. https://sentry.io → 프로젝트 2개 생성 (Python — backend, Next.js — frontend)
2. 각 프로젝트 Settings → Client Keys (DSN) 복사

| 변수 | 값 |
|---|---|
| `SENTRY_DSN_BACKEND` | backend DSN |
| `NEXT_PUBLIC_SENTRY_DSN` | frontend DSN |

### 저장
`:wq` (vim 저장 후 종료).

---

## [4] 환경변수 검증

```bash
cd /opt/ifl-platform
./scripts/validate-env.sh --strict
```

### 예상 결과
- 마지막 줄 `[validate] all checks passed`, exit 0

### 실패 패턴별 해법

| 에러 | 원인 | 해법 |
|---|---|---|
| `JWT_SECRET_KEY: too short` | 32자 미만 | `openssl rand -hex 32` 로 새로 생성 |
| `ANTHROPIC_API_KEY: missing prefix sk-ant-` | 다른 키 잘못 복사 | Anthropic 콘솔에서 다시 복사 |
| `STRIPE_SECRET_KEY: must start with sk_live_ in --strict` | test 키인데 strict | strict 빼고 검증 (`./scripts/validate-env.sh`) 또는 live 키로 교체 |
| `DOMAIN: localhost not allowed in --strict` | 도메인 미설정 | `classauto.live` 입력 |
| `AWS_ACCESS_KEY_ID: invalid format (need AKIA + 20 chars)` | 키 길이 안 맞음 | IAM 콘솔에서 재발급 |

> exit 0 떨어질 때까지 [5] 진행 금지.

---

## [5] 최초 배포

```bash
cd /opt/ifl-platform
DOMAIN=classauto.live EMAIL=hdj82@kyonggi.ac.kr ./scripts/deploy.sh init
```

### 자동 처리

1. Docker 이미지 빌드 (또는 GHCR pull)
2. Postgres + Redis 기동, healthy 대기
3. DB 마이그레이션 — `alembic upgrade head`
4. **Let's Encrypt SSL 인증서 발급** (HTTP-01 challenge — DNS가 정확히 서버를 가리켜야 성공)
5. 전체 스택 기동 — nginx, backend, frontend, worker, beat, certbot

### 소요
5~15분.

### 자주 막히는 포인트

| 증상 | 원인 | 해법 |
|---|---|---|
| `Domain validation failed` | DNS 전파 안 됨 | `dig +short classauto.live` 가 서버 IP 응답하는지 재확인. 5~30분 더 대기 |
| `urn:ietf:params:acme:error:rateLimited` | Let's Encrypt 도메인당 주 5회 제한 | **테스트로 굴리지 말 것**. 1주일 대기 또는 staging 서버(`--staging` 플래그) 검증 후 prod |
| `OOM killed` (worker/beat) | RAM 부족 | swap 늘리거나 호스팅 plan 업그레이드 |
| `connection refused: db` | Postgres 부팅 늦음 | `sudo docker compose ... logs db` 확인, healthcheck 통과 대기 |

### 검증

```bash
sudo docker compose -f docker-compose.prod.yml ps
# 모든 컨테이너 healthy / Up 9개

curl https://api.classauto.live/health
# {"status":"ok","db":"ok","redis":"ok","s3":"ok"}
```

브라우저:
- https://classauto.live → 프론트엔드
- https://api.classauto.live/docs → Swagger UI

---

## [6] 스모크 테스트

```bash
./scripts/smoke-test.sh classauto.live
```

### 검사 항목
- `/health` JSON 에 db / redis / s3 모두 ok
- 보안 헤더 — HSTS, CSP, X-Frame-Options, X-Content-Type-Options
- TLS 1.3, 인증서 만료 ≥30일
- Rate limit — 130회 호출 시 429
- Stripe 웹훅 경로는 rate limit 제외
- `/metrics` 외부 차단

### 실패 시
- 어떤 항목 FAIL 인지 출력 그대로 보고
- 보안 구성 누락이지 배포 자체는 됐을 수 있음
- 첫 배포 직후엔 인증서 만료일이 90일이라 ≥30일은 항상 PASS

---

## [7] CD 자동 배포 활성화

매번 SSH로 `deploy.sh` 직접 안 돌리고, GitHub 태그/수동 트리거로 자동 배포.

### 7-1. GitHub Variables / Secrets 등록

Repository → **Settings → Secrets and variables → Actions**

**Variables** 탭:

| Name | Value |
|---|---|
| `DEPLOY_ENABLED` | `true` |

**Secrets** 탭:

| Name | Value |
|---|---|
| `DEPLOY_HOST` | `<서버 공인 IP>` |
| `DEPLOY_USER` | `ubuntu` |
| `DEPLOY_SSH_KEY` | `.pem` 파일 본문 전체 (`-----BEGIN ... PRIVATE KEY-----` 부터 `-----END ...-----` 까지) |

### 7-2. Required Reviewer (강력 권장 — 사고 방지 마지막 안전장치)

Settings → **Environments → New environment** → 이름 `production` → 만든 후:
- **Deployment protection rules → Required reviewers** ☑
- 본인 (또는 팀 동료) 추가 → Save

deploy job 진입 시 GitHub이 명시적 승인을 강제. 실수로 잘못된 머지가 prod 깨뜨리는 것 방지.

### 7-3. 배포 트리거

이제 두 경로로만 prod 발동.

**(a) 릴리스 태그 (권장)**
```bash
git tag -a v0.1.0 -m "production launch"
git push origin v0.1.0
```

**(b) 수동 트리거**
GitHub → Actions → CI workflow → **Run workflow** → Branch=main → `deploy` 체크 → Run

> 단순 main push는 이미지 빌드만 되고 deploy job은 skip. 의도적 사고 방지.

### 검증

태그 푸시 후 GitHub Actions 탭에서 deploy job이 reviewer 승인 대기 → 승인 → SSH 통해 서버에서 `deploy.sh update` 실행 → 5분 내 완료.

---

## [8] 무중단 동작 검증

### 폴링 (본인 PC, 별도 터미널 1)

```bash
while true; do
  curl -o /dev/null -s -w "%{http_code}\n" \
    https://api.classauto.live/health
  sleep 0.2
done
```

### 배포 트리거 (서버 SSH 또는 GitHub 수동 트리거)

```bash
cd /opt/ifl-platform
./scripts/deploy.sh update    # 정상 배포
./scripts/deploy.sh rollback  # 롤백
```

### 합격 기준

- 폴링 출력에 200만 보이면 통과
- 5xx 0~1회는 허용 (네트워크 미세 지연)
- 502가 연속으로 뜨면 PR #42 의 `stop_grace_period` 또는 nginx upstream 미세 조정 필요

### rollback 동작 원리 (PR #44)

`update` 시작 직전 `$STATE_DIR/rollback.env` 에 직전 git SHA + GHCR 이미지 태그 자동 저장. `rollback` 호출 시 그 스냅샷의 SHA로 git checkout + 이미지 pull + rolling 패턴 재실행. **1단계 뒤로만** 자동 롤백 가능 (스냅샷은 매 update 마다 덮어써짐).

---

## [9] 운영 준비

### 9-1. Stripe 웹훅 등록

Stripe Dashboard → **Developers → Webhooks → Add endpoint**

| 항목 | 값 |
|---|---|
| URL | `https://api.classauto.live/api/v1/payment/stripe-webhook` |
| Description | `classauto.live production` |
| Events | `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.created/updated/deleted` |

생성 후 **Signing secret** (`whsec_...`) 복사 → 서버 `.env` 의 `STRIPE_WEBHOOK_SECRET` 에 입력 → `./scripts/deploy.sh update` 로 반영.

### 9-2. Google OAuth Redirect URI 확인

GCP Console → APIs & Services → Credentials → 클라이언트 → **Authorized redirect URIs** 에 다음 정확히:

```
https://api.classauto.live/api/auth/google/callback
```

`http`/`localhost`/`/` 없는 것 등으로 안 맞으면 OAuth 콜백이 거부됨.

### 9-3. HeyGen Webhook

HeyGen Dashboard → Webhooks:
- URL: `https://api.classauto.live/api/v1/webhooks/heygen`
- HMAC secret 발급되면 `.env` 에 `HEYGEN_WEBHOOK_SECRET` 으로 추가

### 9-4. 백업 검증

```bash
# 수동 백업 트리거
sudo ./scripts/backup.sh backup

# S3 에 올라간 것 확인
sudo ./scripts/backup.sh list
# 또는 AWS Console → S3 → <S3_BUCKET> → backups/ prefix
```

매일 UTC 03:00 (KST 12:00) 에 Celery beat 가 자동 실행. S3 → 해당 버킷 → **Management → Lifecycle rules → Create rule**:
- Prefix: `backups/`
- Action: Expire current versions 30 days

### 9-5. 모니터링

- **Sentry**: 테스트 에러를 일부러 발생시켜 양쪽 프로젝트(backend/frontend)에 도달하는지 확인
- **UptimeRobot** (https://uptimerobot.com — 무료 50개 모니터):
  - `https://classauto.live` HTTPS 5분 간격
  - `https://api.classauto.live/health` HTTPS 5분 간격, body에 `"status":"ok"` 키워드 검사
  - 알림: 이메일 / Slack / Discord
- **Prometheus**: `/metrics` 외부 차단은 [6] 스모크 테스트에서 검증됨. 내부 Prometheus 인스턴스는 추후 추가 (현재는 메트릭만 노출)

### 9-6. SSL 자동 갱신 동작 확인

```bash
sudo docker compose -f docker-compose.prod.yml run --rm certbot \
  renew --dry-run
# Congratulations, all simulated renewals succeeded
```

certbot 컨테이너가 12시간마다 갱신 시도. 30일 이내 만료 인증서만 실제 갱신.

---

## 새 PC / 인계 시 빠른 진행 가이드

이미 [0] ~ [5] 완료된 운영 중인 서비스에 다른 PC / 다른 운영자가 들어가야 할 때:

### 필요한 것
- 서버 SSH 접근 권한 (`.pem` 파일 + IP)
- GitHub 저장소 권한 (push / Actions)
- (필요시) `.env` 백업 — Bitwarden / 1Password 같은 비밀 보관소에서 받기

### 동기화

```bash
# 본인 PC
git clone https://github.com/hdj82-bot/classauto.live-.git
cd classauto.live-
gh auth login                    # GitHub CLI 인증

# 서버 SSH 점검
ssh -i <key.pem> ubuntu@<IP>
cd /opt/ifl-platform
sudo docker compose -f docker-compose.prod.yml ps
./scripts/deploy.sh status
```

### 새 코드 배포

```bash
# 본인 PC
git checkout main
git pull
git tag -a v0.x.y -m "..."
git push origin v0.x.y          # CD 자동 배포 트리거
# 또는 GitHub Actions 탭에서 수동 Run workflow + deploy 체크
```

### 비상 시 수동 배포 / 롤백

```bash
ssh -i <key.pem> ubuntu@<IP>
cd /opt/ifl-platform
./scripts/deploy.sh update      # 무중단 업데이트
./scripts/deploy.sh rollback    # 1단계 뒤로 롤백
./scripts/deploy.sh status      # 상태 확인
./scripts/deploy.sh logs backend  # 로그
```

---

## 트러블슈팅 빠른 참조

| 증상 | 1차 진단 명령 | 가장 흔한 원인 |
|---|---|---|
| 사이트 502 | `sudo docker compose ... ps` | backend 컨테이너 down/unhealthy |
| 로그인 안 됨 | `sudo docker compose logs backend | grep -i oauth` | Google OAuth redirect URI 불일치 |
| 결제 후 구독 반영 안 됨 | `sudo docker compose logs backend | grep stripe` | webhook secret 불일치 또는 endpoint URL 오타 |
| 영상 렌더 안 끝남 | `sudo docker compose logs worker beat` | HeyGen 폴백 폴링 누락, beat down |
| 인증서 만료 임박 | `sudo docker compose run --rm certbot renew` | 자동 갱신 실패 (포트 80 막힘 등) |
| OOM 자주 발생 | `free -h`, `dmesg | grep -i kill` | RAM 부족 — plan 업그레이드 또는 swap 증설 |
| DB 백업 실패 | `sudo docker compose logs beat | grep backup` | AWS 키 권한 / S3 버킷 오타 |

---

## 참고 — 비용 추정 (월)

| 항목 | 비용 |
|---|---|
| 서버 (Lightsail 8GB) | $48 |
| 도메인 (Namecheap, .live) | $1.5 (연 $18) |
| AWS S3 (10GB 저장 + 100GB 전송) | $3 |
| Anthropic Claude (사용량 기반) | $50~ |
| OpenAI (임베딩) | $5~ |
| HeyGen (영상 분 기반) | $24~ |
| ElevenLabs (TTS) | $5~ |
| Sentry (Developer plan) | $0 (5K events 무료) |
| Stripe | 거래 수수료만 (2.9% + ₩30) |
| **합계 (외부 API 사용량 0 가정)** | **약 $52** |
| **합계 (소규모 운영)** | **약 $130~** |

---

> 이 문서는 PR #42 / #43 / #44 / #45 가 main 에 머지된 시점(2026-04-27) 기준으로
> 작성. 코드 변경이 있으면 해당 단계 명령어 / 검증 항목을 갱신할 것.
