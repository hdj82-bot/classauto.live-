"""학습 목표(LearningGoal) CRUD + 달성률 테스트 (스펙 11 §H-3)."""
import uuid

import pytest

from app.services.goals import _progress_pct
from tests.conftest import make_auth_header


def test_progress_pct_pure():
    # before 40 → target 80: current 60 이면 (60-40)/(80-40)=50%
    assert _progress_pct(40.0, 60.0, 80.0) == 50.0
    # 목표 도달
    assert _progress_pct(40.0, 80.0, 80.0) == 100.0
    # 초과는 100 으로 클램프
    assert _progress_pct(40.0, 90.0, 80.0) == 100.0
    # 역행은 0 으로 클램프
    assert _progress_pct(40.0, 30.0, 80.0) == 0.0
    # target<=baseline 인 경우: 현재가 target 이상이면 100
    assert _progress_pct(80.0, 85.0, 70.0) == 100.0
    # baseline None → 0 으로 취급
    assert _progress_pct(None, 50.0, 100.0) == 50.0


@pytest.mark.asyncio
async def test_create_and_list_goal(client, professor, lecture):
    resp = await client.post(
        f"/api/v1/dashboard/{lecture.id}/goals",
        headers=make_auth_header(professor),
        json={"metric": "completionRate", "label": "완료율 80% 달성", "target_value": 80},
    )
    assert resp.status_code == 201
    created = resp.json()
    assert created["metric"] == "completionRate"
    assert created["target_value"] == 80
    assert created["baseline_value"] is not None  # 생성 시점 스냅샷
    assert created["achieved"] is False

    resp2 = await client.get(
        f"/api/v1/dashboard/{lecture.id}/goals",
        headers=make_auth_header(professor),
    )
    assert resp2.status_code == 200
    goals = resp2.json()
    assert len(goals) == 1
    assert goals[0]["label"] == "완료율 80% 달성"


@pytest.mark.asyncio
async def test_goal_student_forbidden(client, student, lecture):
    resp = await client.get(
        f"/api/v1/dashboard/{lecture.id}/goals",
        headers=make_auth_header(student),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_update_and_delete_goal(client, professor, lecture):
    create = await client.post(
        f"/api/v1/dashboard/{lecture.id}/goals",
        headers=make_auth_header(professor),
        json={"metric": "avgAccuracy", "label": "정답률 목표", "target_value": 70},
    )
    goal_id = create.json()["id"]

    upd = await client.patch(
        f"/api/v1/dashboard/{lecture.id}/goals/{goal_id}",
        headers=make_auth_header(professor),
        json={"target_value": 90},
    )
    assert upd.status_code == 200
    assert upd.json()["target_value"] == 90

    dele = await client.delete(
        f"/api/v1/dashboard/{lecture.id}/goals/{goal_id}",
        headers=make_auth_header(professor),
    )
    assert dele.status_code == 204

    after = await client.get(
        f"/api/v1/dashboard/{lecture.id}/goals",
        headers=make_auth_header(professor),
    )
    assert after.json() == []


@pytest.mark.asyncio
async def test_goal_not_found(client, professor, lecture):
    resp = await client.delete(
        f"/api/v1/dashboard/{lecture.id}/goals/{uuid.uuid4()}",
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 404
