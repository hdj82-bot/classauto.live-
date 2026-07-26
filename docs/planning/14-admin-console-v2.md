# 14 · 운영자 콘솔 v2 — 통합·QR·자료열람·이슈추적 구현 스펙

> **대상**: Claude Code · **연계 문서**: `docs/planning/13-beta-admin-console.md`, `docs/planning/09-beta-program.md`
> **디자인 기준**: `frontend/public/prototypes/08-admin-console.html` (이 문서와 한 쌍)
> **목표**: 2026년 8월 교수진 베타 배포 전 운영자 콘솔 완성
> **작성 근거**: 현 `main` 브랜치 실코드 점검 (Alembic head `0070`, 커밋 `a085372`)

스펙 13(A~G)은 **이미 전부 머지 완료**다. 이 문서는 그 위에 얹는 **v2 작업**이며, 요청 원문은
"계정주가 초대 주소·QR을 직접 만들고, 각 베타테스터가 어떤 활동을 하고 어떤 자료를 만드는지 한 눈에
파악하고, 버그가 있으면 직접 눈으로 확인·수정할 수 있는 관리자 전용 페이지".

---

## 0. 절대 불변 규칙 (깨지 말 것)

1. **초대 게이트는 교수자 전용.** 교수자 가입은 유효한 `ProfessorInvite`(단일 사용 + 만료)를
   통과해야만 가능하다.
   > **2026-07-25 변경 — 이메일 잠금은 선택이 됐다.** 베타테스터 모집에서 상대의 Google 이메일을
   > 미리 알아야 발급할 수 있는 게 실무상 걸림돌이라, `professor_invites.email` 을 nullable 로
   > 바꿔 **공개 초대**(대상 미지정)를 허용한다. 운영자는 링크·QR 만 만들어 전달하고 그 링크를 연
   > **첫 1명**이 가입한다. 이메일을 적으면 종전처럼 그 계정만 가입하는 지정 초대가 된다.
   >
   > 이메일 잠금이 빠지면 **토큰 자체가 자격증명(bearer)** 이므로 단일 사용이 마지막 방어선이
   > 된다. 따라서 소비는 반드시 `used_at IS NULL` 조건부 UPDATE(`services/invite.claim_invite`)로
   > **원자적**이어야 하고, **유저를 만들기 전에** 자리를 잡아야 한다. 만들고 나서 소비하면 같은
   > 링크를 동시에 연 두 사람이 둘 다 교수자로 생성된 뒤에야 소비 단계에 도달한다.
2. **학생은 초대 게이트와 무관.** 학생은 교수자가 만든 강의 링크로 자유 가입한다. 이 문서의 어떤
   작업도 **학생 회원가입 흐름을 건드려선 안 된다.**
3. **운영자 임퍼서네이션은 읽기 전용이다.** F 작업의 view-as 세션은 어떤 경로로도 쓰기를 허용하지
   않는다. "관리자니까 대신 고쳐준다"는 유혹을 코드에 남기지 말 것 — **이 문서가 새로 추가하는
   쓰기는 §5 의 4개뿐이다**(기존 쓰기는 §5 후단 참조).
4. **마이그레이션은 수기 작성**(autogenerate 아님). 기존 `00XX_*.py` 컨벤션(`Revision ID`,
   `Revises`, 한글 docstring, upgrade/downgrade)을 따른다.
   **번호는 착수 시점의 `alembic heads` + 1** — 이 문서에 구체 번호를 적지 않는다.
5. **디자인은 v2 토큰만.** `docs/design-system/` 의 라이트 베이지 + 골드. 현 `/admin/*` 페이지의
   `bg-gray-50` · `indigo-600` 은 v2 이전 잔재이므로 이번에 전부 교체한다. 프로토타입 08 이 기준.
6. **차트 색은 골드 단일 시퀀셜 램프만.** 서비스 5종에 5색을 배정하는 카테고리컬 팔레트는 v2 정책
   (violet·cyan·pink 폐기)과 충돌한다. 색은 크기(magnitude)만 인코딩하고, 항목 구분은 형태·직접
   라벨·표가 맡는다. 의미 컬러(빨강·초록·파랑)는 상태 칩과 인디케이터에만 예약.
7. **localStorage 금지**(기존 규칙). 콘솔 상태는 React state 또는 URL 쿼리로만.

---

## 1. 이미 있는 것 (재구현 금지)

| 요구 | 상태 | 위치 |
|---|---|---|
| 초대 발급·목록·취소 | ✅ 완료 | `app/api/v1/invites.py` (`/api/owner/invites`), `app/services/invite.py` |
| 초대 URL 생성 | ✅ 완료 | `InviteResponse.invite_url` 이 이미 응답에 포함 |
| 테스터별 사용량 롤업 | ✅ 완료 | `/api/v1/admin/beta-overview`, `app/services/admin_analytics.py` |
| 단일 테스터 드릴다운 | ⚠️ 부분 | `/api/v1/admin/users/{id}/usage` — **강의 제목·발행여부만** 반환 |
| 활성화 퍼널 | ✅ 완료 | `/api/v1/admin/funnel` |
| 감사 로그 | ✅ 완료 | `admin_audit_logs`, `/api/v1/admin/audit`, `app/services/admin_audit.py` |
| 피드백 수집·열람 | ✅ 완료 | `feedbacks`, `POST /api/v1/feedback`, `/api/v1/admin/feedback` |
| 전역 피드백 버튼 | ✅ 완료 | `components/feedback/GlobalFeedbackButton.tsx` (`page` 이미 전송) |
| 비용 통합 집계 | ✅ 완료 | `/api/v1/admin/costs` (두 비용 테이블 합산) |
| 코호트·베타 동의 | ✅ 완료 | `users.cohort`, `users.beta_consented_at`, `professor_invites.cohort` |
| 재렌더 상한·카운터 리셋 | ✅ 완료 | `lectures.avatar_render_count`, `POST /admin/lectures/{id}/reset-avatar-rerender` |
| 렌더 실패 사유 저장 | ✅ 완료 | `video_renders.error_message` (Text), `status` (index) |
| QR 생성 라이브러리 | ✅ 설치됨 | `qrcode@^1.5.4` + `@types/qrcode` — `professor/studio/ShareLinks.tsx` 에 사용 선례 |

### 1.1 사전 확인된 사실 (틀린 전제로 작업하지 말 것)

- **`require_admin` 과 `require_owner` 는 현재 동작이 동일하다.** 둘 다
  `user.role.value == "admin" or email in settings.admin_email_set` 로 통과시킨다
  (`app/api/deps.py:210, 227`). 스펙 13 §0-3 의 "role 기준" 서술은 이후 커밋으로 무효화됐다.
  → **계정주 계정의 `users.role` 을 `admin` 으로 바꿀 필요 없다.** 오히려 바꾸면
  `require_professor` 의존 기능(강의 제작·학습분석 PRO)이 깨진다.
  → 따라서 이번 통합의 실익은 **권한 일원화가 아니라 URL·화면 일원화**다.
- **`GlobalFeedbackButton` 은 `page` 를 이미 보내고 있다**(`usePathname()`, 54행). 빠진 건
  `lecture_id` 뿐이다. 또한 이 버튼은 `pathname.startsWith("/admin")` 에서 `null` 을 반환하므로
  콘솔 화면에는 뜨지 않는다(의도된 동작, 유지).
- **Alembic head 는 `0070`**. 스펙 13 의 "다음은 0053" 은 이미 소진된 번호다.
- 렌더는 **강의당 여러 행**이다(`video_renders.slide_number` — 슬라이드/클러스터 단위). 실패 목록을
  만들 때 강의 단위로 묶지 않으면 같은 사고가 N행으로 보인다.

---

## 2. 작업 목록 A~F

신규 read 엔드포인트는 기존 `app/api/v1/admin.py` 라우터
(`prefix="/api/v1/admin"`, `Depends(require_admin)`)에 추가한다.

---

### A. 초대 화면 통합 + QR *(프론트 전용, 백엔드 변경 0)*

**목표**: `/owner/invites` → `/admin/invites` 로 이전하고 QR을 붙인다.

- **신규 페이지** `frontend/src/app/admin/invites/page.tsx`
  - 기존 `frontend/src/app/owner/invites/page.tsx` 의 로직을 옮겨온다.
    API 클라이언트(`lib/api.ts::ownerInviteApi`)는 **그대로 재사용** — 엔드포인트 URL
    (`/api/owner/invites`)은 건드리지 않는다.
  - `ProtectedRoute` 는 `admin/layout.tsx` 가 이미 `allowedRoles={["admin"]} allowOwner` 로 감싸므로
    페이지 내부의 개별 `ProtectedRoute` 는 **제거**한다(이중 가드 불필요).
  - 발급 폼에 **`cohort` 셀렉트 추가** — `POST /api/owner/invites` 의 `InviteCreateRequest.cohort`
    가 이미 받는데 현 UI에 입력란이 없다. `2026-08` / `2026-09` / 없음.
- **QR 컴포넌트** `frontend/src/components/admin/InviteQr.tsx` (신규)
  - `ShareLinks.tsx` 와 **동일 패턴**: `import("qrcode")` 동적 import →
    `QRCode.toDataURL(url, { width: 480, margin: 2, errorCorrectionLevel: "M" })`.
    (동적 import 이유: 인코딩 테이블 포함 라이브러리를 admin 초기 번들에서 빼기 위함.)
  - 기능 3종: **표시 / PNG 다운로드 / 링크 복사**. 다운로드·복사는 브라우저가 조용히 처리하므로
    `ShareLinks.tsx` 처럼 **클릭 직후 1.8초 ✓ 피드백**을 띄운다(무반응처럼 보이는 문제 방지).
  - 목록 각 행의 `QR` 버튼으로 과거 초대의 QR도 다시 꺼낼 수 있어야 한다(오프라인 워크숍 재인쇄).
- **`/owner/invites` 처리**: 삭제하지 말고 `redirect("/admin/invites")` 하는 스텁만 남긴다
  (계정주가 북마크해 뒀을 수 있음). `frontend/src/app/owner/costs/page.tsx` 도 동일하게
  `/admin/costs` 로 redirect.
- **i18n**: `frontend/messages/ko.json` · `en.json` 의 `admin.*` 네임스페이스에 키 추가.
  기존 `auth.owner.*` 키를 재사용하지 말고 `admin.invites.*` 로 새로 판다.

**수용 기준**: 계정주 로그인 → `/admin/invites` 에서 이메일+코호트 입력 → 발급 → QR이 즉시 뜨고,
그 QR을 폰으로 스캔하면 `/auth/invite?token=...` 이 열린다.

---

### B. 테스터 자료 열람 *(신규 read 엔드포인트 — 이 문서의 핵심)*

**문제**: `/admin/users/{id}/usage` 는 강의 **제목만** 준다. "어떤 자료를 만들어 사용하는지"가
안 보인다.

**신규 엔드포인트** `GET /api/v1/admin/users/{user_id}/artifacts`

강의별로 **PPT → 스크립트 → 아바타 → 퀴즈** 4단계 상태를 반환한다. 각 단계 판정 근거:

| 단계 | 상태 판정 | 소스 |
|---|---|---|
| `ppt` | 슬라이드 행 수 > 0 → `ok`, 아니면 `none` | `embeddings WHERE lecture_id` (`slide_image_url` 보유 행) |
| `script` | `video_scripts.approved_at IS NOT NULL` → `ok` / 행 존재 → `run` / 없음 → `none` | `videos → video_scripts` |
| `avatar` | `videos.status`: `done`→`ok`, `rendering`→`run`, 그 외엔 최근 `video_renders.status == failed` 면 `fail`, 아니면 `none` | `videos`, `video_renders` |
| `quiz` | `COUNT(questions WHERE lecture_id) > 0` → `ok`, 아니면 `none` | `questions` |

응답 스키마:

```jsonc
{
  "user": { "id": "...", "email": "...", "name": "...", "cohort": "2026-08",
            "beta_consented_at": "2026-07-02T...", "last_active_at": "..." },
  "lectures": [{
    "id": "...", "title": "...", "course_title": "...",
    "is_published": true,
    "updated_at": "2026-07-25T...",
    "thumbnail_url": "https://...presigned...",   // 첫 슬라이드 이미지, 10분 만료
    "slide_count": 24,
    "stages": { "ppt": "ok", "script": "ok", "avatar": "fail", "quiz": "ok" },
    "avatar_render_count": 3,
    "avatar_render_cap": 3,                        // settings.AVATAR_RERENDER_MAX_PER_LECTURE
    "failed_render_count": 2,
    "spend_usd": 41.20                             // 이 강의 귀속 비용(두 테이블 합)
  }]
}
```

**구현 주의**:
- **N+1 금지.** 강의가 수십 개인 테스터가 나온다. 4단계 판정을 강의별 4쿼리로 돌리지 말고,
  `lecture_id` 로 group by 한 집계 쿼리 4개를 먼저 돌린 뒤 파이썬에서 dict 조인한다.
  `admin_analytics.py` 의 `spend_by_instructor` 가 같은 패턴을 쓰고 있으니 그대로 따를 것.
- `thumbnail_url` presigned 발급은 **목록 응답에서 강의당 1건만**. 슬라이드 전체를 presign 하면
  응답이 폭발한다. 슬라이드 전체가 필요하면 별도 엔드포인트로 분리(이번 범위 아님).
- 강의 귀속 비용: `platform_cost_logs.lecture_id` 직결 + `render_cost_logs → video_renders.lecture_id`.
  (교수자 귀속과 달리 강의 귀속은 두 테이블 모두 `lecture_id` 로 1-조인 된다.)

**프론트** — `/admin/beta` 의 행 클릭 → `/admin/testers/[id]`:
프로토타입 08 의 "테스터 상세" 화면. 상단 4 스탯 타일, 좌측 "만든 자료" 카드 그리드
(재렌더 잔여 pip 표시 `●●○ 2/3`), 우측 월별 지출 + 최근 오류, 하단 그 사람의 피드백.

> **라우트 교체는 이 작업(B)의 몫이다.** E 까지 `/admin/beta` 의 행 클릭은 같은 표 안에서 펼쳐지는
> **인라인 확장**이다(`/api/v1/admin/users/{id}/usage` 사용). B 에서 이 인라인 확장을 걷어내고
> `/admin/testers/[id]` 링크로 바꾼 뒤, 상세 화면이 새 `artifacts` 엔드포인트를 쓰게 한다.
> 순서를 뒤집어 E 에서 링크만 먼저 걸면 B 완료 전까지 404 다.

---

### C. 이슈 인박스 *(신규 read + 최소 컬럼 1개)*

**목표**: 실패한 렌더를 `error_message` 원문까지 펼쳐 보고, 확인/해결 상태를 남긴다.

**마이그레이션 `<head+1>_add_render_triage.py`** *(착수 시점의 `alembic heads` 를 확인하고
그 다음 번호를 쓸 것. 기획 문서에 구체 번호를 적지 않는다 — 미구현 작업에 번호를 예약해
두면 먼저 머지되는 쪽과 계속 어긋난다. 이 프로젝트에서 이미 두 번 어긋났다.)*
```
video_renders.triaged_at   TIMESTAMPTZ NULL   -- 운영자가 확인한 시각
video_renders.triage_note  TEXT NULL          -- 운영자 메모(선택)
+ ix_video_renders_status_created  (status, created_at DESC)   -- 실패 목록 핫패스
```
> `resolved` 별도 컬럼을 두지 않는다. 상태는 3분기로 파생한다 —
> `triaged_at IS NULL` → 미확인 / `triaged_at` 있고 이후 같은 강의의 성공 렌더 존재 → 해결 /
> 그 외 → 확인함. 컬럼을 늘리는 대신 파생으로 두는 편이 상태 동기화 버그를 줄인다.

**신규 엔드포인트**
- `GET /api/v1/admin/renders?status=failed&since=7d&cohort=&user_id=&page=&limit=`
  → 실패 렌더 목록. **강의 + 렌더 패스 단위로 묶어서** 반환한다(같은 사고의 N개 슬라이드 행이
  N줄로 보이면 안 됨 — §1.1 참조). 각 행에 `user_id/name/email`, `lecture_id/title`,
  `provider`(heygen | visionstory, `avatar_id`·`tts_provider` 로 판별), `error_message`,
  `created_at`, `affected_slides`, 파생 상태.
- `PATCH /api/v1/admin/renders/{render_id}/triage` → `{ "note": "..." }`, `triaged_at = now()`.
  **감사 로그 `render.triage` 1행 기록.**

**프론트** `/admin/issues` — 프로토타입 08 의 이슈 인박스. 행 클릭 시 우측 드로어:
`error_message` 원문 → 파이프라인 추적(있는 로그만; 없으면 이 블록 생략) → 재현 경로 링크 →
하단 액션 바(§5).

---

### D. 피드백에 강의 맥락 붙이기 *(프론트 소폭)*

`feedbacks.lecture_id` 컬럼은 있는데 프론트가 안 채운다.

- `GlobalFeedbackButton.tsx`: 현재 강의 컨텍스트가 있으면 `lecture_id` 를 함께 전송.
  강의 ID 출처는 라우트 파라미터(`/lecture/[id]`, `/v/[slug]`, `/professor/studio/[id]`).
  전역 컴포넌트가 라우트를 파싱하는 대신, **`LectureContext` 가 이미 있으면 거기서 읽고 없으면
  `undefined`** 로 보낸다(없다고 제출이 막히면 안 됨).
- `/admin/feedback` 화면에 강의 제목·`page` 를 함께 표시하고, 강의 클릭 시
  `/admin/testers/{user_id}` 로 이동.

---

### E. 콘솔 통합 + v2 디자인 전환 *(프론트 전용)*

**사이드바 최종 구성 9개** (`admin/layout.tsx`):

```
운영   개요(/admin) · 초대·QR(/admin/invites) · 베타 현황(/admin/beta)
품질   이슈 인박스(/admin/issues) · 피드백(/admin/feedback) · 베타 신청(/admin/applications)
감시   비용(/admin/costs) · 감사 로그(/admin/audit) · 시스템(/admin/system)
```
- **이슈 인박스는 C 에서 추가한다 — E 시점의 사이드바는 8개다.** `/admin/issues` 는 C 가 만드는
  화면이라, E 가 먼저 배포되면 계정주가 매번 404(또는 빈 플레이스홀더)를 클릭하게 된다.
  E 는 "품질" 그룹에 TODO 주석만 남기고, 항목과 미처리 배지는 C 에서 함께 붙인다.
- **`/admin/users` 는 사이드바에서만 뺀다. 라우트는 남긴다.** 나란히 두면 "테스터 목록"이 두 개가
  되는 게 문제였을 뿐이고, 그 화면의 쓰기 4종은 §5 후단대로 유지 대상이다. `/admin/beta` 의 모집단은
  `admin_analytics.py::instructor_rollup` 이 `role == professor` 로 고정하므로, 흡수해 버리면
  **학생·admin 계정 관리 경로가 콘솔에서 사라진다.**
  - `/admin/beta` 행 오버플로 메뉴에는 **PRO 분석 토글만** 넣는다(베타 운영 중 실제로 쓰는 것).
  - 역할 변경·유저 삭제는 `/admin/users` 에 남기고, `/admin/beta` 에서 그 화면으로 가는
    **딥링크**를 둬 도달 경로를 유지한다.
- **`/admin/beta` 드릴다운은 B 전까지 인라인 확장을 유지한다.** 지금은 행 클릭 시 같은 표 안에서
  펼쳐지는데, E 에서 이를 `/admin/testers/[id]` 링크로 바꾸면 B 완료 전까지 똑같이 404 다.
  E 는 **동작을 그대로 두고 v2 토큰으로 스타일만** 바꾼다. 라우트 교체는 B 에서 한다.
- `/admin/testers/[id]` 는 드릴다운이므로 사이드바에 넣지 않는다.
- 미처리 이슈·피드백 수는 **사이드바 배지**로 노출(개요의 카드와 같은 소스). E 시점엔 피드백만,
  이슈 배지는 C 에서 추가.

**개요(`/admin`)의 예산 미터** *(2026-07-26 추가 — 스펙 13 §C-1a 와 한 쌍)*

`GET /api/v1/admin/budget` 으로 HeyGen·VisionStory 의 월 예산 소진율을 막대로 보여준다.
전역 브레이커라 **한 명이 한도를 채우면 나머지 전원의 아바타 제작이 동시에 멈추므로**,
"몇 명까지 더 초대해도 되나"를 눈으로 판단할 수 있어야 한다.

- 서비스별: `이번 달 소진 / 월 한도` + 소진율 %, **활성 교수자 수 대비 1인당 소진**,
  그리고 그 소진율 기준 **추가 감당 가능 인원**(`headroom_professors`).
- **80% 를 넘으면 경고**를 띄운다(`warn_threshold_pct`). 100% 초과 시엔 "모든 교수자의
  아바타 제작이 차단됩니다" 로 문구를 바꾼다 — 전역 영향이라는 걸 분명히 한다.
- 한도가 `0`(브레이커 비활성)이면 % 를 계산하지 않는다. 0 으로 나눈 값을 100% 처럼 보여주면
  안 된다.
- 막대 색은 골드 시퀀셜(§0-6)이되 **경고 임계 초과 시에만** 의미 컬러로 바꾼다 —
  카테고리 구분이 아니라 상태 인디케이터이므로 §0-6 이 허용하는 용례다.

**단가 드리프트 표시** — 각 막대 옆에 **지금 적용 중인 단가**(`effective_unit_cost_usd_per_second`)
를 작게 적는다. 어느 값으로 계산된 숫자인지 화면에서 바로 보여야 드리프트가 숨지 않는다.
`unit_costs.ratio_consistent` 가 `false` 면(= VisionStory/HeyGen 비율이 2.0 이 아니면)
카드 상단에 경고를 띄운다 — VisionStory 단가는 HeyGen 에서 유도된 값이라 한쪽만 env
override 되면 전제가 깨진다(스펙 13 §C-1a).

> **집계 정의는 브레이커와 반드시 같아야 한다.** HeyGen 비용은 본문 렌더
> (`render_cost_logs`)와 Q&A 아바타 렌더(`platform_cost_logs`, category=`avatar_qa`)
> 두 곳에 나뉘어 적재된다. 하나만 세면 미터는 0% 인데 브레이커가 터지는 상태가 되고,
> 운영자는 원인을 못 찾는다. `services/admin_budget.py` 가 브레이커의 필터를 그대로 옮겨 쓴다.
> (in-flight 추정분은 제외 — 브레이커는 폭주 방어를 위해 가산하지만, 미터의 목적은
>  "이번 달 실제로 얼마 썼나"라 추정치가 섞이면 숫자가 흔들린다.)
- **교수자 셸 사이드바의 진입점도 함께 바꾼다** — `components/professor/shell/Sidebar.tsx` 의
  "베타 초대"(`/owner/invites`) → **"운영자 콘솔"(`/admin`)**. A 에서 `/owner/invites` 가
  `/admin/invites` 로 redirect 되게 바뀌어 구 경로는 리다이렉트를 한 번 타고, 초대 화면 하나만
  열려 나머지 콘솔 화면은 계정주가 주소를 외워야 한다. `/admin` 으로 보내면 콘솔 전체가 열리고
  초대는 그 안의 탭이 된다. 노출 게이트도 `canManageInvites` → `isOwnerEmail` 로 바꾼다
  (둘 다 같은 `OWNER_EMAILS` 를 보지만, 이제 판정 대상이 초대가 아니라 콘솔 전체 진입이다).

**디자인 전환** — 대상 파일 전부(`admin/**/page.tsx`, `admin/layout.tsx`):
- `bg-gray-50`/`gray-900`/`indigo-600` → v2 토큰(`bg-bg`, `bg-bg-subtle`, `text-gold-on-light`,
  `border-line` …). Tailwind v4 `@theme inline` 매핑이 `globals.css` 에 이미 있으므로
  유틸리티 이름만 바꾸면 된다.
- 폰트: 제목 `font-display`(Paperlogy), 본문·숫자 `font-body`(Pretendard). 숫자는 `tabular-nums`.
  **`font-mono` 는 쓰지 않는다** — v2 는 모노 폰트를 폐기했다(`design-system/typography.md`:
  "코드 · 모노 (제거됨) — 더 이상 사용 안 함"). 금액·통계는 `tabular-nums` 로 정렬하고,
  `user.update_role` 같은 식별자는 칩 배경 + `tracking-tight` 로 구분한다.
  (2026-07-26: E 1차 전환이 색 토큰만 바꾸고 `font-mono` 9곳을 남겨 뒤늦게 정리했다.)
- 이모지 금지 — 인라인 SVG로. 같은 의미는 같은 SVG 재사용(`docs/design-system/icons.md`).
- `prefers-reduced-motion` 지원, 진입 stagger 80ms.
- **프로토타입 08 의 CSS 를 그대로 복붙하지 말 것.** 프로토타입은 토큰을 하드코딩한 단일 HTML이다.
  Next.js 에서는 `globals.css` 의 기존 토큰 유틸리티를 쓴다.

---

### F. 읽기 전용 view-as 세션 *(신규 — 가장 조심할 작업)*

**목표**: 재현 안 되는 버그를, 테스터가 본 화면 그대로 본다. **쓰기는 절대 불가.**

**설계**:
- `POST /api/v1/admin/impersonate/{user_id}` (`require_admin`)
  → **별도 클레임을 가진 단명 JWT** 발급: `{ sub: <대상 user_id>, act: <운영자 user_id>,
    scope: "readonly", exp: now + 15분, jti }`.
  → 리프레시 토큰은 **발급하지 않는다**. 만료 시 그냥 끊긴다.
  → 발급 즉시 감사 로그 `user.view_as_start` (detail 에 대상 이메일·사유 문자열).
- **쓰기 차단은 미들웨어 한 곳에서.** `app/main.py` 에 미들웨어를 추가해
  `scope == "readonly"` 토큰의 `POST/PUT/PATCH/DELETE` 요청을 **전부 403** 으로 끊는다.
  엔드포인트별 가드는 금지 — 빠뜨리는 순간 사고다.
  (예외: 세션 종료용 `POST /api/v1/admin/impersonate/end` 만 허용 화이트리스트.)
- **학생 개인정보 마스킹 유지.** 이미 있는 Sentry/로깅 마스킹(#160)과 별개로, view-as 응답에서
  학번·실명이 노출되지 않는지 학생 목록·분석 화면에서 확인할 것.
- **프론트**: 이 토큰이 활성인 동안 화면 최상단에 걷히지 않는 배너
  ("읽기 전용으로 OOO 화면을 보고 있습니다 · 남은 시간 mm:ss · 종료") 를 고정 노출한다.
  배너 없이 남의 화면을 보는 상태가 존재해선 안 된다.
- PIPA 근거: 교수자 가입 시 받은 `beta_consented_at` 동의 문구가 이미 열람을 포함한다
  (`docs/planning/13-beta-admin-console.md` §2-G). **학생 계정으로는 view-as 를 발급하지 않는다**
  — 학생은 그 동의를 한 적이 없다. `user.role != "professor"` 면 400.

---

## 3. 마이그레이션 순서

```
video_renders.triaged_at + triage_note + ix_video_renders_status_created   (C)
```
번호는 착수 시점 `alembic heads` + 1. (참고: 공개 초대·수강 등록 마이그레이션이 이미 머지돼
있으므로 head 는 그보다 뒤다.)
그 외 작업(A·B·D·E·F)은 **스키마 변경 없음** — 전부 read 엔드포인트와 프론트다.
적용: `docker compose exec backend alembic upgrade head`.

---

## 4. 권장 작업 순서 (PR 분할)

| # | 범위 | 의존 | 규모 |
|---|---|---|---|
| 1 | A — 초대 통합 + QR + cohort 입력 | 없음 | 프론트만, 소 |
| 2 | E — 콘솔 통합 + v2 디자인 전환 | 1 | 프론트만, 중 |
| 3 | B — artifacts 엔드포인트 + 테스터 상세 | 2 | 백+프론트, 대 |
| 4 | C — 0071 + 이슈 인박스 | 2 | 백+프론트, 중 |
| 5 | D — 피드백 강의 맥락 | 4 | 소 |
| 6 | F — view-as | 4 | 백+프론트, 중 (보안 리뷰 필수) |

1·2 만 끝나도 "초대 QR + 통일된 콘솔"이라 8월 베타는 출발할 수 있다. F는 마지막에 붙인다.

---

## 5. 콘솔의 쓰기 권한

**이 문서가 새로 추가하는** 쓰기는 아래 4개뿐이다. 그 외 신규 수정 기능은 콘솔이 아니라
코드/DB 로 한다.

1. 초대 발급 · 취소 (`invite.create` / `invite.delete`)
2. 재렌더 카운터 리셋 (`lecture.reset_avatar_rerender`)
3. 실패 렌더 재시도 · triage 표시 (`render.retry` / `render.triage`)
4. 피드백 상태 토글 (`feedback.update_status`)

**기존 쓰기(스펙 13 에서 이미 머지)는 그대로 유지한다** — `/admin/users` 의 역할 변경
(`user.update_role`) · 활성 토글(`user.set_active`) · PRO 분석 토글(`user.set_analytics_pro`) ·
유저 삭제(`user.delete`). 네 개 모두 이미 감사 로그 1행을 남긴다
(`app/api/v1/admin.py` `update_user` / `delete_user`).
**이 문서의 어떤 작업도 이 기능들을 제거하지 않는다.**

**원칙: 감사 로그가 못 따라가는 쓰기 기능은 추가하지 않는다.**

---

## 6. 수용 기준 체크리스트

- [ ] 계정주 로그인 시에만 신규 어드민 엔드포인트가 200, 그 외 403.
- [ ] `/admin/invites` 에서 이메일+코호트로 초대 발급 → QR 표시 → **실제로 스캔되어**
      `/auth/invite?token=...` 이 열림. PNG 다운로드·링크 복사 동작.
- [ ] 발급 시 `users.cohort` 로 복사될 `cohort` 가 `professor_invites.cohort` 에 저장됨.
- [ ] `/owner/invites`·`/owner/costs` 접근 시 `/admin/*` 로 redirect.
- [ ] `/admin/testers/{id}` 가 강의별 4단계(PPT/스크립트/아바타/퀴즈) 상태와 재렌더 잔여 횟수,
      강의 귀속 비용을 표시. **강의 30개 테스터에서 응답 1초 이내**(N+1 없음).
- [ ] `/admin/issues` 가 실패 렌더를 **강의+패스 단위로 묶어** 표시. `error_message` 원문 열람 가능.
- [ ] triage 표시 → `admin_audit_logs` 에 `render.triage` 1행.
- [ ] view-as 토큰으로 임의의 `POST/PUT/PATCH/DELETE` 호출 시 **전부 403**
      (엔드포인트별이 아니라 미들웨어에서 차단됨을 테스트로 증명할 것).
- [ ] view-as 활성 중 프론트 상단 배너가 항상 보이고, 15분 후 자동 만료.
- [ ] 학생 계정 대상 view-as 발급 시 400.
- [ ] 콘솔 전 화면이 v2 토큰(라이트 베이지+골드) 사용. 이모지 0개, `localStorage` 0회.
- [ ] `prefers-reduced-motion` 에서 애니메이션 정지, 430px 폭에서 가로 스크롤 없음.
- [ ] `alembic upgrade head` 무오류, 기존 테스트 스위트 그린(CI).
- [ ] **학생 회원가입 흐름 회귀 없음** — 강의 링크 가입이 그대로 동작.

---

## 7. 범위 외 (이번 작업 아님)

- 콘솔에서의 강의·스크립트 **편집**. §5 화이트리스트 밖의 쓰기는 넣지 않는다.
- 교수자별 개별 $ 하드캡 — 전역 브레이커 + 월 쿼터 + 재렌더 상한으로 충분(스펙 13 §6 유지).
- Sentry 이슈 임베드 — 이슈 인박스가 `error_message` 를 직접 보여주므로 베타 규모에선 불필요.
  링크만 걸고 싶다면 D 이후 별건으로.
- 슬라이드 전체 이미지 열람 API — B 에서는 강의당 썸네일 1장까지만.
- Q&A 아바타 렌더 비용 기록(두 비용 테이블 어디에도 안 남는 기존 갭) — 별도 이슈.

---

## 변경 이력

- 2026-07-26: **C 구현 완료** (마이그레이션 `0075` — 착수 시점 head 가 `0074` 였다).
  구현 중 §C 의 전제 하나가 실코드와 다른 것을 확인했다 — **`video_renders` 에는
  VisionStory 렌더가 없다.** 본문 렌더 파이프라인(`app/tasks/render.py`)에는 VisionStory
  분기가 아예 없고(HeyGen `create_video` 단일 경로), VisionStory 는 Q&A 답변 클립
  (`qa_answer_caches`)에만 쓰인다. `budget.inflight_heygen_spend_usd` 가 `VideoRender`
  전량을 HeyGen 으로 세는 것도 같은 전제다. 따라서 §C 의 "`avatar_id`·`tts_provider` 로
  heygen | visionstory 판별"은 이 테이블에서 성립하지 않는다. 구현은 (1) `provider` 를
  job id 접두(`visionstory:` — qa_batch·budget 이 쓰는 유일한 표식)로 판별해 지금은 항상
  `heygen` 이 나오되 본문에 VisionStory 가 붙는 날 스키마 변경 없이 맞는 값이 나오게 하고,
  (2) 실제로 갈리는 `tts_provider`(elevenlabs | google)를 별도 필드로 함께 준다.
  **Q&A 답변 클립 실패를 인박스에 포함할지는 별건**(테이블이 다르고 §7 범위 밖).
  렌더 패스는 패스 id 컬럼이 없어 **시간 간격 30분**으로 끊었다(한 패스는 슬라이드를
  한꺼번에 제출해 수초~수분 안에 붙는다). 에러 문구로는 나누지 않는다 — 한 패스 안에서
  슬라이드마다 메시지가 달라도 사고는 하나다.
- 2026-07-25: **공개 초대 도입** — `professor_invites.email` 을 nullable 로 바꿔 대상 이메일 없이
  1회용 링크·QR 을 발급할 수 있게 했다(`0071`). 이메일 잠금이 빠진 만큼 단일 사용이 마지막
  방어선이 되므로 소비를 `claim_invite` 의 조건부 UPDATE 로 원자화하고, 순서를 "유저 생성 → 소비"
  에서 **"자리 선점 → 유저 생성"** 으로 뒤집었다. §0-1·§3·§C 마이그레이션 번호 갱신.
- 2026-07-25: **E 착수 시 발견한 문서 내부 모순 3건 정정.** (1) §5 는 "이 문서가 새로 추가하는
  쓰기"의 상한인데 절대 규칙처럼 쓰여 있어, 스펙 13 에서 이미 머지된 `/admin/users` 의 쓰기 4종을
  제거 대상으로 오독할 수 있었다 — 그 4종은 전부 감사 로그를 남기므로 §5 의 실제 기준을 이미
  통과했다. §0-3 문구도 함께 정정. (2) §E 의 "`/admin/users` 를 `/admin/beta` 에 흡수"는 학생·admin
  계정 관리 경로를 없애므로 "사이드바에서만 제거"로 축소. (3) 작업 순서상 E 가 C·B 보다 먼저인데
  §E 의 사이드바 9개와 테스터 상세 링크는 C·B 가 만드는 화면을 가리켜 404 가 된다 — E 시점 8개,
  드릴다운은 인라인 유지로 명시.
- 2026-07-25: 최초 작성. 프로토타입 `frontend/public/prototypes/08-admin-console.html` 과 한 쌍.
  스펙 13 이후 실코드 재점검으로 두 가지 정정 — (1) `require_admin`/`require_owner` 는 현재 동작이
  동일하므로 통합의 실익은 권한이 아니라 화면·URL, (2) Alembic head 는 `0070`(스펙 13 의 `0052`
  기준 서술은 낡음).
