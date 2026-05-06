# BACKEND_ASKS — R2W3 (`feat/professor-onboarding`)

> 본 문서는 R2W3 (교수자 첫 사용 온보딩) 가 더 깔끔하게 동작하기 위해 R2W2
> (백엔드) 측에 부탁드리는 항목들입니다. **본 PR 자체는 백엔드 변경 없이 정상
> 빌드·렌더되며**, 아래 항목들은 후속 PR 로 추가되면 자동 활성화됩니다.

---

## 1. 인증된 교수자가 본인 프로필을 갱신할 수 있는 엔드포인트 ⭐

### 현재 상태
`POST /api/auth/complete-profile` 가 존재하나 OAuth 직후의 `temp_token` 을
요구하므로, **이미 로그인한 교수자가 학과·소속을 채우거나 수정**하는 흐름에서는
사용할 수 없습니다 (`backend/app/api/v1/auth.py` §232-).

### 부탁
다음 두 옵션 중 하나를 R2W2 에서 추가해주시면 본 화면의 모달이 즉시 정상
저장 경로로 전환됩니다.

#### 옵션 A — 권장: `PATCH /api/auth/complete-profile`
같은 endpoint 에 `PATCH` 메서드를 추가, `temp_token` 없이 `Authorization: Bearer`
로 인증한 사용자가 본인 프로필을 갱신.

```python
# backend/app/api/v1/auth.py 추가 예
@router.patch(
    "/complete-profile",
    response_model=AccessTokenOnlyResponse,  # or 200/204
    summary="(인증된 사용자) 프로필 보강 — 학과·소속·직위 갱신",
)
async def patch_profile(
    body: CompleteProfileRequest,    # 기존 schema 재사용 (school/department/student_number)
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role == "professor":
        if body.school: user.school = body.school
        if body.department: user.department = body.department
        # position 필드 추가 시: if body.position: user.position = body.position
    await db.commit()
    return ...
```

본 프론트는 이미 다음 페이로드로 `PATCH` 를 호출 중입니다:
```json
{ "school": "경기대학교", "department": "중어중문학과", "position": "positionProfessor" }
```

#### 옵션 B: `PATCH /api/users/me`
RESTful 하게 신설. body 스키마는 위와 동일.

본 프론트는 옵션 A 가 도착하지 않았다고 가정하고도 동작합니다 (요청 실패 시
"임시 저장됨" 토스트로 graceful fallback). 하지만 옵션 A 가 들어오면 한 줄도
바꾸지 않고 정상 저장 경로로 자동 전환됩니다.

---

## 2. `User` 에 `position` (직위) 필드 추가 (선택)

기획 §3.4 에 직위 입력란이 명시되어 있어 모달이 받고 있지만, 백엔드 `User`
모델에는 현재 `school`, `department` 만 존재합니다 (`backend/app/models/user.py:27-28`).

### 부탁
```python
# backend/app/models/user.py
position: Mapped[str | None] = mapped_column(String(64), nullable=True)
```

`CompleteProfileRequest` 에도 `position: str | None = None` 를 추가해주시면,
프론트가 보내는 `position` 값이 그대로 저장됩니다. 미추가 시 백엔드가 해당 키를
무시하면 되며, 프론트에서는 React state 로만 보존됩니다.

---

## 3. `GET /api/auth/me` (또는 `GET /api/users/me`) (선택)

### 현재 상태
`AuthContext` 가 JWT payload 에서 `id`, `role` 만 추출하고 있어, `user.school` /
`user.department` 가 채워졌는지 프론트에서 알 수 없습니다 (`AuthContext.tsx:63-69`).

### 부탁
인증된 사용자의 전체 프로필(이름, 이메일, school, department, position, 가입일
등) 을 반환하는 GET 엔드포인트가 있으면, 모달 자동 오픈 조건을
"강의 0개 + user.school 비어있음" 으로 정밀화할 수 있습니다.

```python
@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user)):
    return user
```

---

## 4. (참고) 단계 ③ vs ④ 분리 정밀화 — 현재는 합쳐서 판정

기획 §3.3 의 5단계 중 ③ "PPT 업로드" 와 ④ "AI 스크립트 검토 / 승인" 을 정확히
구분하려면 다음 중 하나가 필요합니다.

- (가) `Lecture` 에 `script_approved_at: datetime | None` 컬럼 추가
- (나) `VideoRender` 의 `created_at` (또는 `started_at`) 을 lecture 응답에 포함

본 브랜치는 (나) 가 도착할 때까지 `pipeline_task_id` 와 `video_url` 의 존재
여부로 ④ 를 추론합니다 — 첫 영상 생성을 시작한 사용자에게는 의도와 거의 일치
하지만, "PPT 만 업로드하고 스크립트 검토 직전에 멈춘 사용자" 와 구분되지 않을
수 있습니다.

위 (가) 또는 (나) 중 어느 쪽이든 도착하면 `onboardingSteps.ts` 의 한 함수만
수정하면 됩니다.

---

## 우선순위 요약

| 우선순위 | 항목 | 영향 |
|:---:|---|---|
| 🟥 high | §1 PATCH /api/auth/complete-profile | 모달 저장이 실제 DB 에 반영되도록 |
| 🟧 medium | §3 GET /api/auth/me | 모달 자동 오픈 조건 정밀화, 첫 진입 UX 정교화 |
| 🟨 low | §2 User.position 필드 | 직위 정보 영속화 (없어도 모달 동작) |
| 🟨 low | §4 ③/④ 분리 신호 | 체크리스트 진행도 정확도 향상 |
