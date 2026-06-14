# Railway / Vercel 배포 — 재현 가능한 토폴로지 (Source of Truth)

실 운영 스택은 **Vercel(프론트) + Railway(백엔드·Celery·Redis) + Supabase(DB·Auth·Storage)** 입니다.
이 문서는 그 토폴로지를 **코드/문서로 고정**해, 서비스가 삭제·오설정되거나 시작 명령이
Dockerfile 기본값으로 되돌아갔을 때 결정적으로 복구할 수 있게 합니다.

> 왜 `railway.json`/`vercel.json` 을 곧바로 활성 파일로 커밋하지 않았나
> Railway 모노레포에서 backend 서비스 3개(web/worker/beat)가 같은 디렉터리를
> service-root 로 공유하면, 활성 `backend/railway.json` 하나를 **세 서비스가 모두**
> 읽어 worker/beat 까지 web 설정(uvicorn·healthcheck·preDeploy 마이그레이션)을
> 물려받아 **현재 정상 동작 중인 워커를 깨뜨릴 수 있습니다.** 그래서 검증된 설정을
> [`deploy/*.example`](../deploy/) 로 제공하고, 각 서비스의 service-root 를 확인한
> 뒤 아래 절차로 활성화하도록 합니다.

---

## 1. 서비스 구성 (Railway 프로젝트)

| 서비스 | 역할 | Start Command | Healthcheck | Pre-Deploy |
|---|---|---|---|---|
| **web** | FastAPI API | `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 4` | `/health` | `bash backend/scripts/release.sh` |
| **worker** | Celery 워커 | `celery -A app.celery_app:celery worker --loglevel=info --concurrency=4` | — | — |
| **beat** | Celery 스케줄러 | `celery -A app.celery_app:celery beat --loglevel=info` | — | — |
| **Redis** | 브로커/결과 | (Railway Redis 플러그인) | — | — |

- 세 백엔드 서비스 모두 **같은 이미지**(`backend/Dockerfile.prod`)를 빌드하고 **Start Command 만** 다릅니다.
- **worker/beat 에는 Pre-Deploy(마이그레이션)·Healthcheck 를 설정하지 마세요.** 마이그레이션은 web 한 곳에서만.
- worker 가 없으면 룩 생성·영상 렌더 큐가 영구 적체합니다(에러 없이 조용히). **항상 worker 가 떠 있어야 합니다.**
- **`--concurrency` 튜닝**: 영상 렌더(슬라이드 TTS·추천 질문)는 외부 API(ElevenLabs·HeyGen) 대기 위주라 동시성을 올리면 제작이 눈에 띄게 빨라집니다. 기본 `4`(2→4 로 상향). 워커 메모리가 넉넉하면 `6~8` 까지 올려도 됩니다(prefork 는 동시성당 프로세스 1개라 메모리 비례 증가). 단, **스크립트 생성·자막 번역도 같은 워커에서 Claude 를 호출**하므로 너무 높이면 Anthropic 동시 연결 한도(~5)에 더 자주 부딪힙니다(429 는 `retry_external` 로 백오프 재시도하지만 느려질 수 있음). 메모리·렌더 속도·Claude 한도를 보며 4~8 사이로 조정하세요.

검증된 설정 스니펫: [`deploy/railway.web.json.example`](../deploy/railway.web.json.example) ·
[`railway.worker.json.example`](../deploy/railway.worker.json.example) ·
[`railway.beat.json.example`](../deploy/railway.beat.json.example).

### 활성화 방법 (둘 중 하나)
1. **대시보드(권장, 가장 안전)**: 각 서비스 Settings → Deploy 에 위 표의 Start Command / Healthcheck / Pre-Deploy 를 입력.
2. **config-as-code**: 각 서비스의 service-root 가 **서로 다른 디렉터리**일 때만, 해당 example 을 그 root 에 `railway.json` 으로 복사. (셋이 같은 root 를 공유하면 1번을 쓰세요.)

---

## 2. 마이그레이션 자동화 (스키마 드리프트 방지)

- web 서비스 **Pre-Deploy Command** = `bash backend/scripts/release.sh` ([스크립트](../backend/scripts/release.sh)).
- 이 명령은 새 컨테이너가 트래픽을 받기 **전에** `alembic upgrade head` 를 실행 → 코드가 새 컬럼을 참조하기 전에 스키마가 올라갑니다.
- 종전엔 로컬에서 수동으로 Supabase 에 `alembic upgrade head` 를 돌려야 했고(드리프트 원인), 이제 배포마다 자동 적용됩니다.
- DB URL: `alembic/env.py` 가 `DATABASE_URL_SYNC`(Supabase **Pooler**·psycopg2)를 우선 사용합니다. web 서비스에 이 값이 설정돼 있어야 합니다.

---

## 3. 환경변수 레퍼런스

> `.env.production` 의 `redis://redis:6379` / `@db:5432` 호스트는 **docker-compose 자체 호스팅 전용**입니다.
> Railway 에서는 아래처럼 **대시보드 변수**로 설정하세요(그 파일을 복사하지 말 것).

### 공통 (web · worker · beat 모두 동일하게)
| 변수 | 값/출처 | 비고 |
|---|---|---|
| `ENVIRONMENT` | `production` | |
| `DATABASE_URL` | Supabase asyncpg URL | 런타임용 |
| `DATABASE_URL_SYNC` | Supabase **Pooler**(psycopg2) URL | alembic·sync 경로 |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` | Railway Redis 참조 |
| `CELERY_BROKER_URL` | `${{Redis.REDIS_URL}}` | |
| `CELERY_RESULT_BACKEND` | `${{Redis.REDIS_URL}}` | |
| `JWT_SECRET_KEY` | 실제 시크릿(≥32자) | placeholder 금지 |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` | 실제 값 | |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | 스크립트·문제 생성 |
| `OPENAI_API_KEY` | `sk-...` | 임베딩·gpt-image 룩 |
| `HEYGEN_API_KEY` / `HEYGEN_WEBHOOK_SECRET` | 실제 값 | 영상 렌더·웹훅 |
| `ELEVENLABS_API_KEY` | 실제 값 | TTS |
| `S3_BUCKET` / `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | 실제 값 | 저장소 |
| `HEYGEN_AVATAR_ID_MALE` / `_FEMALE` | 실제 값 | 성별별 아바타(단일 별칭은 deprecated) |
| `ELEVENLABS_VOICE_ID_MALE` / `_FEMALE` | 실제 값 | 성별별 음성 |
| `FRONTEND_URL` | `https://classauto.live` | |
| `CORS_EXTRA_ORIGINS` | `https://www.classauto.live` 등 | apex 외 추가 오리진 |

> 위 필수 키들은 `config.py:_REQUIRED_IN_PROD` 가 부팅에서 검증합니다(비어있거나 `CHANGE_ME` 면 배포 실패 — 의도된 안전장치).

### Vercel (프론트) — 빌드 타임 변수
| 변수 | 비고 |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.classauto.live` (없으면 빌드/런타임 throw) |
| `NEXT_PUBLIC_SITE_URL` | `https://classauto.live` |
| `NEXT_PUBLIC_SUPABASE_URL` | next/image 허용 호스트 |
| `NEXT_PUBLIC_S3_PUBLIC_BUCKET_HOST` | next/image 허용 호스트 |
| `NEXT_PUBLIC_HEYGEN_CDN_HOST` | next/image 허용 호스트 |
| `NEXT_PUBLIC_SENTRY_DSN` | 선택 |

이미지 호스트 3개가 비면 `next/image` 가 아바타/영상 썸네일을 **조용히 차단**합니다.
Vercel 설정 스니펫: [`deploy/vercel.json.example`](../deploy/vercel.json.example).

---

## 4. 배포 후 점검 (스모크)

```bash
curl -s https://api.classauto.live/health         # {"status":"ok"}
curl -s https://api.classauto.live/health/deep     # db/redis/s3/celery 전부 "ok" 인지
```

- `celery` 가 `no_workers` 면 **worker 서비스가 죽었거나 안 떠 있는 것** — 즉시 복구.
- `/health/deep` 를 외부 업타임 모니터에 연결해 `celery != ok` 시 알림을 받으세요(컨테이너 `/health` 는 liveness 만 봐서 워커 사망을 못 잡습니다).
