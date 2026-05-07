# BACKEND_ASKS — feat/profile-a11y (2026-05-07)

> 본 문서는 `/profile` 학생 마이페이지 구현 중 **백엔드 측 보강이 필요한 항목**을
> 정리한 것입니다. 본 PR 의 프론트는 모두 graceful fallback (mock + "샘플
> 데이터" 배지) 으로 동작하며, 아래 endpoint 가 추가되면 `fetchProfile.ts` 가
> 자동으로 실데이터로 교체합니다.

| ID | 우선순위 | 사용처 | 영향 |
|---|---|---|---|
| §1 | High | 통합 `/api/v1/profile/me` endpoint | 한 번 호출로 전 화면 채움 |
| §2 | Medium | 일별 시청 분 스트릭 | 잔디 히트맵 정확성 |
| §3 | High | 인증서 PDF 생성 + 공유 링크 | "PDF 다운로드"·"공유" 활성 |
| §4 | Low | 격려 메시지 inbox | 학습 동기 복원 |
| §5 | Low | 학생용 user 메타 (school/department 등) 노출 | header subtitle 정확성 |

---

## §1. 통합 endpoint (High)

**현재** — `fetchProfile.ts` 가 다음 순으로 시도:
1. `GET /api/v1/profile/me` (가상, 시도해보고 404 면 fallback)
2. `GET /api/v1/sessions` (실재) → watchedSec / 완료 영상 수 추출
3. 나머지 (스트릭·인증서·격려·질문) 는 mock 으로 채움

**요청**:
```
GET /api/v1/profile/me
Authorization: Bearer <student_jwt>

200 OK
{
  "user": {
    "id": "...",
    "email": "...",
    "name": "...",
    "school": "...",
    "department": "...",
    "studentNumber": "...",
    "year": 3
  },
  "streak": {
    "currentDays": 12,
    "longestDays": 25,
    "thisWeekDays": 5,
    "days": [
      { "date": "2026-04-01", "watchedMinutes": 23 },
      ...   // 최근 90일
    ]
  },
  "stats": {
    "watchedMinutes": 1380,
    "videosCompleted": 5,
    "averageAccuracy": 82,
    "questionsSent": 47,
    "encouragementsReceived": 12
  },
  "inProgress": [
    { "courseId": "...", "title": "...", "percent": 78, "lastWatchedAt": "2026-05-04" },
    ...
  ],
  "completed": [
    { "courseId": "...", "title": "...", "percent": 100, "lastWatchedAt": "2026-04-10" }
  ],
  "certificates": [
    {
      "id": "...",
      "courseId": "...",
      "title": "...",
      "issuedAt": "2026-04-12",
      "pdfUrl": "https://cdn.classauto.live/cert/abc.pdf",
      "shareUrl": "https://classauto.live/cert/abc"
    }
  ],
  "encouragements": [
    { "id": "...", "professor": "...", "message": "...", "receivedAt": "2026-05-03" }
  ],
  "recentQuestions": [
    {
      "id": "...",
      "question": "...",
      "inScope": true,
      "responded": true,
      "askedAt": "2026-05-04"
    }
  ]
}
```

**프론트 측 영향**: 본 응답 형태는 `ProfileSnapshot` 타입과 1:1. 이미 `fetchProfile.ts`
가 통합 endpoint 를 우선 시도하므로, 백엔드가 본 endpoint 를 추가하면 즉시
실데이터로 교체된다.

### 권장 구현 (FastAPI)

`backend/app/api/v1/profile.py` 추가 — 내부적으로 sessions / certificates /
encouragements 서비스를 호출해 응답을 합성. 캐시 60초 권장.

---

## §2. 일별 학습 분 스트릭 (Medium)

§1 의 `streak.days` 가 핵심. 가능하면 다음 endpoint 로 분리해 다른 화면(교수자
분석 등) 과 재사용:

```
GET /api/v1/learners/me/streak?days=90

200 OK
{
  "currentDays": 12,
  "longestDays": 25,
  "days": [
    { "date": "2026-04-01", "watchedMinutes": 23 },
    ...
  ]
}
```

서버 계산: `LearningSession.watched_sec` 을 사용자별 + 날짜(UTC 기준 또는 학생
설정 timezone) 그룹핑 → 분 합계.

스트릭 계산:
```python
def streak_days(daily_minutes: dict[date, int], today: date) -> int:
    n = 0
    d = today
    while daily_minutes.get(d, 0) > 0:
        n += 1
        d -= timedelta(days=1)
    return n
```

---

## §3. 인증서 PDF 생성 + 공유 링크 (High)

**현재** — UI 는 카드 + 두 버튼 (PDF / 공유) 슬롯을 미리 잡아두고, 백엔드 미구현 상태에서는
`pdfUrl=null, shareUrl=null` 로 disabled + "준비 중" 안내.

**요청**:

### §3.1 발급
```
POST /api/v1/certificates
{
  "course_id": "...",
  "user_id": "..."   // 본인 또는 교수자 발급
}

200 OK
{
  "id": "...",
  "courseId": "...",
  "title": "...",
  "issuedAt": "2026-05-07",
  "pdfUrl": "https://cdn.classauto.live/cert/abc.pdf",
  "shareUrl": "https://classauto.live/cert/abc"
}
```

발급 조건: 강의 진도 100% + 평가 통과 (Pro 플랜은 추가 학습 점수 임계값).
중복 발급 차단 — 같은 (user, course) 페어는 idempotent (기존 인증서 반환).

### §3.2 PDF 렌더링
- WeasyPrint (Python) 또는 Playwright 렌더링
- 템플릿: 학생명 / 강의명 / 발급일 / QR (공유 링크) / 교수자명
- 위·변조 방지: 발급 hash 를 PDF metadata + URL 쿼리로 동봉

### §3.3 공유 페이지
- `GET https://classauto.live/cert/{shareToken}` — 공개 (인증 불필요), HTML 으로
  인증서를 노출. 쿼리에 `?download=pdf` 면 PDF 리다이렉트.
- shareToken 은 UUID v4 + 발급 시 1회 발급 (재발급 불가).

---

## §4. 격려 메시지 inbox (Low)

`05-instructor-pages.md` §8.3 "격려 메시지 보내기" 의 학생 측 inbox.

```
GET /api/v1/learners/me/encouragements?limit=20

200 OK
{
  "items": [
    {
      "id": "...",
      "professor": "...",
      "courseId": "...",
      "message": "...",
      "receivedAt": "2026-05-03T09:14:00Z"
    }
  ]
}
```

이 endpoint 는 R3W4 (learners) 의 BACKEND_ASKS §3 (`POST .../notify`) 와 짝.
교수자 측 발송 → 학생 측 inbox 가 한 데이터 흐름.

---

## §5. user 메타 노출 (Low)

현재 `AuthContext.user` 는 `{ id, email, name, role }` 만 노출 (school /
department 등 누락). `/profile` header 가 정확한 소속을 표시하려면:

- `GET /api/v1/users/me` 가 school / department / studentNumber / year 를
  포함해 반환하도록 확장
- 또는 `AuthContext` 가 mount 시 `/users/me` 를 fetch 해 추가 필드를 보강

본 PR 은 fallback 으로 "학교 · 학과 정보 미입력" 텍스트만 노출.

---

## 6. 머지 시 동기화 체크리스트

- [ ] §1 endpoint 가 추가되면 `fetchProfile.ts` 의 fan-out 가지를 모두 제거
      가능 (통합 endpoint 만 호출). 또는 둘 다 시도해도 OK — 현재 코드는 양쪽
      대응.
- [ ] §3 가 추가되면 `Certificate.pdfUrl` / `shareUrl` 필드가 채워지면서
      `CertificateList` 의 두 액션이 자동 활성화 (UI 수정 불필요).
- [ ] §4 가 추가되면 `EncouragementList` 의 격려 단이 실데이터로 자동 교체.
- [ ] §5 가 추가되면 `ProfileContent` 의 header subtitle 이 자동 정확화.
