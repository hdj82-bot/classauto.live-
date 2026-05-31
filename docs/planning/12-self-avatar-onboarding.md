# 12. 교수자 본인 아바타 온보딩 — Photo Avatar 룩

> 상태: 🟡 설계 v0.2 (2026-05-31) · 근거: v0.1(HeyGen Photo Avatar 풀코스) 코드 점검 + 비용·속도 재분석 → **룩 생성 제공자 전환 결정**
>
> ⚠️ **v0.2 에서 룩 생성 경로가 바뀝니다.** §0(아래)이 최신 결정이며, §1~§12 의 HeyGen Design with AI / Avatar III(group+train) 기준 서술은 **맥락 보존용**입니다. 충돌 시 §0 이 우선합니다.

---

## 0. v0.2 방향 전환 — gpt-image-2 룩 + Talking Photo 최종 (2026-05-31 확정)

### 0.1 무엇을 바꾸나

| | v0.1 (기존 설계) | **v0.2 (확정)** |
|---|---|---|
| 룩 생성 | HeyGen Design with AI (`/v2/photo_avatar/look/generate`) | **OpenAI gpt-image-2** (`images/edits` + `input_fidelity:high`) |
| 학습(train) | Photo Avatar group **train 필요** (코드상 최대 15분 폴링) | **없음** |
| 최종 아바타 | Avatar III(trained group look = avatar_id) | **Talking Photo** (`upload_talking_photo` → `talking_photo_id`) |
| 온보딩 단계 | 4단계(업로드→준비→룩생성→선택) | **1단계로 압축** (한 화면) |

### 0.2 왜 (근거)

1. **체감 지연의 주범은 train.** 코드 점검 결과(`tasks/photo_avatar.py`, `_MAX_RETRIES=90·_RETRY_DELAY=10` → 최대 15분) 사진 업로드 직후 그룹 학습이 최대 병목. 화면의 "34개 스타일"은 미리 생성이 아니라 정적 프리셋 카탈로그(`lookPresets.ts`)이며 이미 카드 클릭당 1장만 생성 → 느림은 룩 개수가 아니라 train 때문.
2. **자연스러움은 룩 출처와 무관.** HeyGen 공식: photo avatar 룩은 "AI generated **또는 사용자 업로드**" 둘 다 수용. 엔진은 입력 이미지의 출처를 구분하지 않음 → 같은 이미지·같은 엔진이면 결과 동일. 차이는 입력 이미지 품질(아티팩트·정체성)뿐이고, gpt-image-2(2026-04 출시, 2K/4K·reasoning)는 그 변수를 대부분 해소.
3. **비용 비등·시간 압승.** 아래 0.4.

### 0.3 새 사용자 흐름 (1단계 압축)

```
[사진 업로드(S3 즉시)] + [Persona/Outfit/Background 선택]
        └─ ✨ 룩 생성: gpt-image-2 즉석 N장 (~수십초, train 없음)
              └─ 맘에 들면 → [이 모습으로 아바타 만들기]
              └─ 아니면 → ↻ 다시 생성 (수동, 계정당 누적 상한)
        └─ 확정 1장만 → upload_talking_photo → talking_photo_id
        └─ (선택) 본인 목소리 → 움직이는 미리보기 (기존 /me/preview 재사용)
```
- 스테퍼의 "준비(train)" 단계 소멸이 압축의 핵심. Talking Photo 경로라 가능.

### 0.4 비용·시간 비교 ($1 = ₩1,380)

**온보딩(제작) — 4~5장 생성 후 1장 선택:**

| | v0.1 HeyGen 풀코스 | v0.2 gpt-image-2 → Talking Photo |
|---|---|---|
| train | 5~15분 대기 | **없음** |
| 룩 5장 | HeyGen look 5×$0.20 ≈ $1.00, 각 폴링 수 분 | gpt medium 5×~$0.08 ≈ **$0.40** (high면 ~$1.2) |
| 1장 확정 | look_id = avatar (추가 0) | Talking Photo 등록 무료·초 단위 |
| **합/시간** | ~$1.00 / **15~30분** | **~$0.40 / 1~3분** |

**강의 렌더(반복) — 최종 엔진 단가:**

| 엔진 | 분당 | 캡 | 채택 |
|---|---|---|---|
| Avatar III / **Talking Photo** | **$1 (₩1,380)** | 무제한 | ✅ |
| Avatar IV | $4 (₩5,520) | 월 10분(200크레딧) | ❌ 본 렌더 금지(미리보기 한정) |

→ **Talking Photo 는 렌더 단가가 기존 Avatar III 와 동일.** 즉 v0.2 는 "온보딩만 빨라지고 렌더 비용은 그대로"인 순수 개선.

### 0.5 확정 설계 결정 (2026-05-31)

1. **Generate Avatar = 선택된 룩을 `upload_talking_photo` 로 등록** (train 0). 정체성 보존은 프롬프트 문장이 아니라 **`images/edits` + `input_fidelity: high`** API 로 강제.
2. **재생성 상한 = 교수자(계정)당 누적** (강의당 아님 — 아바타는 계정 1회성 자산). 기본 20회. 평소 "상한" 텍스트 비노출, **초과 시에만** 소프트 안내(막다른 메시지 금지): *"지금까지 만든 룩 중에서 선택해 주세요. 추가 생성은 잠시 후 다시 가능합니다."* 버튼만 비활성, 기존 룩 선택 유도. (auto-regenerate validator 는 비용·지연 폭탄이라 **삭제** — 수동 재생성만.)
3. **비율**: *최종 강의 영상* = 16:9 (HeyGen `HEYGEN_DIMENSION 1280×720`, 이미 고정). *gpt 룩 생성 이미지* = **인물 중심(1:1~포트레이트)** — 16:9 와이드로 뽑으면 인물이 작아져 Talking Photo 입력에 불리. 추가 비율 요구는 후속.
4. **품질 tier = medium, 한 번에 3장.** 비용 레버는 장수가 아니라 tier(high↔medium 4배차). medium 3장(~₩330)이 high 2장(~₩830)보다 싸면서 다양성 유지. 정체성은 tier 아닌 input_fidelity 가 책임. 확정 1장만 필요 시 high 재생성.

### 0.6 추가 개선·리스크 (v2 구현 시 반영)

**구현 전 필수:**
- **(A) 생성 이미지 즉시 S3 저장** — OpenAI 결과 URL 은 만료. v0.1 의 미해결 TODO(`avatars.py:789` "S3 캐시는 후속")를 이번에 해소.
- **(B) 비동기 처리** — gpt-image-2 는 reasoning 모델이라 장당 수십 초. 기존 Celery 폴링 재사용 또는 진행 표시 필수(동기 요청 시 타임아웃).

**구현 중:**
- **(C) Feature flag** `PHOTO_AVATAR_PROVIDER=gpt|heygen` 로 점진 전환·롤백 (배포 단계 안전). 기존 `heygen_look_id` 데이터 마이그레이션 호환.
- **(D) 하드 실패 처리** — ① Talking Photo 얼굴 미검출(`_classify_failure` 패턴 재사용) ② gpt-image-2 의 실존 인물 모더레이션 거부 → **원본 사진 Talking Photo 직행 fallback**.
- **(E) Talking Photo 교체 시 이전 자산 정리 + 미리보기 캐시 무효화** (기존 `upload_profile_photo` 패턴).
- **(F) 토큰 사용량 계측 로깅** (비용 투명성 차별점 #2 — 추정치 0.06~0.35 를 실측 보정).

**검토:**
- **(G) PPT 코너 PIP 로 쓸 경우** 단색 배경 룩 옵션(배경 합성 용이). 전체화면 인트로만이면 불필요.
- **(H) 음성 결합 순서** — 룩과 독립. PRD 에 "룩 확정 → (선택)음성 → 미리보기" 명시.

### 0.7 전환에 따른 §1~§12 변경 매핑

- **제거**: `prepare_photo_avatar_training`, `poll_photo_avatar_training`, `generate_photo_avatar_looks`(HeyGen 룩), `poll_photo_avatar_looks` 의 HeyGen 의존부, User `photo_avatar_group_id/status/error`(또는 flag 뒤로).
- **신규**: gpt-image-2 서비스(edits+input_fidelity), Persona/Outfit/Background 매핑(영어 직접 — Translate LLM 단계 생략), 결과 S3 저장.
- **변경**: `photo_avatar_looks.heygen_look_id` → **이미지 S3 URL** 의미로(마이그레이션 1건). 룩 확정 시 `upload_talking_photo` → `user.photo_avatar_id`.
- **그대로 유효**: §2 재사용 자산, `create_video(talking_photo_id=…)` 렌더 경로, `create_avatar_preview` 미리보기, 음성(ElevenLabs IVC) 전부, §9 렌더 폴백·갤러리 노출.

### 0.8 PoC 우선 (실작업은 후속)

본 문서는 **결정 기록**이며 구현은 추후. 착수 시 **(A)·(B)·(D) + Talking Photo 모션 자연스러움**을 PoC 로 먼저 검증(사진 1장 → gpt 룩 3장 비동기 → S3 → Talking Photo → 짧은 립싱크 + 모더레이션 거부 케이스). 통과하면 PRD v2 확정 후 본구현.

> 별도 PRD: `AI_Instructor_Avatar_Generator_FULL_PRD.md`(사용자 작성) — Quick/Advanced·Persona·Hidden HeyGen Optimization Layer·Quality Validator. 위 0.5 결정과 0.6 항목을 반영해 PRD v2 로 정리 예정.

---

## 1. 목적

교수자가 **잘 만든 증명사진 1장 + 음성 1~2분**만으로 **본인 얼굴·본인 목소리** 강의 아바타를 갖게 한다. 영상 녹화 클론(Avatar V)의 진입 마찰(촬영·조명·장비, 동의 코드 STT 검증 실패)을 없애고, "학자가 학자를 위해 만든 도구" 정체성을 강화한다.

핵심 통찰: **룩(Design with AI 스타일) ≠ 모션 엔진(비용)**. 좋은 룩을 유지하면서 **Avatar III($1/분)** 로 렌더 → 품질과 비용을 동시에 잡는다.

---

## 2. 이미 구현된 것 (재작업 금지 — 재사용)

| 기능 | 위치 | 비고 |
|---|---|---|
| 사진 업로드 → Talking Photo 등록 | `POST /api/avatars/profile-photo` → `user.photo_avatar_id` | **옛 방식(`/v1/talking_photo`)** — 이번에 업그레이드 대상 |
| 움직이는 미리보기 렌더·폴링 | `POST/GET /api/avatars/me/preview` | 폴링 패턴 그대로 재사용 가능 |
| **음성 클론 (ElevenLabs IVC)** | `POST/GET/DELETE /api/avatars/me/voice` → `user.cloned_voice_id` | **완성됨.** 업로드→`clone_voice`→`GET /api/voices` 자동 노출. **신규 작업 없음** |
| 갤러리 목록 (기본 + 본인) | `GET /api/avatars` (`curate_avatars`) | 본인 아바타는 `is_custom` 으로 맨 앞 |
| 강의별 선택 | `lecture.avatar_id`, `lecture.voice_id`, `lecture.avatar_scale` | 렌더가 사용 |
| 렌더 연결 | `render.py` → `create_video(avatar_id=…)` / `pick_voice_id` | Avatar III $1/분 = 코드 단가 $0.0167 (PR #274) |

→ **음성 쪽은 다 됐다.** 이 문서의 신규 범위는 **사진 아바타 품질 업그레이드**뿐.

---

## 3. 신규 범위 (델타)

옛 **Talking Photo**(`/v1/talking_photo`)를 새 **Photo Avatar 그룹 + Design with AI 룩**(`/v2/photo_avatar/*`, Avatar III)으로 교체·확장한다.

추가 이점: 새 룩은 **진짜 `avatar_id`** 라 `/v2/video/generate` 의 avatar character 에 그대로 들어간다 → `render.py` 의 `avatar_id` 경로와 정합. (옛 talking_photo 는 `talking_photo_id` 별도 인자가 필요한데 `render.py` 는 그걸 안 넘겨, 현재 본인 아바타를 강의에 쓰면 어긋날 소지가 있음 — 이번에 함께 해소.)

---

## 4. 사용자 흐름 (UX)

교수자 온보딩(또는 설정 → 내 아바타):

1. **사진 업로드** — 정면 증명사진(가이드: 흰/단색 배경, 정장, 또렷). 기존 업로드 UI 재사용.
2. **그룹 생성·학습(train)** — 백그라운드. "본인 아바타 준비 중" 진행 표시.
3. **Design with AI 룩 생성** — 프롬프트(배경/복장/구도) 또는 프리셋. **한 번에 N개(기본 4) 배치 생성**, 진행 타일 표시.
4. **룩 선택** — 생성된 룩 갤러리에서 마음에 드는 것 선택 → **기본 룩**으로 저장. (원하면 "추가 생성" 명시 클릭)
5. **움직이는 미리보기** — 선택 룩 + 본인 목소리로 짧은 샘플 렌더(기존 `/me/preview` 확장).
6. 확정 → 이후 모든 강의가 본인 얼굴·목소리로 생성.

---

## 5. 백엔드 파이프라인 (HeyGen v2 + Celery 폴링)

기존 렌더 폴링(`poll_pending_renders`) 패턴을 그대로 따른다 — 외부 비동기 작업 → `generation_id` 저장 → 주기 폴링 → 완료 시 DB 반영.

```
사진 업로드
  └─ POST /v2/photo_avatar/avatar_group/create   (업로드 이미지로 그룹)
  └─ POST /v2/photo_avatar/train                 (그룹 학습; 비동기)
        └─ 폴링: 학습 status → ready
룩 생성 (배치 N)
  └─ POST /v2/photo_avatar/look/generate         (프롬프트, Design with AI)
        └─ 폴링: generation_id status → 이미지 N개 수령
선택 → 기본 룩 avatar_id 저장
미리보기/렌더
  └─ POST /v2/video/generate (character.type=avatar, avatar_id=룩, Avatar III)
```

- 학습·룩 생성은 **Celery task + 상태 폴링**(또는 webhook 가능 시 webhook). 기존 `tasks/polling.py` 구조 확장.
- HeyGen 호출은 `services/pipeline/heygen.py` 에 신규 함수 추가(`create_photo_avatar_group`, `train_photo_avatar_group`, `generate_photo_avatar_looks`, `get_generation_status`). **`HEYGEN_MOCK`(PR #274) 분기 동일 적용** — 테스트 시 ₩0.

---

## 6. 데이터 모델 (변경)

`User` 에 추가 (기존 `photo_avatar_*`/`cloned_voice_*` 와 나란히):

| 필드 | 타입 | 용도 |
|---|---|---|
| `photo_avatar_group_id` | str? | HeyGen avatar group id |
| `photo_avatar_group_status` | str? | `training`/`ready`/`failed` (폴링 키) |
| `photo_avatar_default_look_id` | str? | 선택한 기본 룩의 avatar_id (렌더 기본값) |

신규 테이블 `photo_avatar_looks` (선택 갤러리용):

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid FK | |
| `heygen_look_id` | str | `/v2/video/generate` 에 쓰는 avatar_id |
| `preview_image_url` | str? | 선택 UI 썸네일(S3 presigned) |
| `prompt` | text? | 생성 프롬프트(재현·감사용) |
| `status` | str | `generating`/`ready`/`failed` |
| `created_at` | datetime | |

> alembic 마이그레이션 1건. 머지 전 `alembic heads` 단일 확인(병렬 브랜치 0021 충돌 교훈).

옛 `photo_avatar_id`(Talking Photo)는 **하위호환 유지**하되 신규 온보딩은 group/look 경로 사용.

---

## 7. API 엔드포인트 (신규/변경)

기존 `/api/avatars/*` prefix 계약 유지:

| 메서드·경로 | 역할 |
|---|---|
| `POST /api/avatars/me/photo-avatar` | 사진 업로드 → 그룹 생성 + train 시작 (신규; 기존 `profile-photo` 대체/확장) |
| `GET /api/avatars/me/photo-avatar` | 그룹 학습 상태 폴링 |
| `POST /api/avatars/me/looks` | Design with AI 룩 배치 생성 (body: `prompt`, `count`≤상한) |
| `GET /api/avatars/me/looks` | 룩 목록·생성 상태 |
| `POST /api/avatars/me/looks/{id}/select` | 기본 룩 지정 → `photo_avatar_default_look_id` |
| (재사용) `POST/GET /api/avatars/me/preview` | 선택 룩으로 미리보기 |
| (재사용) `*/api/avatars/me/voice` | 음성 클론 — **변경 없음** |

---

## 8. 비용 모델

| 항목 | 성격 | 단가 | 통제 |
|---|---|---|---|
| 룩 생성(Design with AI) | **1회성**(온보딩) | 이미지 생성당 소액(공개 단가 없음 → 계측) | **배치 상한**(기본 4) + "추가 생성" 명시 클릭. `cost_log` 기록 |
| 그룹 train | 1회성 | 소액/무료 추정 | 계측 |
| 강의 렌더 (Avatar III) | **반복**(강의당) | **$1/분 = $0.0167/sec** = 코드 단가 그대로 | 예산 서킷 브레이커(PR #274)가 이미 커버 |
| 음성 클론(IVC) | 1회성 | ElevenLabs 플랜 내 | 기존 구현 |

- 룩 생성은 누적 반복 비용이 아니므로 viability 무해. **단, 정확한 per-look API 단가가 공개돼 있지 않아** 구현 시 `cost_log`(service="heygen", operation="photo_avatar_look")로 **실측·기록**한다.
- 신규 환경변수(제안): `PHOTO_AVATAR_LOOK_BATCH_MAX`(기본 4), `PHOTO_AVATAR_LOOK_TOTAL_MAX`(교수자당 누적 상한). 0 이면 무제한 아님 — 안전 기본 둘 것.

---

## 9. 기존 시스템 통합 / 렌더 연결

- **렌더 폴백 순서 변경(제안)**: `render`/`video.py` 의 avatar 결정 = `lecture.avatar_id` → **`user.photo_avatar_default_look_id`** → env `HEYGEN_AVATAR_ID_*`. 그러면 "본인 얼굴을 모든 강의에"가 강의별 선택 없이 자동 적용(단일 교수자 시나리오).
- **음성**: 변경 없음 — `cloned_voice_id` 가 이미 `GET /api/voices`·`lecture.voice_id` 로 흐름. (대칭을 원하면 voice 도 동일 user-default 폴백 추가 가능 — 선택.)
- **갤러리**(`/api/avatars`): 본인 룩들을 `is_custom` 으로 노출(큐레이션 필터 제외).

---

## 10. 가드레일·정책 (`02-guardrails` 정합)

- **룩 생성 배치 상한** + 명시적 추가 생성(무심코 다량 생성 방지).
- **동의(consent)**: 본인 실제 사진 기반이므로 HeyGen 이 동의 확인을 요구할 수 있음 → 구현 시 동의 흐름(체크박스/문구) 확인. (영상 클론의 코드-읽기 STT보다 가벼울 것으로 기대 — 미확정, §12 참조.)
- **학생 데이터 보호 정체성**: 교수자 사진·음성 샘플은 사적 prefix + presigned 서빙(기존 패턴). 삭제 시 HeyGen/ElevenLabs 자산도 best-effort 삭제(음성은 이미 구현).
- **비용 투명성**: 룩 생성·렌더 원가를 교수자에게 표시(차별점 #2).

---

## 11. 단계별 구현 계획

1. **HeyGen v2 클라이언트 함수** + `HEYGEN_MOCK` 분기 (`heygen.py`).
2. **데이터 모델** + alembic (User 필드 3 + `photo_avatar_looks`).
3. **Celery task + 폴링**: 그룹 train, 룩 생성 상태.
4. **API 엔드포인트** (§7).
5. **렌더 폴백 순서**(§9) + `cost_log` 룩 계측.
6. **프론트 온보딩 UI**: 업로드 → 진행 → 룩 갤러리(배치) → 선택 → 미리보기. (디자인 시스템 v2 준수, i18n 키 추가)
7. 테스트(mock 기반) + 문서·CLAUDE.md 우선순위 갱신.

---

## 12. 미해결 질문 / 리스크

- **per-look API 단가 미공개** → 구현 1단계에서 실측해 본 문서·`cost_log` 단가에 반영.
- **사진 아바타 동의 요건** — HeyGen v2 Photo Avatar(실제 인물 사진) 의 동의 흐름이 API 로 어떻게 요구되는지 확인 필요.
- **Avatar III 룩의 video.generate 필드** — 룩 id 를 character 에 넣는 정확한 파라미터 명세 docs 재확인.
- **장시간 자연스러움** — 사진 기반이 10~30분 강의에서 충분한지 미리보기로 교수자 검수.

---

## 변경 이력

- 2026-05-31: **설계 v0.2 — 룩 생성 제공자 전환(§0 신설).** 코드 점검으로 train(최대 15분)이 온보딩 최대 병목임을 확인. 룩 생성을 HeyGen Design with AI → **gpt-image-2**, 최종 아바타를 Avatar III(group+train) → **Talking Photo** 로 전환(자연스러움은 룩 출처 무관, 비용 비등·시간 압승). 4단계→1단계 압축. 확정 결정 4건(Talking Photo+input_fidelity / 계정당 누적 상한·소프트 안내 / 16:9 영상·인물중심 룩 / medium tier 3장) + 개선 A~H + PoC 우선. §1~§12 는 맥락 보존(v0.1 HeyGen 풀코스 기준).
- 2026-05-29: 설계 v0.1 최초 작성. 음성 클론(IVC)은 기존 구현 확인 → 신규 범위에서 제외. Avatar III $1/분 = 코드 단가 일치 확정. 룩 생성 1회성·배치 상한 정책.
