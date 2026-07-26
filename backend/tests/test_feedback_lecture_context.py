"""피드백에 강의 맥락 붙이기 — 스펙 14 §D.

**왜**: 피드백은 `page`(라우트)만 갖고 있었다. 그런데 시청 화면은 `/lecture/[slug]`
하나라 **모든 강의의 제보가 같은 값으로 모인다.** 운영자가 "어느 강의에서 난
문제인지"를 알 수 없어 재현을 시작할 지점이 없었다.

검증 축:
1. `lecture_id` 없이도 제출이 된다 — 맥락을 못 붙였다고 제보를 막으면 안 된다
2. 목록이 강의 **제목**을 함께 준다 (UUID 만으로는 운영자가 알 수 없다)
3. 강의가 삭제돼도 피드백이 목록에서 사라지지 않는다 (LEFT JOIN)
4. 상태 토글 응답도 제목을 유지한다
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.models.course import Course
from app.models.feedback import Feedback
from app.models.lecture import Lecture
from tests.conftest import make_auth_header


async def _lecture(db, professor, title: str = "1주차 — 어순") -> Lecture:
    course = Course(id=uuid.uuid4(), title="중국어문법", instructor_id=professor.id)
    db.add(course)
    await db.flush()
    lec = Lecture(
        id=uuid.uuid4(),
        course_id=course.id,
        title=title,
        slug=f"lec-{uuid.uuid4().hex[:10]}",
        order=1,
        is_published=True,
    )
    db.add(lec)
    await db.flush()
    return lec


@pytest.mark.asyncio
async def test_feedback_records_lecture_id(client, db, professor):
    lec = await _lecture(db, professor)

    resp = await client.post(
        "/api/v1/feedback",
        headers=make_auth_header(professor),
        json={"category": "bug", "message": "자막이 밀립니다", "lecture_id": str(lec.id)},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["lecture_id"] == str(lec.id)


@pytest.mark.asyncio
async def test_feedback_without_lecture_still_submits(client, db, professor):
    """맥락이 없다고 제보를 막으면 베타에서 가장 필요한 신호를 잃는다."""
    resp = await client.post(
        "/api/v1/feedback",
        headers=make_auth_header(professor),
        json={"category": "idea", "message": "대시보드에 학기 필터가 있으면 좋겠습니다"},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["lecture_id"] is None


@pytest.mark.asyncio
async def test_admin_list_includes_lecture_title(client, db, professor, admin):
    """UUID 만 보여주면 운영자는 어느 강의인지 여전히 모른다."""
    lec = await _lecture(db, professor, title="3주차 — 把자문")
    await client.post(
        "/api/v1/feedback",
        headers=make_auth_header(professor),
        json={"category": "bug", "message": "재생이 멈춥니다", "lecture_id": str(lec.id)},
    )

    data = (
        await client.get(
            "/api/v1/admin/feedback", headers=make_auth_header(admin)
        )
    ).json()
    assert data["feedback"][0]["lecture_title"] == "3주차 — 把자문"


@pytest.mark.asyncio
async def test_admin_list_keeps_feedback_without_a_lecture(
    client, db, professor, admin
):
    """LEFT JOIN 이어야 한다 — INNER JOIN 이면 강의 없는 제보가 통째로 사라진다."""
    await client.post(
        "/api/v1/feedback",
        headers=make_auth_header(professor),
        json={"category": "other", "message": "강의와 무관한 의견"},
    )

    data = (
        await client.get(
            "/api/v1/admin/feedback", headers=make_auth_header(admin)
        )
    ).json()
    assert data["total"] == 1
    assert data["feedback"][0]["lecture_title"] is None


@pytest.mark.asyncio
async def test_deleted_lecture_does_not_hide_feedback(client, db, professor, admin):
    """강의를 지워도 제보 본문은 남아야 한다(FK SET NULL)."""
    lec = await _lecture(db, professor)
    await client.post(
        "/api/v1/feedback",
        headers=make_auth_header(professor),
        json={"category": "bug", "message": "지워질 강의의 제보", "lecture_id": str(lec.id)},
    )

    fb = (await db.execute(select(Feedback))).scalar_one()
    fb.lecture_id = None  # FK ondelete=SET NULL 이 하는 일과 같다.
    await db.commit()

    data = (
        await client.get(
            "/api/v1/admin/feedback", headers=make_auth_header(admin)
        )
    ).json()
    assert data["total"] == 1
    assert data["feedback"][0]["message"] == "지워질 강의의 제보"


@pytest.mark.asyncio
async def test_status_toggle_keeps_lecture_title(client, db, professor, admin):
    """제목을 비워 보내면 상태를 토글한 카드만 맥락이 사라진 것처럼 보인다."""
    lec = await _lecture(db, professor, title="5주차 — 보어")
    created = (
        await client.post(
            "/api/v1/feedback",
            headers=make_auth_header(professor),
            json={"category": "bug", "message": "x", "lecture_id": str(lec.id)},
        )
    ).json()

    resp = await client.patch(
        f"/api/v1/admin/feedback/{created['id']}",
        headers=make_auth_header(admin),
        json={"status": "triaged"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["lecture_title"] == "5주차 — 보어"


@pytest.mark.asyncio
async def test_admin_list_does_not_scale_queries_with_rows(
    client, db, professor, admin
):
    """행마다 강의를 조회하면 페이지당 N+1 이 된다 — 한 번의 JOIN 이어야 한다."""
    lec = await _lecture(db, professor)
    for i in range(5):
        await client.post(
            "/api/v1/feedback",
            headers=make_auth_header(professor),
            json={"category": "bug", "message": f"제보 {i}", "lecture_id": str(lec.id)},
        )

    data = (
        await client.get(
            "/api/v1/admin/feedback", headers=make_auth_header(admin)
        )
    ).json()
    assert data["total"] == 5
    assert all(item["lecture_title"] == "1주차 — 어순" for item in data["feedback"])
