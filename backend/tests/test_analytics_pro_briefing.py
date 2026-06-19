"""학습 분석 PRO — AI 브리핑·학생솔루션 (docs/planning/analytics-spec.md §2.4).

CI 에는 ANTHROPIC_API_KEY 가 없어 **규칙 기반 폴백** 경로가 검증된다(외부 호출 0).
프롬프트(IP) 자체의 품질은 키가 있는 환경에서 별도 점검한다.
"""
from __future__ import annotations

import json

import pytest

from app.schemas.analytics_pro import CourseProfile
from app.services.analytics_pro import analyze, build_rule_based, generate, SCENARIOS
from app.services.analytics_pro.briefing import (
    _strip_json,
    select_target_students,
)
from tests.conftest import make_auth_header

PROFILES = [
    CourseProfile(subject="유체역학", field="공학", weakness_axes=["오개념", "공식 적용 오류"]),
    CourseProfile(subject="헌법", field="법학", weakness_axes=["쟁점 적용", "요건 누락"]),
    CourseProfile(subject="서양미술사", field="예술학", weakness_axes=["기법", "비평 관점 누락"]),
]


# ── 규칙 기반 폴백 브리핑 (전공·시나리오 무관 유효성) ──────────────────────────


@pytest.mark.parametrize("profile", PROFILES, ids=lambda p: p.field)
@pytest.mark.parametrize("scenario", SCENARIOS)
def test_rule_based_briefing_is_valid(profile, scenario):
    analysis = analyze(generate(profile, scenario, count=40, seed=5), profile)
    targets = select_target_students(analysis)
    result = build_rule_based(analysis, profile, targets)

    assert result.source == "rule-based-mock"
    assert result.verdict_sentence
    assert result.briefing.approach_title
    assert result.briefing.opening_move
    assert 0 <= result.briefing.recommended_minutes <= 180
    assert 1 <= len(result.briefing.focus_topics) <= 3
    for tp in result.briefing.focus_topics:
        assert tp in profile.weakness_axes

    # student_solutions 는 부진·보통 전원을 포함한다(§2.4).
    sol_names = {s.name for s in result.student_solutions}
    low_med = {r.name for r in analysis.roster if r.level in ("부진", "보통")}
    assert low_med <= sol_names
    for s in result.student_solutions:
        assert s.level in ("부진", "보통", "우수")
        assert s.weakness and s.action


def test_select_targets_low_med_plus_one_top_no_dup():
    p = CourseProfile(subject="X", field="공학", weakness_axes=["a"])
    analysis = analyze(generate(p, "polarized", count=20, seed=1), p)
    targets = select_target_students(analysis)
    ids = [t.id for t in targets]
    assert len(ids) == len(set(ids))  # 중복 없음
    # 부진·보통 전원 포함.
    low_med = {r.id for r in analysis.roster if r.level in ("부진", "보통")}
    assert low_med <= set(ids)
    # 상위 1명(시청 학생 최고점)이 포함된다.
    top = max(analysis.roster, key=lambda r: r.score)
    assert top.id in set(ids)


def test_strip_json_variants():
    assert json.loads(_strip_json('```json\n{"a": 1}\n```')) == {"a": 1}
    assert json.loads(_strip_json('결과입니다: {"a": 1} 이상.')) == {"a": 1}
    assert json.loads(_strip_json('{"a": 1}')) == {"a": 1}


# ── 엔드포인트 (교수자 인증 · 합성 데이터 · 폴백 경로) ─────────────────────────

_BODY = {
    "course_profile": {
        "subject": "유체역학",
        "field": "공학",
        "weakness_axes": ["오개념", "공식 적용 오류"],
    },
    "scenario": "dropout",
    "count": 40,
    "seed": 3,
}


async def _enable(db, user):
    user.analytics_pro_enabled = True
    await db.flush()


@pytest.mark.asyncio
async def test_briefing_endpoint_ok(client, professor, db):
    await _enable(db, professor)  # 운영자 토글 on 상태
    resp = await client.post(
        "/api/v1/analytics-pro/briefing", json=_BODY, headers=make_auth_header(professor)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["analysis"]["verdict"] == "dropout"
    assert data["ai"]["source"] in ("claude", "rule-based-mock")
    assert data["ai"]["briefing"]["focus_topics"]
    assert isinstance(data["ai"]["student_solutions"], list)


@pytest.mark.asyncio
async def test_briefing_endpoint_bad_scenario(client, professor, db):
    await _enable(db, professor)
    body = {**_BODY, "scenario": "nope"}
    resp = await client.post(
        "/api/v1/analytics-pro/briefing", json=body, headers=make_auth_header(professor)
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_briefing_endpoint_blocked_when_not_enabled(client, professor):
    # 기본 교수자는 analytics_pro_enabled=False → 운영자 토글 게이트가 403.
    resp = await client.post(
        "/api/v1/analytics-pro/briefing", json=_BODY, headers=make_auth_header(professor)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_briefing_endpoint_requires_professor(client, student):
    resp = await client.post(
        "/api/v1/analytics-pro/briefing", json=_BODY, headers=make_auth_header(student)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_toggle_enables_feature(client, admin, professor):
    # 토글 엔드포인트가 commit 하면 ORM 객체가 만료되므로, 헤더·id 를 미리 캡처한다
    # (만료 후 professor.id 접근은 async 세션에서 lazy-load 오류를 낼 수 있음).
    prof_headers = make_auth_header(professor)
    prof_id = str(professor.id)
    admin_headers = make_auth_header(admin)

    # 처음엔 막힘(운영자 미활성).
    r0 = await client.post(
        "/api/v1/analytics-pro/briefing", json=_BODY, headers=prof_headers
    )
    assert r0.status_code == 403

    # 운영자가 토글 on.
    rt = await client.post(
        f"/api/v1/admin/users/{prof_id}/analytics-pro?enabled=true", headers=admin_headers
    )
    assert rt.status_code == 200
    assert rt.json()["analytics_pro_enabled"] is True

    # /me 가 노출 여부를 반영.
    rme = await client.get("/api/v1/users/me", headers=prof_headers)
    assert rme.json()["analytics_pro_enabled"] is True

    # 이제 접근 가능.
    r1 = await client.post(
        "/api/v1/analytics-pro/briefing", json=_BODY, headers=prof_headers
    )
    assert r1.status_code == 200
