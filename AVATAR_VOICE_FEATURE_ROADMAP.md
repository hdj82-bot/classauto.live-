# 아바타 / 음성 — 플랜별 차등화 기능 로드맵

> **결정일**: 2026-04-29
> **상태**: Phase 0(인프라 배포) 이후 별도 기능 스프린트로 처리
> **현재 코드 상태**: 렌더 요청별 `avatar_id` 파라미터는 이미 지원, 사용자별/플랜별 차별화 미구현

---

## 제품 정책

| 플랜 | 아바타 | 음성 | 비고 |
|------|--------|------|------|
| **Free** | HeyGen 기본 아바타 라이브러리에서 선택 | 시스템 제공 ElevenLabs voice 중 선택 | 사용자별 선택 가능, 단 풀에서만 |
| **Basic** | 본인 사진으로 만든 Custom Photo Avatar 1개 | 본인 음성으로 만든 Cloned Voice 1개 | 한 명당 하나씩 |
| **Pro** | Custom Photo Avatar 무제한 + 풀 접근 | Cloned Voice 다수 + 다국어 voice clone | 강의/캐릭터별 분리 가능 |

---

## 외부 API 의존성

### HeyGen
- **기본 아바타**: HeyGen API `/v1/avatars` 또는 `/v2/avatars` 로 라이브러리 조회
- **Custom Photo Avatar**: `/v2/photo_avatar/photo/generate` → `/v2/photo_avatar/avatar_group` 생성 흐름
  - Free 플랜에선 API 호출 자체가 가능한지 HeyGen 문서 재확인 필요 (보통 Pro 이상에서 활성화)

### ElevenLabs
- **시스템 voice**: ElevenLabs Voice Library 공유 voice 사용
- **Instant Voice Cloning (IVC)**: Free 플랜은 3개 cloned voice까지, Starter $5/월부터
- **Professional Voice Cloning (PVC)**: Pro 플랜 이상 — 더 정확한 합성

---

## DB 스키마 변경 필요

```sql
-- users 테이블 확장
ALTER TABLE users ADD COLUMN heygen_avatar_id VARCHAR(255);  -- 기본 아바타
ALTER TABLE users ADD COLUMN elevenlabs_voice_id VARCHAR(255);  -- 기본 음성

-- 새 테이블: 사용자가 만든 커스텀 아바타들
CREATE TABLE custom_avatars (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  heygen_avatar_id VARCHAR(255) NOT NULL,
  source_photo_url VARCHAR(500),         -- S3에 업로드한 원본 사진
  name VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 새 테이블: 사용자가 만든 cloned voice들
CREATE TABLE custom_voices (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  elevenlabs_voice_id VARCHAR(255) NOT NULL,
  source_audio_url VARCHAR(500),         -- 원본 음성 샘플
  name VARCHAR(100),
  language VARCHAR(10) DEFAULT 'ko',
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 백엔드 API 추가 필요

```
GET  /api/v1/avatars/library          # HeyGen 기본 아바타 목록 (전체 플랜)
GET  /api/v1/avatars/my                # 내가 만든 custom avatar 목록 (Basic/Pro)
POST /api/v1/avatars/custom            # 사진 업로드 → Photo Avatar 생성 (Basic/Pro)
DELETE /api/v1/avatars/custom/{id}     # 커스텀 아바타 삭제

GET  /api/v1/voices/library            # 시스템 voice 목록
GET  /api/v1/voices/my                  # 내가 만든 cloned voice 목록 (Basic/Pro)
POST /api/v1/voices/custom             # 음성 샘플 업로드 → IVC 생성 (Basic/Pro)
DELETE /api/v1/voices/custom/{id}      # 클론 voice 삭제

PATCH /api/v1/users/me                 # 기본 avatar/voice 변경
  body: { heygen_avatar_id, elevenlabs_voice_id }
```

각 엔드포인트는 `subscription.plan` 검증 의존성 적용:
```python
from app.api.deps import require_plan

@router.post("/custom", dependencies=[Depends(require_plan("basic", "pro"))])
async def create_custom_avatar(...): ...
```

---

## 프론트엔드 추가 필요

- **설정 페이지**: 기본 아바타/음성 선택 드롭다운
- **Free 플랜 UI**: 라이브러리에서 선택만 가능, 커스텀 생성 버튼은 비활성 + "Basic 플랜에서 사용 가능" 안내
- **Basic/Pro UI**:
  - "내 아바타 만들기" — 사진 업로드 → 미리보기 → 저장
  - "내 음성 만들기" — 마이크/파일 업로드 → 30초~1분 샘플 → IVC 호출 → 저장
- **강의 생성 시**: 아바타/음성 선택 또는 기본값 사용

---

## 비용 영향

- **Free**: 추가 비용 없음 (기존 시스템 voice/avatar 사용)
- **Basic** ($X/월): HeyGen Pro 플랜($24/월) 일부 + ElevenLabs Starter($5/월) 분담
- **Pro** ($Y/월): HeyGen Scale 플랜 + ElevenLabs Creator/Pro

→ 가격 책정 시 외부 API 원가 + 마진 + Vercel/Railway/Supabase 인프라비 모두 반영 필요

---

## 구현 우선순위 (Phase 0 인프라 배포 완료 후 시작)

1. **Sprint A** (1주): DB 스키마 + 기본 아바타/음성 선택 (Free 플랜 기능)
   - `users.heygen_avatar_id`, `users.elevenlabs_voice_id` 추가
   - HeyGen 라이브러리 조회 API
   - 프론트 설정 페이지

2. **Sprint B** (1~2주): Custom Photo Avatar (Basic/Pro)
   - 사진 업로드 → S3 → HeyGen Photo Avatar Group 생성
   - `custom_avatars` 테이블 + CRUD API
   - 플랜 gate

3. **Sprint C** (1~2주): Voice Cloning (Basic/Pro)
   - 음성 샘플 업로드 → ElevenLabs IVC
   - `custom_voices` 테이블 + CRUD API

4. **Sprint D** (1주): 강의 생성 플로우 통합
   - 강의별 avatar_id/voice_id 선택 UI
   - 사용자 기본값 fallback 로직
