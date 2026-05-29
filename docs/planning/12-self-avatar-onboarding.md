# 12. 교수자 본인 아바타 온보딩 — Photo Avatar 룩(Design with AI)

> 상태: 🟡 설계 v0.1 (2026-05-29) · 근거: HeyGen Photo Avatar API + 기존 `avatars.py`/`render.py` 코드 조사

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

- 2026-05-29: 설계 v0.1 최초 작성. 음성 클론(IVC)은 기존 구현 확인 → 신규 범위에서 제외. Avatar III $1/분 = 코드 단가 일치 확정. 룩 생성 1회성·배치 상한 정책.
