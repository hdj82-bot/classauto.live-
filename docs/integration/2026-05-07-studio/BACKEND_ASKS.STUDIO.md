# BACKEND_ASKS.STUDIO — 영상 제작 마법사 후속 백엔드 작업

> **창**: W1 (창1)
> **상태**: 본 PR 머지를 차단하지 않음. 별도 PR 권장.
> **연관**: `MERGE_NOTES.STUDIO.md` §5

마법사가 더 정확하게 동작하려면 다음 5개 endpoint·필드가 필요합니다.
모두 **현재는 휴리스틱·placeholder** 로 처리되어 UI 가 동작은 하지만,
정확도·UX 가 완전하진 않습니다.

---

## §1. Script segment 의 `low_information` 플래그

### 현재 동작

`Step2ScriptReview` 의 좌측 슬라이드 패널에서 "보강 필요" 마크가 다음
휴리스틱으로 표시됨:

```ts
const looksInsufficient = current.text.trim().length < 20;
```

### 요청

`script_generator` 가 segment 별로 신뢰도·정보량을 판단해서 다음 중
하나를 응답에 포함:

```python
class ScriptSegment(BaseModel):
    ...
    low_information: bool = Field(
        default=False,
        description="AI 가 정보 부족으로 판단한 슬라이드. 교수자에게 직접 편집 권장 마크.",
    )
    # 또는
    confidence: float = Field(
        default=1.0, ge=0.0, le=1.0,
        description="0~1 신뢰도. 0.5 미만이면 UI 가 보강 필요로 마크.",
    )
```

프론트는 `looksInsufficient` 휴리스틱을 제거하고 백엔드 플래그를 직접 사용.

---

## §2. 플랜 사용량 조회 endpoint

### 현재 동작

`/professor/studio/[lectureId]/page.tsx` 가 `usage` 를 무제한
(`limit=0`) 으로 placeholder. CostMeter 가 절대 차단하지 않음.

```ts
const usage: PlanUsage = useMemo(
  () => ({ used: 0, limit: 0, monthlyVideoCount: 0, monthlyVideoLimit: 0 }),
  [],
);
```

### 요청

```
GET /api/v1/subscription/usage

Response:
{
  "plan": "free" | "basic" | "pro",
  "monthly_cost_used_usd": 12.40,
  "monthly_cost_limit_usd": 50.00,         // 0 = 무제한
  "monthly_video_count": 3,
  "monthly_video_limit": 10,                // 0 = 무제한
  "resets_at": "2026-06-01T00:00:00Z"
}
```

이미 백엔드의 `app/services/cost_tracker.py` 가 record_once 로 누적합을
가지고 있을 것이므로 sum + 플랜 매트릭스 join 정도면 가능할 듯.

프론트는 Step3 진입 시 한 번 fetch + Step4 승인 후 invalidate.

---

## §3. QR 코드 PNG 생성 endpoint

### 현재 동작

`Step5Share` 의 "QR 다운로드" 버튼은 disabled. URL 복사로 대체.

### 요청

```
GET /api/v1/lectures/{slug}/qr.png?style=gold|dark|light&size=1024

Response: image/png 1024×1024 (또는 size 파라미터)
```

기획서 §5.5 의 디자인 가이드:
- 정사각형 PNG 1024×1024
- 중앙에 ClassAuto 로고 (오버레이)
- 골드 그라데이션 옵션

이유:
- 학생 데이터 보호 정책 위반 가능성 (외부 QR API 호출 = 서드파티에
  학생 강의 URL 공유) 회피
- 캐시·CDN 가능
- 인쇄용 고해상도 — 클라이언트 라이브러리는 보통 256~512 까지만 깨끗

`Pillow` + `qrcode` Python 패키지 조합으로 50줄 미만 구현 가능.

---

## §4. 단일 강의 조회 endpoint

### 현재 동작

`/professor/studio/[lectureId]/page.tsx` 의 `fetchLecture` 가
의도치 않게 우회 경로:

```ts
// 1차 시도: GET /api/lectures/{id}/public — id 가 slug 가 아니라 실패
// 2차 fallback: 모든 강좌 + 강좌별 강의를 순회해서 매칭
```

이 fallback 은 강좌가 많으면 N+1 문제. 이미 비슷한 R2W2 패턴.

### 요청

```
GET /api/lectures/{lecture_id}                # UUID 기반, 교수자 전용

Response: LectureResponse (이미 정의됨)
```

본 endpoint 가 도착하면 `fetchLecture` 의 fallback 흐름 제거.

---

## §5. TTS 단발 미리듣기 (Preview)

### 현재 동작

기획서 §5.3 (3) 의 슬라이드별 ▶ 미리듣기 버튼은 **미구현**.
프론트에 placeholder 도 두지 않았음 — 호출 endpoint 자체가 없으면 UI 만
달아둘 수도 없어서.

### 요청

```
POST /api/v1/render/preview-tts
Body: {
  "text": "안녕하세요. 오늘은 ...",         // ≤ 500자
  "tts_provider": "elevenlabs" | "google",
  "voice_id": "..."                          // 선택 (사용자 default voice 가 있으면 미사용)
}

Response: audio/mpeg (1~10초 분량)
```

가드레일:
- 본 endpoint 도 사용량 카운터에 기록 (record_once 의 별도 키:
  `tts_preview` — 영상 합성 비용과 분리되어 표시).
- 글자수 500자 이내 (1차 가드레일과 동일)
- 빈도: 분당 10회·시간당 60회 권장
- 같은 text + provider + voice 조합은 캐시 (cost 절감)

프론트는 도착 후 Step2 의 슬라이드 헤더에 ▶ 버튼 추가 + Step3 의 음성
드롭다운 옆에 "샘플 듣기" 추가.

---

## §6. (선택) 마법사 컨텍스트 fetch one-shot

### 현재 동작

`/professor/studio/[lectureId]/page.tsx` 가 4개 endpoint 를 병렬로 호출:

1. `GET /api/lectures/{id}` (또는 fallback)
2. `GET /api/lectures/{id}/video`
3. `GET /api/videos/{video_id}/script`
4. `GET /api/v1/render/lecture/{id}` (Step 4 진입 시)

### 요청 (선택 — 성능 최적화 항목)

```
GET /api/v1/studio/lecture/{lecture_id}/context

Response: {
  "lecture": LectureResponse,
  "video": { id, status, ... } | null,
  "script": ScriptResponse | null,
  "pipeline_status": { phase, progress } | null,
  "render_summary": { total, completed, failed } | null
}
```

3~4 라운드트립을 1번으로 압축. 폴링은 그대로 유지.

베타 출시 차단 아님 — N+1 호출도 강의 단위라 부담 작음.
