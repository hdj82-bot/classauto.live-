# 배포 진행 상황 (Deployment Progress)

> 이 문서는 [DEPLOYMENT_ROADMAP.md](DEPLOYMENT_ROADMAP.md) 진행 체크포인트입니다.
> 마지막 업데이트: **2026-05-12**

---

## 진행 요약

```
Phase 0 ✅ 사전 준비 (외부 API 키, 도메인 구매)
Phase 1 ✅ Supabase 설정 (pgvector, 마이그레이션)
Phase 2 ✅ Railway 백엔드 배포 (backend + celery-worker + celery-beat + Redis)
Phase 3 ✅ Vercel 프론트엔드 배포
Phase 4 🔄 도메인 연결 (진행 중)
  ├─ 4.1 ✅ 프론트엔드 도메인 (classauto.live + www)
  ├─ 4.2 ⏳ 백엔드 도메인 (api.classauto.live) ← 다음 작업
  ├─ 4.3 ⏳ 환경변수 최종 업데이트
  ├─ 4.4 ⏳ Google OAuth Console redirect URI
  └─ 4.5 ⏳ HeyGen 웹훅 URL
Phase 5 ⏳ 스모크 테스트
Phase 6 ⏳ CI/CD & 운영 정착
```

---

## 현재 인프라 상태

### Railway (프로덕션)

| 서비스 | 도메인 | 상태 |
|--------|--------|------|
| backend | `classautolive-production.up.railway.app` | ✅ Active |
| celery-worker | (내부) | ✅ Active, task 9개 등록 |
| celery-beat | (내부) | ✅ Active, 10분 주기 스케줄링 |
| Redis | `redis.railway.internal:6379` | ✅ |

**`/health` 응답 (확인됨):**
```json
{
  "status": "ok",
  "checks": {
    "service": "ok",
    "db": "ok",
    "redis": "ok",
    "s3": "ok",
    "celery": "ok"
  },
  "env": "production"
}
```

**`/docs`**: 404 (production에서 비활성화 정상)

### Vercel (프로덕션)

| 도메인 | 종류 | 상태 |
|--------|------|------|
| `classauto.live` | Production | ✅ |
| `www.classauto.live` | 308 → `classauto.live` | ✅ |
| `classauto-live.vercel.app` | Vercel 기본 도메인 | ✅ |

**환경변수:**
- `NEXT_PUBLIC_API_URL` = `https://classautolive-production.up.railway.app` (Phase 4.3에서 `https://api.classauto.live`로 교체 예정)

### Supabase
- pgvector 활성화됨
- Alembic 마이그레이션 완료
- **연결**: Transaction Pooler URL 사용 중 (port 6543)

---

## 오늘(2026-05-12) 격파한 함정

이미 commit/문서화된 것은 생략하고, 미래 작업자가 다시 마주칠 수 있는 것들만 기록:

### 1. `autodiscover_tasks(['app.tasks'])` → `include=`로 교체
- **증상**: worker에 `Received unregistered task of type 'app.tasks.polling.poll_pending_renders'` 에러. beat은 메시지를 잘 보내는데 worker가 task를 모름.
- **원인**: Celery의 `autodiscover_tasks`는 Django 컨벤션을 따라 각 패키지에서 `tasks.py` 파일만 찾는다. 우리 구조는 `polling.py/cleanup.py/backup.py/render.py/pipeline.py`로 분산되어 있어 0개 등록됨.
- **해결**: `Celery(include=[...])` 파라미터로 모듈을 명시 등록. ([commit cc95d7aa 참조](backend/app/celery_app.py))

### 2. Supabase Direct URL → Pooler URL 교체 (Railway 한정)
- **증상**: worker가 task 받자마자 `psycopg2.OperationalError: connection to server at "db.<project>.supabase.co" (IPv6) port 5432 failed: Network is unreachable`
- **원인**: Direct URL은 IPv6로 해석되는데 Railway 컨테이너는 IPv4-only 아웃바운드. Pooler endpoint는 IPv4 지원.
- **해결**: `DATABASE_URL_SYNC`를 Transaction Pooler URL (port 6543)로 교체. **세 서비스 모두** (backend, celery-worker, celery-beat).
- **참고**: 이미 [DEPLOYMENT_ROADMAP.md:315](DEPLOYMENT_ROADMAP.md#L315)에 명시되어 있던 함정. async용 `DATABASE_URL`은 이미 Pooler였으나 sync 버전만 누락.

### 3. PyPI 빌드 flakiness
- **증상**: 같은 commit/같은 requirements.txt로 backend, celery-worker, celery-beat 동시 빌드 — 셋 중 하나만 `ERROR: THESE PACKAGES DO NOT MATCH THE HASHES` (pydantic).
- **원인**: PyPI CDN의 일시적 일관성 문제 또는 다운로드 중 손상.
- **해결**: Railway에서 해당 서비스 "Redeploy" 한 번이면 성공. 코드 수정 불필요.

### 4. Vercel: `www`와 `apex` 어느 쪽이 canonical
- Vercel은 기본적으로 **www를 canonical로 권장** (체크박스 "Redirect classauto.live to www..." 기본 체크됨).
- 우리 브랜드는 **apex(classauto.live)가 canonical**.
- 도메인 추가 시 체크박스를 **반드시 해제**해야 함. www는 별도로 추가하고 "Redirect to Another Domain → classauto.live (308 Permanent)"로 설정.

---

## 알려진 미해결 이슈

### React error #418 (Hydration mismatch)

- **위치**: 메인 랜딩 페이지 `https://classauto.live`
- **증상**: 브라우저 콘솔에 `Uncaught Error: Minified React error #418` 1건. 시크릿 창에서도 재현(확장 무관 확정).
- **추정 원인**: [frontend/src/components/landing/StatCounter.tsx](frontend/src/components/landing/StatCounter.tsx) — 카운트업 애니메이션의 SSR/hydration 초기값 결정 또는 `value.toLocaleString()` locale 차이.
- **영향**: 페이지 기능 정상 (React가 client-side 폴백 렌더링). SEO/Core Web Vitals에 소폭 손해.
- **우선순위**: 중. Phase 6 전에는 잡는 게 좋음. 단일 컴포넌트 문제로 보여 30분 내 수정 가능 추정.

---

## 다음 세션 작업 (Phase 4.2부터)

### 1. Phase 4.2 — `api.classauto.live` Railway에 연결
1. Railway → backend → Settings → Networking → Add Custom Domain
2. `api.classauto.live` 입력
3. Railway가 알려주는 CNAME 정보 메모
4. 도메인 등록기관 DNS 패널에서 `api` 서브도메인 CNAME 추가
5. DNS 전파 + SSL 자동 발급 대기 (5~30분)
6. `https://api.classauto.live/health` 확인 → 동일한 5/5 ok 기대

> ⚠️ **도메인 등록기관 정보가 다음 세션에 필요**. 가비아/Cloudflare/후이즈 중 어디인지 확인 + DNS 패널 캡처 준비.

### 2. Phase 4.3 — 환경변수 최종 업데이트
- Vercel: `NEXT_PUBLIC_API_URL` = `https://api.classauto.live`
- Railway backend: `FRONTEND_URL` = `https://classauto.live`
- Railway backend: `GOOGLE_OAUTH_REDIRECT_URI` = `https://api.classauto.live/api/auth/google/callback`
- Railway backend: `HEYGEN_CALLBACK_URL` = `https://api.classauto.live/api/v1/webhooks/heygen`
- 두 서비스 모두 재배포

### 3. Phase 4.4 — Google OAuth Console
- Google Cloud Console → OAuth 2.0 클라이언트
- Authorized redirect URIs에 `https://api.classauto.live/api/auth/google/callback` 추가
- Authorized JavaScript origins에 `https://classauto.live` 추가

### 4. Phase 4.5 — HeyGen 웹훅 URL
- HeyGen Dashboard → Webhooks → URL을 `https://api.classauto.live/api/v1/webhooks/heygen`로 변경

### 5. 마무리 — 옛 Vercel 프로젝트 삭제
- `classauto-web-prod` → Settings → 하단 Delete Project (도메인 분리됨, 안전)
- `classauto-web` → 같은 방식 (애초에 vercel.app 서브도메인만 썼음)

### 6. Phase 5 — 스모크 테스트
- Google 로그인 full flow
- 강좌 생성 → PPT 업로드 → Celery 큐잉 확인
- 스크립트 생성 (Claude API) → 결과 저장
- 학생 시청 + 진행률 + 형성평가

---

## 참고 — 도메인 종합 정리

```
사용자가 접속:
  https://classauto.live           → Vercel (Next.js production)
  https://www.classauto.live       → 308 → classauto.live

프론트 → 백엔드 API 호출:
  https://api.classauto.live       → Railway (FastAPI)
                                     [Phase 4.2 진행 후 활성화]

외부 콜백:
  Google OAuth →  https://api.classauto.live/api/auth/google/callback
  HeyGen Webhook → https://api.classauto.live/api/v1/webhooks/heygen
```
