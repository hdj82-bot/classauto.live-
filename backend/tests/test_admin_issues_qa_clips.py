"""Q&A 아바타 클립 실패의 이슈 인박스 합류 — 스펙 14 §C-2.

**왜 합치는가.** 교수자가 8월에 실제로 겪을 실패는 본인 얼굴 아바타 온보딩이고, 그건
`video_renders` 가 아니라 `qa_answer_cache` 에서 난다(프로토타입 08 e2:
"VisionStory: source portrait rejected"). C-1 은 이 실패를 못 본다.

검증 축:
1. 두 소스가 **한 목록**에 나오고 `source` 로 구분되는가
2. 그룹핑이 소스마다 맞는가 — Q&A 는 `cluster_key`(시간 간격 아님)
3. `provider` 가 여기서는 **실제로 갈리는가**(대표 행만 job id 를 갖는 점 포함)
4. triage 가 두 테이블을 모두 대상으로 하고 감사 로그가 `detail.source` 로 구분하는가
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models.admin_audit_log import AdminAuditLog
from app.models.course import Course
from app.models.lecture import Lecture
from app.models.qa_answer_cache import QAAnswerCache
from app.models.user import User, UserRole
from app.services import admin_issues
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


async def _make_lecture(db, course: Course, *, title: str = "把자문 강의") -> Lecture:
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


async def _add_clip(
    db,
    lecture: Lecture,
    professor: User,
    *,
    created_at: datetime,
    status: str = "failed",
    cluster_key: str | None = "cluster-a",
    job_id: str | None = None,
    error: str | None = "VisionStory: source portrait rejected — face not detected (confidence 0.31)",
    triaged_at: datetime | None = None,
    origin: str = "student",
    updated_at: datetime | None = None,
) -> QAAnswerCache:
    clip = QAAnswerCache(
        id=uuid.uuid4(),
        lecture_id=lecture.id,
        instructor_id=professor.id,
        question_text="把자문에서 목적어는 어디에 오나요?",
        origin=origin,
        cluster_key=cluster_key,
        status=status,
        heygen_job_id=job_id,
        error_message=error,
        created_at=created_at,
        updated_at=updated_at or created_at,
        triaged_at=triaged_at,
    )
    db.add(clip)
    await db.flush()
    return clip


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── 1. 두 소스가 한 목록에 ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_qa_clip_failure_appears_in_inbox(client, db, professor, course, owner_factory):
    """C-1 이 못 보던 Q&A 실패가 인박스에 뜬다 — §C-2 의 존재 이유."""
    owner = await owner_factory()
    lec = await _make_lecture(db, course)
    await _add_clip(db, lec, professor, created_at=_now() - timedelta(hours=1))

    resp = await client.get(
        "/api/v1/admin/renders?status=failed", headers=make_auth_header(owner)
    )
    assert resp.status_code == 200, resp.text
    issues = resp.json()["issues"]
    assert len(issues) == 1
    assert issues[0]["source"] == "qa_clip"
    assert "source portrait rejected" in issues[0]["error_message"]


@pytest.mark.asyncio
async def test_both_sources_merge_into_one_list(
    client, db, professor, course, owner_factory
):
    """테이블이 둘이어도 운영자가 보는 화면은 하나다."""
    from app.models.video_render import RenderStatus, VideoRender

    owner = await owner_factory()
    lec = await _make_lecture(db, course)

    db.add(
        VideoRender(
            id=uuid.uuid4(),
            lecture_id=lec.id,
            instructor_id=professor.id,
            avatar_id="a",
            slide_number=1,
            status=RenderStatus.failed,
            error_message="HeyGen 429",
            created_at=_now() - timedelta(hours=2),
        )
    )
    await db.flush()
    await _add_clip(db, lec, professor, created_at=_now() - timedelta(hours=1))

    data = (
        await client.get(
            "/api/v1/admin/renders?status=failed", headers=make_auth_header(owner)
        )
    ).json()

    sources = {i["source"] for i in data["issues"]}
    assert sources == {"body_render", "qa_clip"}
    assert data["by_source"] == {"body_render": 1, "qa_clip": 1}
    # 최근 사고가 위로 — 합친 뒤 정렬한다.
    assert data["issues"][0]["source"] == "qa_clip"


@pytest.mark.asyncio
async def test_source_filter(client, db, professor, course, owner_factory):
    """검증용 필터 — 한쪽만 볼 수 있어야 나중에 대조가 된다."""
    from app.models.video_render import RenderStatus, VideoRender

    owner = await owner_factory()
    lec = await _make_lecture(db, course)
    db.add(
        VideoRender(
            id=uuid.uuid4(),
            lecture_id=lec.id,
            instructor_id=professor.id,
            avatar_id="a",
            slide_number=1,
            status=RenderStatus.failed,
            error_message="HeyGen 429",
            created_at=_now() - timedelta(hours=2),
        )
    )
    await db.flush()
    await _add_clip(db, lec, professor, created_at=_now() - timedelta(hours=1))

    only_qa = (
        await client.get(
            "/api/v1/admin/renders?status=failed&source=qa_clip",
            headers=make_auth_header(owner),
        )
    ).json()
    assert [i["source"] for i in only_qa["issues"]] == ["qa_clip"]


# ── 2. 그룹핑 — cluster_key (시간 간격 아님) ──────────────────────────────────


@pytest.mark.asyncio
async def test_same_cluster_groups_regardless_of_time_gap(
    client, db, professor, course, owner_factory
):
    """**야간 배치라 시간이 넓게 흩어진다.** 30분 휴리스틱을 쓰면 한 클러스터가 쪼개진다.

    같은 cluster_key 는 몇 시간 떨어져 있어도 한 사고다.
    """
    owner = await owner_factory()
    lec = await _make_lecture(db, course)
    await _add_clip(db, lec, professor, created_at=_now() - timedelta(hours=6), cluster_key="c1")
    await _add_clip(db, lec, professor, created_at=_now() - timedelta(hours=1), cluster_key="c1")

    data = (
        await client.get(
            "/api/v1/admin/renders?status=failed", headers=make_auth_header(owner)
        )
    ).json()
    assert len(data["issues"]) == 1
    assert data["issues"][0]["affected_count"] == 2


@pytest.mark.asyncio
async def test_different_clusters_are_separate_incidents(
    client, db, professor, course, owner_factory
):
    """다른 클러스터는 시간이 붙어 있어도 별개 사고다."""
    owner = await owner_factory()
    lec = await _make_lecture(db, course)
    base = _now() - timedelta(hours=1)
    await _add_clip(db, lec, professor, created_at=base, cluster_key="c1")
    await _add_clip(db, lec, professor, created_at=base + timedelta(seconds=5), cluster_key="c2")

    data = (
        await client.get(
            "/api/v1/admin/renders?status=failed", headers=make_auth_header(owner)
        )
    ).json()
    assert len(data["issues"]) == 2


@pytest.mark.asyncio
async def test_null_cluster_rows_are_independent(
    client, db, professor, course, owner_factory
):
    """cluster_key 가 NULL 인 사전 질문(instructor_seed)은 행마다 독립 사고다.

    NULL 을 한 덩어리로 묶으면 서로 무관한 실패가 한 사고로 뭉친다.
    """
    owner = await owner_factory()
    lec = await _make_lecture(db, course)
    base = _now() - timedelta(hours=1)
    await _add_clip(db, lec, professor, created_at=base, cluster_key=None, origin="instructor_seed")
    await _add_clip(
        db, lec, professor, created_at=base + timedelta(seconds=5), cluster_key=None,
        origin="instructor_seed",
    )

    data = (
        await client.get(
            "/api/v1/admin/renders?status=failed", headers=make_auth_header(owner)
        )
    ).json()
    assert len(data["issues"]) == 2


# ── 3. provider — 여기서는 실제로 갈린다 ──────────────────────────────────────


@pytest.mark.asyncio
async def test_visionstory_detected_from_job_prefix(
    client, db, professor, course, owner_factory
):
    """C-1 과 달리 여기서는 provider 가 의미를 갖는다."""
    owner = await owner_factory()
    lec = await _make_lecture(db, course)
    await _add_clip(
        db, lec, professor, created_at=_now() - timedelta(hours=1),
        job_id=f"visionstory:{uuid.uuid4().hex}",
    )

    data = (
        await client.get(
            "/api/v1/admin/renders?status=failed", headers=make_auth_header(owner)
        )
    ).json()
    assert data["issues"][0]["provider"] == "visionstory"


@pytest.mark.asyncio
async def test_provider_read_from_representative_sibling(
    client, db, professor, course, owner_factory
):
    """**클러스터 형제 중 대표 행만 job id 를 갖는다.**

    형제 행에서 읽으면 항상 heygen 으로 잘못 나온다 — 그룹 안에서 job id 를 가진
    행을 찾아 판별해야 한다.
    """
    owner = await owner_factory()
    lec = await _make_lecture(db, course)
    base = _now() - timedelta(hours=1)
    # 대표 행(job id 보유)이 먼저, 형제(job id NULL)가 나중 = 대표가 아닌 행이 대표로 뽑힘
    await _add_clip(
        db, lec, professor, created_at=base, cluster_key="c1",
        job_id=f"visionstory:{uuid.uuid4().hex}",
    )
    await _add_clip(
        db, lec, professor, created_at=base + timedelta(minutes=1), cluster_key="c1",
        job_id=None,
    )

    data = (
        await client.get(
            "/api/v1/admin/renders?status=failed", headers=make_auth_header(owner)
        )
    ).json()
    assert data["issues"][0]["provider"] == "visionstory"


# ── 4. 파생 상태 — 같은 클러스터의 ready 로만 해결 판정 ────────────────────────


@pytest.mark.asyncio
async def test_resolved_only_when_same_cluster_succeeds(
    client, db, professor, course, owner_factory
):
    """다른 클러스터가 성공했다고 이 클립의 실패가 해결된 건 아니다."""
    owner = await owner_factory()
    lec = await _make_lecture(db, course)
    triaged = _now() - timedelta(hours=2)
    await _add_clip(
        db, lec, professor, created_at=_now() - timedelta(hours=3),
        cluster_key="c1", triaged_at=triaged,
    )
    # 다른 클러스터의 성공 — 해결로 치면 안 된다.
    await _add_clip(
        db, lec, professor, created_at=_now() - timedelta(hours=1),
        cluster_key="c2", status="ready", error=None,
        updated_at=_now() - timedelta(minutes=30),
    )

    data = (
        await client.get(
            "/api/v1/admin/renders?status=failed", headers=make_auth_header(owner)
        )
    ).json()
    issue = next(i for i in data["issues"] if i["source"] == "qa_clip")
    assert issue["status"] == "triaged"


@pytest.mark.asyncio
async def test_resolved_when_same_cluster_becomes_ready(
    client, db, professor, course, owner_factory
):
    """재렌더가 성공하면 아무도 손대지 않아도 해결로 넘어간다."""
    owner = await owner_factory()
    lec = await _make_lecture(db, course)
    triaged = _now() - timedelta(hours=2)
    await _add_clip(
        db, lec, professor, created_at=_now() - timedelta(hours=3),
        cluster_key="c1", triaged_at=triaged,
    )
    await _add_clip(
        db, lec, professor, created_at=_now() - timedelta(hours=1),
        cluster_key="c1", status="ready", error=None,
        updated_at=_now() - timedelta(minutes=10),
    )

    data = (
        await client.get(
            "/api/v1/admin/renders?status=failed", headers=make_auth_header(owner)
        )
    ).json()
    issue = next(i for i in data["issues"] if i["source"] == "qa_clip")
    assert issue["status"] == "resolved"


# ── 5. triage — 두 테이블 모두 대상 ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_triage_targets_qa_clip_and_logs_source(
    client, db, professor, course, owner_factory
):
    """URL 을 나누지 않고 id 로 찾는다. 감사 로그는 `detail.source` 로 구분."""
    owner = await owner_factory()
    lec = await _make_lecture(db, course)
    clip = await _add_clip(db, lec, professor, created_at=_now() - timedelta(hours=1))

    resp = await client.patch(
        f"/api/v1/admin/renders/{clip.id}/triage",
        headers=make_auth_header(owner),
        json={"note": "본인 사진 재업로드 안내함"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["source"] == "qa_clip"
    assert resp.json()["triage_note"] == "본인 사진 재업로드 안내함"

    logs = (
        await db.execute(
            select(AdminAuditLog).where(AdminAuditLog.action == "render.triage")
        )
    ).scalars().all()
    assert len(logs) == 1
    # 새 action 을 만들지 않는다 — §5 화이트리스트가 늘어난다.
    assert logs[0].detail["source"] == "qa_clip"
    assert logs[0].target_type == "qa_clip"


@pytest.mark.asyncio
async def test_triage_unknown_id_404(client, owner_factory):
    owner = await owner_factory()
    resp = await client.patch(
        f"/api/v1/admin/renders/{uuid.uuid4()}/triage",
        headers=make_auth_header(owner),
        json={},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_qa_clip_detail_for_drawer(client, db, professor, course, owner_factory):
    """드로어 상세 — 슬라이드가 아니라 **질문**이 맥락이다."""
    owner = await owner_factory()
    lec = await _make_lecture(db, course)
    clip = await _add_clip(db, lec, professor, created_at=_now() - timedelta(hours=1))

    resp = await client.get(
        f"/api/v1/admin/renders/{clip.id}", headers=make_auth_header(owner)
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["source"] == "qa_clip"
    assert data["question_text"]
    assert "source portrait rejected" in data["error_message"]


# ── 6. 배지 — 두 소스 합계 ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_badge_counts_both_sources(db, professor, course):
    """배지가 목록과 다른 수를 가리키면 운영자가 인박스를 신뢰하지 않게 된다."""
    from app.models.video_render import RenderStatus, VideoRender

    lec = await _make_lecture(db, course)
    db.add(
        VideoRender(
            id=uuid.uuid4(),
            lecture_id=lec.id,
            instructor_id=professor.id,
            avatar_id="a",
            slide_number=1,
            status=RenderStatus.failed,
            error_message="HeyGen 429",
            created_at=_now() - timedelta(hours=2),
        )
    )
    await db.flush()
    await _add_clip(db, lec, professor, created_at=_now() - timedelta(hours=1))

    assert await admin_issues.unresolved_count(db) == 2


# ── 7. status 파라미터 ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_non_failed_status_is_rejected(client, owner_factory):
    """인박스는 실패를 보는 화면이다 — 성공을 섞으면 사고 수가 왜곡된다."""
    owner = await owner_factory()
    resp = await client.get(
        "/api/v1/admin/renders?status=ready", headers=make_auth_header(owner)
    )
    assert resp.status_code == 400
