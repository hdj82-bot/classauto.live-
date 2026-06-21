"""학습 분석 PRO B블록 — 학기 전체 분석 (docs/planning/analytics-spec.md §3).

CI 에는 ANTHROPIC_API_KEY 가 없어 **규칙 기반 폴백** 경로가 검증된다(외부 호출 0).
설문/총평 프롬프트(IP) 자체의 품질은 키가 있는 환경에서 별도 점검한다.

§5 회귀: 서로 다른 전공 3개(공학/법학/예술)로 weakness_axes 만 바꿔가며 같은 로직이
과목 비종속으로 동작하는지 확인한다(把字句 등 하드코딩 없음).
"""
from __future__ import annotations

import pytest

from app.schemas.analytics_pro import CourseProfile, SemesterProfile
from app.services.analytics_pro import (
    build_rule_based_review,
    build_rule_based_survey,
    compute_timeline,
    synthesize_responses,
    synthesize_trend,
)
from tests.conftest import make_auth_header

# §0-A 도메인 범용 — 把字句 등 특정 과목 하드코딩 없이 전공만 주입해 회귀.
PROFILES = [
    CourseProfile(subject="유체역학", field="공학", weakness_axes=["오개념", "공식 적용 오류"]),
    CourseProfile(subject="헌법", field="법학", weakness_axes=["쟁점 적용", "요건 누락"]),
    CourseProfile(subject="서양미술사", field="예술학", weakness_axes=["기법", "비평 관점 누락"]),
]


def _sp(profile: CourseProfile, weeks: int = 16, current: int = 14) -> SemesterProfile:
    return SemesterProfile(course=profile, semester_weeks=weeks, current_week=current, enrolled=40)


# ── 타임라인(§3.1) — 마감 = 학기주차 − 1 ─────────────────────────────────────


def test_timeline_deadline_is_weeks_minus_one():
    assert compute_timeline(15, 12).deadline_week == 14
    assert compute_timeline(16, 12).deadline_week == 15


def test_timeline_open_and_past_deadline_flags():
    early = compute_timeline(16, 9)
    assert early.is_open is False  # 10주차 전엔 닫힘
    opened = compute_timeline(16, 10)
    assert opened.is_open is True
    late = compute_timeline(16, 16)
    assert late.is_past_deadline is True  # 16 > 15(마감)
    on_time = compute_timeline(16, 15)
    assert on_time.is_past_deadline is False


# ── (a) 주차별 추이(§3.3) — 결정적·우상향·과목 무관 ──────────────────────────


@pytest.mark.parametrize("profile", PROFILES, ids=lambda p: p.field)
def test_trend_is_upward_and_deterministic(profile):
    sp = _sp(profile, weeks=16, current=14)
    a = synthesize_trend(sp, seed=7)
    b = synthesize_trend(sp, seed=7)
    assert [w.model_dump() for w in a.weeks] == [w.model_dump() for w in b.weeks]  # 결정성
    assert len(a.weeks) == 14
    # ClassAuto 도입 효과 — 1주 대비 상승.
    assert a.completion_delta > 0
    assert a.understanding_delta > 0
    assert a.engagement_delta > 0
    assert a.timeline.deadline_week == 15


def test_trend_caps_weeks_at_current():
    sp = _sp(PROFILES[0], weeks=16, current=3)
    assert len(synthesize_trend(sp).weeks) == 3


# ── (b) 설문 규칙기반 폴백(§3.4) — 6문항·자기효능감·DOI 환각 방어 ─────────────


@pytest.mark.parametrize("profile", PROFILES, ids=lambda p: p.field)
def test_rule_based_survey_shape(profile):
    survey = build_rule_based_survey(profile)
    assert survey.source == "rule-based-mock"
    assert survey.warning  # 상단 경고 고정(§3.7)
    assert len(survey.questions) == 6
    likert = [q for q in survey.questions if "리커트" in q.scale]
    open_q = [q for q in survey.questions if q.scale == "주관식"]
    assert len(likert) == 5 and len(open_q) == 1
    # 폴백은 가짜 DOI 를 만들지 않는다(§3.7) — 전부 빈 문자열, 교수자가 채움.
    for q in survey.questions:
        assert q.reference.citation
        assert q.reference.doi == ""
    # 실제 취약 축이 자기효능감 문항에 반영된다(과목 변수화).
    axis = profile.weakness_axes[0]
    assert any(axis in q.text for q in survey.questions)


# ── (c) 응답 분포(§3.5) — 리커트만·길이5·합=응답수 ──────────────────────────


def test_synthesize_responses_distribution():
    survey = build_rule_based_survey(PROFILES[0])
    dists = synthesize_responses(survey, respondents=30, seed=1)
    assert len(dists) == 5  # 리커트 5개만(주관식 제외)
    for d in dists:
        assert len(d.dist) == 5
        assert sum(d.dist) == 30
        assert 1.0 <= d.average <= 5.0


# ── (d) 총평 규칙기반 폴백(§3.6) — 델타 근거·논문 2개·과목 무관 ───────────────


@pytest.mark.parametrize("profile", PROFILES, ids=lambda p: p.field)
def test_rule_based_review_shape(profile):
    trend = synthesize_trend(_sp(profile), seed=3)
    review = build_rule_based_review(profile, trend)
    assert review.source == "rule-based-mock"
    assert review.overview
    assert review.theory_lens
    assert review.strengths and review.weaknesses and review.improvements
    assert len(review.paper_suggestions) == 2
    for p in review.paper_suggestions:
        assert p.title and p.direction and p.method
    # 전공 맥락 반영 — 과목명이 논문 제안에 등장.
    assert any(profile.subject in p.title for p in review.paper_suggestions)


# ── 엔드포인트(게이트 · 합성 데이터 · 폴백) ──────────────────────────────────

_PROFILE_BODY = {
    "subject": "유체역학",
    "field": "공학",
    "weakness_axes": ["오개념", "공식 적용 오류"],
}
_SEMESTER_BODY = {
    "profile": {"course": _PROFILE_BODY, "semester_weeks": 16, "current_week": 14, "enrolled": 40},
    "seed": 1,
}


async def _enable_pro(db, user):
    user.analytics_pro_enabled = True
    await db.flush()
    return user


@pytest.mark.asyncio
async def test_trend_endpoint_ok(client, db, professor):
    await _enable_pro(db, professor)
    resp = await client.post(
        "/api/v1/analytics-pro/semester/trend", json=_SEMESTER_BODY, headers=make_auth_header(professor)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["completion_delta"] > 0
    assert data["timeline"]["deadline_week"] == 15


@pytest.mark.asyncio
async def test_survey_endpoint_ok(client, db, professor):
    await _enable_pro(db, professor)
    resp = await client.post(
        "/api/v1/analytics-pro/semester/survey",
        json={"course_profile": _PROFILE_BODY},
        headers=make_auth_header(professor),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["survey"]["questions"]) == 6
    assert data["survey"]["source"] in ("claude", "rule-based-mock")
    assert len(data["responses"]) == 5


@pytest.mark.asyncio
async def test_review_endpoint_ok(client, db, professor):
    await _enable_pro(db, professor)
    resp = await client.post(
        "/api/v1/analytics-pro/semester/review", json=_SEMESTER_BODY, headers=make_auth_header(professor)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["paper_suggestions"]) == 2
    assert data["source"] in ("claude", "rule-based-mock")


@pytest.mark.asyncio
async def test_semester_endpoints_require_beta_flag(client, professor):
    """토글 OFF 교수자는 403(게이트). 세 엔드포인트 모두."""
    for path, body in (
        ("/api/v1/analytics-pro/semester/trend", _SEMESTER_BODY),
        ("/api/v1/analytics-pro/semester/survey", {"course_profile": _PROFILE_BODY}),
        ("/api/v1/analytics-pro/semester/review", _SEMESTER_BODY),
    ):
        resp = await client.post(path, json=body, headers=make_auth_header(professor))
        assert resp.status_code == 403, path


@pytest.mark.asyncio
async def test_semester_endpoints_forbid_student(client, student):
    resp = await client.post(
        "/api/v1/analytics-pro/semester/trend", json=_SEMESTER_BODY, headers=make_auth_header(student)
    )
    assert resp.status_code == 403
