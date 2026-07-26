"""이슈 인박스 — 스펙 14 §C.

검증 대상:
1. **강의 + 렌더 패스 단위 그룹핑** — 같은 사고의 N개 슬라이드가 N줄로 보이면 안 된다
   (§1.1). 이 회귀가 스펙이 §C 에서 가장 강하게 못박은 지점이라 가드를 두껍게 둔다.
2. **파생 3분기 상태** — `resolved` 컬럼 없이 `triaged_at` + 이후 성공 렌더로만 판정.
3. **감사 로그 `render.triage` 1행** — §5 "감사 로그가 못 따라가는 쓰기는 추가하지 않는다".
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models.admin_audit_log import AdminAuditLog
from app.models.course import Course
from app.models.lecture import Lecture
from app.models.user import User, UserRole
from app.models.video_render import RenderStatus, VideoRender
from tests.conftest import make_auth_header

OWNER_EMAIL = "classauto101@gmail.com"


@pytest.fixture
def owner_factory(db):
    async def _make() -> User:
        user = User(
            id=uuid.uuid4(),
            google_sub=f"google-owner-{uuid.uuid4().hex[:8]}",
            email=OWNER_EMAIL,
            name="계정주",
            role=UserRole.professor,
            is_active=True,
        )
        db.add(user)
        await db.flush()
        return user

    return _make


async def _make_lecture(db, course: Course, *, title: str) -> Lecture:
    lec = Lecture(
        id=uuid.uuid4(),
        course_id=course.id,
        title=title,
        slug=f"lec-{uuid.uuid4().hex[:10]}",
        order=1,
        is_published=False,
    )
    db.add(lec)
    await db.flush()
    return lec


async def _add_render(
    db,
    lecture: Lecture,
    professor: User,
    *,
    slide: int,
    created_at: datetime,
    status: RenderStatus = RenderStatus.failed,
    error: str | None = "HeyGen 429 Too Many Requests",
    completed_at: datetime | None = None,
    triaged_at: datetime | None = None,
) -> VideoRender:
    render = VideoRender(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        instructor_id=professor.id,
        avatar_id="avatar-test",
        slide_number=slide,
        status=status,
        error_message=error,
        created_at=created_at,
        completed_at=completed_at,
        triaged_at=triaged_at,
    )
    db.add(render)
    await db.flush()
    return render


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── 1. 강의 + 렌더 패스 단위 그룹핑 ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_one_pass_with_many_slides_is_one_row(
    client, db, professor, course, owner_factory
):
    """한 패스에서 슬라이드 5개가 깨져도 목록은 **1줄**이다.

    이게 §C 의 핵심 요구다 — "같은 사고가 슬라이드 수만큼 N행으로 보이면 안 됨".
    """
    owner = await owner_factory()
    lec = await _make_lecture(db, course, title="중국어 통사론 3주차")
    base = _now() - timedelta(hours=1)
    for slide in range(1, 6):
        # 한 패스의 슬라이드는 한꺼번에 제출돼 몇 초 간격으로 붙는다.
        await _add_render(db, lec, professor, slide=slide, created_at=base + timedelta(seconds=slide * 3))

    resp = await client.get(
        "/api/v1/admin/renders?status=failed", headers=make_auth_header(owner)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["total"] == 1, f"5개 슬라이드가 1건으로 묶여야 한다: {body['issues']}"
    issue = body["issues"][0]
    assert issue["affected_slides"] == [1, 2, 3, 4, 5]
    assert issue["affected_count"] == 5
    assert issue["lecture_title"] == "중국어 통사론 3주차"


@pytest.mark.asyncio
async def test_separate_passes_are_separate_rows(
    client, db, professor, course, owner_factory
):
    """시간이 멀리 떨어진 재시도는 **다른 사고**로 나뉜다."""
    owner = await owner_factory()
    lec = await _make_lecture(db, course, title="재시도한 강의")
    first = _now() - timedelta(days=2)
    second = _now() - timedelta(hours=2)

    for slide in (1, 2):
        await _add_render(db, lec, professor, slide=slide, created_at=first + timedelta(seconds=slide))
    for slide in (1, 2):
        await _add_render(db, lec, professor, slide=slide, created_at=second + timedelta(seconds=slide))

    resp = await client.get(
        "/api/v1/admin/renders?status=failed", headers=make_auth_header(owner)
    )
    body = resp.json()
    assert body["total"] == 2, f"두 번의 패스는 2줄이어야 한다: {body['issues']}"
    # 최근 사고가 위로.
    assert body["issues"][0]["last_failed_at"] > body["issues"][1]["last_failed_at"]


@pytest.mark.asyncio
async def test_different_lectures_never_merge(
    client, db, professor, course, owner_factory
):
    """같은 시각이라도 강의가 다르면 절대 합쳐지지 않는다."""
    owner = await owner_factory()
    lec_a = await _make_lecture(db, course, title="강의 A")
    lec_b = await _make_lecture(db, course, title="강의 B")
    at = _now() - timedelta(minutes=30)
    await _add_render(db, lec_a, professor, slide=1, created_at=at)
    await _add_render(db, lec_b, professor, slide=1, created_at=at)

    resp = await client.get(
        "/api/v1/admin/renders?status=failed", headers=make_auth_header(owner)
    )
    body = resp.json()
    assert body["total"] == 2
    assert {i["lecture_title"] for i in body["issues"]} == {"강의 A", "강의 B"}


@pytest.mark.asyncio
async def test_drawer_gets_raw_error_message(
    client, db, professor, course, owner_factory
):
    """드로어는 `error_message` **원문**을 본다 — 잘리거나 가공되면 안 된다."""
    owner = await owner_factory()
    lec = await _make_lecture(db, course, title="원문 확인")
    raw = "VisionStory: source portrait rejected — face not detected (confidence 0.31)"
    render = await _add_render(
        db, lec, professor, slide=1, created_at=_now() - timedelta(minutes=5), error=raw
    )

    resp = await client.get(
        f"/api/v1/admin/renders/{render.id}", headers=make_auth_header(owner)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["error_message"] == raw


@pytest.mark.asyncio
async def test_distinct_errors_kept_within_one_pass(
    client, db, professor, course, owner_factory
):
    """한 패스 안에서 메시지가 달라도 한 줄로 묶되, 서로 다른 메시지는 모두 보존한다."""
    owner = await owner_factory()
    lec = await _make_lecture(db, course, title="혼합 오류")
    base = _now() - timedelta(minutes=20)
    await _add_render(db, lec, professor, slide=1, created_at=base, error="ffmpeg: exit 1")
    await _add_render(
        db, lec, professor, slide=2, created_at=base + timedelta(seconds=5), error="HeyGen 429"
    )

    resp = await client.get(
        "/api/v1/admin/renders?status=failed", headers=make_auth_header(owner)
    )
    issue = resp.json()["issues"][0]
    assert issue["affected_count"] == 2
    assert set(issue["error_messages"]) == {"ffmpeg: exit 1", "HeyGen 429"}


# ── 2. 파생 3분기 상태 ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_status_new_when_never_triaged(
    client, db, professor, course, owner_factory
):
    owner = await owner_factory()
    lec = await _make_lecture(db, course, title="미확인")
    await _add_render(db, lec, professor, slide=1, created_at=_now() - timedelta(minutes=10))

    resp = await client.get(
        "/api/v1/admin/renders?status=failed", headers=make_auth_header(owner)
    )
    body = resp.json()
    assert body["issues"][0]["status"] == "new"
    assert body["counts"]["new"] == 1


@pytest.mark.asyncio
async def test_status_triaged_when_no_later_success(
    client, db, professor, course, owner_factory
):
    """확인만 하고 아직 성공 렌더가 없으면 '확인함' 에 머문다."""
    owner = await owner_factory()
    lec = await _make_lecture(db, course, title="확인함")
    await _add_render(
        db,
        lec,
        professor,
        slide=1,
        created_at=_now() - timedelta(hours=3),
        triaged_at=_now() - timedelta(hours=2),
    )

    resp = await client.get(
        "/api/v1/admin/renders?status=failed", headers=make_auth_header(owner)
    )
    body = resp.json()
    assert body["issues"][0]["status"] == "triaged"
    assert body["counts"]["triaged"] == 1


@pytest.mark.asyncio
async def test_status_resolved_when_success_after_triage(
    client, db, professor, course, owner_factory
):
    """triage **이후** 같은 강의의 성공 렌더가 생기면 '해결' 로 파생된다.

    `resolved` 컬럼을 따로 두지 않는 설계의 핵심 — 아무도 상태를 갱신하지 않았는데도
    재렌더 성공만으로 해결이 된다.
    """
    owner = await owner_factory()
    lec = await _make_lecture(db, course, title="해결됨")
    triaged = _now() - timedelta(hours=2)
    await _add_render(
        db, lec, professor, slide=1, created_at=_now() - timedelta(hours=3), triaged_at=triaged
    )
    # 확인 이후에 성공한 재렌더.
    await _add_render(
        db,
        lec,
        professor,
        slide=1,
        created_at=triaged + timedelta(minutes=10),
        status=RenderStatus.ready,
        error=None,
        completed_at=triaged + timedelta(minutes=20),
    )

    resp = await client.get(
        "/api/v1/admin/renders?status=failed", headers=make_auth_header(owner)
    )
    body = resp.json()
    assert body["issues"][0]["status"] == "resolved"
    assert body["counts"]["resolved"] == 1


@pytest.mark.asyncio
async def test_success_before_triage_does_not_resolve(
    client, db, professor, course, owner_factory
):
    """triage **이전**의 성공은 해결이 아니다 — 그 뒤에 또 깨졌다는 뜻이다."""
    owner = await owner_factory()
    lec = await _make_lecture(db, course, title="이전 성공")
    old_success = _now() - timedelta(days=3)
    await _add_render(
        db,
        lec,
        professor,
        slide=1,
        created_at=old_success,
        status=RenderStatus.ready,
        error=None,
        completed_at=old_success,
    )
    await _add_render(
        db,
        lec,
        professor,
        slide=1,
        created_at=_now() - timedelta(hours=3),
        triaged_at=_now() - timedelta(hours=1),
    )

    resp = await client.get(
        "/api/v1/admin/renders?status=failed", headers=make_auth_header(owner)
    )
    assert resp.json()["issues"][0]["status"] == "triaged"


# ── 3. triage 쓰기 + 감사 로그 ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_triage_writes_exactly_one_audit_row(
    client, db, professor, course, owner_factory
):
    """triage 표시 → `admin_audit_logs` 에 `render.triage` **1행** (§6 수용 기준)."""
    owner = await owner_factory()
    lec = await _make_lecture(db, course, title="감사 로그")
    render = await _add_render(
        db, lec, professor, slide=1, created_at=_now() - timedelta(minutes=30)
    )

    resp = await client.patch(
        f"/api/v1/admin/renders/{render.id}/triage",
        json={"note": "HeyGen 동시 요청 제한 — 백오프 추가 예정"},
        headers=make_auth_header(owner),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["triaged_at"] is not None
    assert resp.json()["triage_note"] == "HeyGen 동시 요청 제한 — 백오프 추가 예정"

    rows = (
        await db.execute(
            select(AdminAuditLog).where(AdminAuditLog.action == "render.triage")
        )
    ).scalars().all()
    assert len(rows) == 1, f"render.triage 는 정확히 1행이어야 한다: {rows}"
    assert rows[0].target_type == "render"
    assert rows[0].target_id == str(render.id)
    assert rows[0].actor_email == OWNER_EMAIL


@pytest.mark.asyncio
async def test_triage_moves_row_out_of_new(
    client, db, professor, course, owner_factory
):
    """triage 하면 그 사고가 '미확인' 에서 빠진다 — 배지가 줄어드는 경로."""
    owner = await owner_factory()
    lec = await _make_lecture(db, course, title="배지")
    render = await _add_render(
        db, lec, professor, slide=1, created_at=_now() - timedelta(minutes=30)
    )

    before = await client.get(
        "/api/v1/admin/renders?status=failed", headers=make_auth_header(owner)
    )
    assert before.json()["counts"]["new"] == 1

    await client.patch(
        f"/api/v1/admin/renders/{render.id}/triage",
        json={},
        headers=make_auth_header(owner),
    )

    after = await client.get(
        "/api/v1/admin/renders?status=failed", headers=make_auth_header(owner)
    )
    assert after.json()["counts"]["new"] == 0
    assert after.json()["counts"]["triaged"] == 1


@pytest.mark.asyncio
async def test_triage_on_missing_render_is_404(client, owner_factory):
    owner = await owner_factory()
    resp = await client.patch(
        f"/api/v1/admin/renders/{uuid.uuid4()}/triage",
        json={},
        headers=make_auth_header(owner),
    )
    assert resp.status_code == 404


# ── 권한 ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_non_owner_gets_403(client, professor):
    """계정주가 아니면 403 (§6 수용 기준 첫 줄)."""
    resp = await client.get(
        "/api/v1/admin/renders?status=failed", headers=make_auth_header(professor)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_unknown_status_is_400(client, owner_factory):
    """알 수 없는 status 는 400 — 조용히 전체를 돌려주면 오해를 부른다."""
    owner = await owner_factory()
    resp = await client.get(
        "/api/v1/admin/renders?status=nonsense", headers=make_auth_header(owner)
    )
    assert resp.status_code == 400


# ── 필터 ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_since_window_excludes_old_failures(
    client, db, professor, course, owner_factory
):
    """`since` 밖의 오래된 실패는 목록에서 빠진다."""
    owner = await owner_factory()
    lec = await _make_lecture(db, course, title="오래된 실패")
    await _add_render(db, lec, professor, slide=1, created_at=_now() - timedelta(days=40))

    recent = await client.get(
        "/api/v1/admin/renders?status=failed&since=7d", headers=make_auth_header(owner)
    )
    assert recent.json()["total"] == 0

    wide = await client.get(
        "/api/v1/admin/renders?status=failed&since=90d", headers=make_auth_header(owner)
    )
    assert wide.json()["total"] == 1


@pytest.mark.asyncio
async def test_malformed_since_falls_back_to_default(
    client, db, professor, course, owner_factory
):
    """`since` 가 이상해도 500 이 아니라 기본 7일로 떨어진다."""
    owner = await owner_factory()
    lec = await _make_lecture(db, course, title="기본값")
    await _add_render(db, lec, professor, slide=1, created_at=_now() - timedelta(hours=1))

    resp = await client.get(
        "/api/v1/admin/renders?status=failed&since=abc", headers=make_auth_header(owner)
    )
    assert resp.status_code == 200
    assert resp.json()["since_days"] == 7
    assert resp.json()["total"] == 1


@pytest.mark.asyncio
async def test_user_filter_narrows_to_one_tester(
    client, db, professor, course, owner_factory
):
    """테스터 상세에서 넘어오는 `user_id` 필터가 그 사람 사고만 남긴다."""
    owner = await owner_factory()
    lec = await _make_lecture(db, course, title="필터")
    await _add_render(db, lec, professor, slide=1, created_at=_now() - timedelta(minutes=10))

    mine = await client.get(
        f"/api/v1/admin/renders?status=failed&user_id={professor.id}",
        headers=make_auth_header(owner),
    )
    assert mine.json()["total"] == 1

    other = await client.get(
        f"/api/v1/admin/renders?status=failed&user_id={uuid.uuid4()}",
        headers=make_auth_header(owner),
    )
    assert other.json()["total"] == 0
