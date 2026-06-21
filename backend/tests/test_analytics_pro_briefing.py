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


# ── 엔드포인트 (교수자 인증 + 베타 게이트 · 합성 데이터 · 폴백 경로) ───────────

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


async def _enable_pro(db, user):
    """베타 토글을 켠 교수자로 만든다(게이트 통과 전제)."""
    user.analytics_pro_enabled = True
    await db.flush()
    return user


@pytest.mark.asyncio
async def test_briefing_endpoint_ok(client, db, professor):
    await _enable_pro(db, professor)
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
async def test_briefing_endpoint_bad_scenario(client, db, professor):
    await _enable_pro(db, professor)
    body = {**_BODY, "scenario": "nope"}
    resp = await client.post(
        "/api/v1/analytics-pro/briefing", json=body, headers=make_auth_header(professor)
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_briefing_endpoint_requires_professor(client, student):
    """학생은 교수자 단계에서 차단(403)."""
    resp = await client.post(
        "/api/v1/analytics-pro/briefing", json=_BODY, headers=make_auth_header(student)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_briefing_endpoint_requires_beta_flag(client, professor):
    """토글이 꺼진 교수자는 베타 권한 부재로 403(운영자 게이트)."""
    resp = await client.post(
        "/api/v1/analytics-pro/briefing", json=_BODY, headers=make_auth_header(professor)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_briefing_endpoint_owner_bypasses_flag(client, db, professor):
    """운영자(ADMIN_EMAILS)는 토글 없이도 통과(QA·시연용)."""
    from app.core.config import settings

    owner_email = next(iter(settings.admin_email_set))
    professor.email = owner_email
    professor.analytics_pro_enabled = False
    await db.flush()
    resp = await client.post(
        "/api/v1/analytics-pro/briefing", json=_BODY, headers=make_auth_header(professor)
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_briefing_endpoint_global_killswitch(client, db, professor, monkeypatch):
    """전역 킬스위치가 꺼지면 토글된 베타테스터도 차단(운영자만 예외)."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "ANALYTICS_PRO_ENABLED", False)
    await _enable_pro(db, professor)
    resp = await client.post(
        "/api/v1/analytics-pro/briefing", json=_BODY, headers=make_auth_header(professor)
    )
    assert resp.status_code == 403
