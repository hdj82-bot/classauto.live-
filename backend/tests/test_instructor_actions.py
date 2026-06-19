"""교수자 개입 행동 로그(InstructorAction) 테스트 (스펙 11 §H-4, RQ2)."""
import pytest

from tests.conftest import make_auth_header


@pytest.mark.asyncio
async def test_create_and_list_action(client, professor, student, lecture):
    """격려 행동 기록 → 목록에 대상 학습자명과 함께 나타난다."""
    resp = await client.post(
        f"/api/v1/dashboard/{lecture.id}/actions",
        headers=make_auth_header(professor),
        json={
            "action_type": "encouragement",
            "target_user_id": str(student.id),
            "message": "조금만 더 힘내요!",
        },
    )
    assert resp.status_code == 201
    created = resp.json()
    assert created["action_type"] == "encouragement"
    assert created["status"] == "recorded"
    assert created["target_user_id"] == str(student.id)
    assert created["target_name"] == student.name

    lst = await client.get(
        f"/api/v1/dashboard/{lecture.id}/actions",
        headers=make_auth_header(professor),
    )
    assert lst.status_code == 200
    actions = lst.json()
    assert len(actions) == 1
    assert actions[0]["message"] == "조금만 더 힘내요!"


@pytest.mark.asyncio
async def test_class_wide_action_without_target(client, professor, lecture):
    """대상 없는 학급 전체 행동(메모)도 기록된다."""
    resp = await client.post(
        f"/api/v1/dashboard/{lecture.id}/actions",
        headers=make_auth_header(professor),
        json={"action_type": "note", "message": "다음 주 복습 강조"},
    )
    assert resp.status_code == 201
    assert resp.json()["target_user_id"] is None
    assert resp.json()["target_name"] is None


@pytest.mark.asyncio
async def test_action_student_forbidden(client, student, lecture):
    resp = await client.get(
        f"/api/v1/dashboard/{lecture.id}/actions",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_action_invalid_type_rejected(client, professor, lecture):
    resp = await client.post(
        f"/api/v1/dashboard/{lecture.id}/actions",
        headers=make_auth_header(professor),
        json={"action_type": "bogus"},
    )
    assert resp.status_code == 422
