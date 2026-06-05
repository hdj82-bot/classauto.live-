# 검증 결과 인덱스 (Verification Index)

> 병렬 작업 창들의 **검증 결과를 한 곳에 모으는 인덱스**입니다.
> 각 창은 자기 범위의 검증을 수행하고 이 표에 한 줄을 추가합니다.
> 마지막 업데이트: **2026-06-05**

---

## 인덱스

| # | 항목 | 담당 창 | 결과 | 근거 |
|---|---|---|---|---|
| V1 | 고위험 의존성 bump (openai·uvicorn) | 배포 문서·운영 코드화 창 | ✅ **GREEN** | 아래 §V1 |

---

## V1 — 고위험 의존성 bump 검증 (openai 2.38+, uvicorn 0.48+)

**결론: GREEN — PR(`chore/deploy-docs-ops`)에 그대로 포함.**

### 변경 내용 (`backend/requirements.txt`)

| 패키지 | 변경 전 | 변경 후 | 해석된 설치 버전 |
|---|---|---|---|
| `openai` | `>=1.96.0,<3.0.0` | `>=2.38.0,<3.0.0` | **2.41.0** |
| `uvicorn[standard]` | `>=0.30.0,<1.0.0` | `>=0.48.0,<1.0.0` | **0.49.0** |

> 상한(`<3.0` / `<1.0`)은 둘 다 **유지**. floor 만 끌어올려 1.x(openai)·0.3x(uvicorn) 회귀 설치를 차단한다.
> openai 의 floor 2.38 은 Dependabot PR(`dependabot/pip/backend/openai-gte-2.38.0-and-lt-3.0.0`)과,
> uvicorn 0.48 은 `dependabot/pip/backend/uvicorn-gte-0.48.0-and-lt-1.0.0` 과 정합.

### 테스트 방법 (워크트리 격리)

별도 git 워크트리(`chore/dep-verify-openai-uvicorn`, main `50a7fc9` 기준)에서 baseline → bump 2회 실행.
CI(`ci.yml` backend-test)와 동일하게 `requirements.txt` + 테스트 deps 를 설치하고 `-m "not integration"` 으로 구동:

```
uv run --python 3.13 \
  --with-requirements requirements.txt \
  --with-requirements requirements-test.txt \
  --with python-pptx \
  pytest -m "not integration" -q
```

> `integration` 마커(10건)는 PostgreSQL+pgvector 서비스가 필요해 이 환경에서 deselect.
> `external` 마커는 실 API 키 부재 시 자체 skip. CI(`backend-test`)의 Postgres·Redis 서비스에서 최종 확인.

### 결과 — baseline vs bump 동일 (회귀 0)

| 실행 | openai | uvicorn | 결과 |
|---|---|---|---|
| baseline | 1.x | 0.3x | `846 passed, 10 skipped, 10 deselected, 3 xfailed, 3 xpassed` (78.7s) |
| bump | **2.41.0** | **0.49.0** | `846 passed, 10 skipped, 10 deselected, 3 xfailed, 3 xpassed` (82.3s) |

pass/skip/deselect/xfail/xpass 프로파일이 **완전히 동일** — bump 로 인한 회귀 0건.

### openai 1.x → 2.x 마이그레이션 노트 (호출 시그니처 변화 여부)

코드가 실제로 쓰는 openai 표면을 정적 점검(read-only)한 결과, **1.x→2.x 에서 깨지는 호출 없음**:

- **임베딩** — `backend/app/services/pipeline/embedding.py`(+`tasks/pipeline.py:step2_embed`)의
  `client.embeddings.create(...)`: 시그니처·반환(`.data[].embedding`) 1.x→2.x 안정. 변화 없음.
- **gpt-image 룩** — `backend/app/services/pipeline/openai_image.py`:
  `openai.AsyncOpenAI(api_key=..., timeout=180.0)` → `client.images.edit(model, image=(name,bytes,ct), prompt, n, size, quality, input_fidelity)`.
  `input_fidelity` 는 1.96.0+ 도입 파라미터로 2.x 에서도 동일 지원. 반환 `response.data[0].b64_json`·`response.usage.input_tokens` 접근 방식 무변경.
- **예외** — `openai.BadRequestError`(모더레이션 거부 판정에 사용): 2.x 에서도 동일 클래스·동일 위치.
- **회귀 가드 동작 확인** — `tests/test_openai_image.py`(`AsyncOpenAI`/`images.edit` 패치, `BadRequestError` 매핑,
  `input_fidelity` 생략 케이스 등)가 2.41.0 에서 전부 통과 → 위 표면의 2.x 호환을 테스트로 실증.

> 요약: openai 2.x 메이저 점프는 이 코드베이스가 쓰는 경로(embeddings.create / images.edit / AsyncOpenAI / BadRequestError)에 **시그니처 변화를 주지 않는다.** 임베딩·gpt-image 양쪽 모두 호환.

### uvicorn 0.30 → 0.49 노트

- 코드에서 uvicorn 을 import 하지 않음(런타임 ASGI 서버 전용). 프로덕션/Dockerfile start command
  `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 4`(과 dev `Dockerfile`)의 옵션은 0.49 에서 무변경.
- 0.49.0 설치·`import uvicorn`·`app.main` import(테스트 스위트가 전부 거침) 정상.

### SOP 상 후속 (권장 — 본 PR 머지 게이트는 아님)

프로젝트 표준(위험 의존성 = `develop` 채널 + Trivy + Dockerfile parity 검증 후 main, [OPERATIONS_RUNBOOK.md](../../OPERATIONS_RUNBOOK.md) §2):
이 bump 는 **순수 파이썬 의존성**(C-extension·베이스 이미지 변경 없음)이라 도커 빌드에서만 깨질 위험은 낮으나,
머지 전 `develop` push 로 `Docker Build & Push`(prod 이미지에서 2.41.0/0.49.0 설치)·Trivy 게이트를 한 번 통과시키면 SOP 완결.
이 환경엔 `node_modules`·docker 데몬이 없어 prod 이미지 빌드는 CI(`develop`)에서 최종 확인한다.
