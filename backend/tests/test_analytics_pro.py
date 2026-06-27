"""학습 분석 PRO 코어 — 집계·판정·합성데이터 검증 (docs/planning/analytics-spec.md §2).

핵심 회귀: 합성 시나리오(4분류)를 **서로 다른 전공 3종**으로 생성→analyze 했을 때
의도한 verdict 가 나오는지(=판정 규칙이 과목 비종속임)를 확인한다.
"""
from __future__ import annotations

import pytest

from app.schemas.analytics_pro import CourseProfile, StudentDatum, Verdict
from app.services.analytics_pro import SCENARIOS, analyze, generate

# 서로 다른 전공 3종 — weakness_axes 만 다르고 로직은 동일해야 한다(把字句 없음).
PROFILES = [
    CourseProfile(subject="유체역학", field="공학", weakness_axes=["오개념", "공식 적용 오류"]),
    CourseProfile(subject="헌법", field="법학", weakness_axes=["쟁점 적용", "요건 누락"]),
    CourseProfile(subject="서양미술사", field="예술학", weakness_axes=["기법", "비평 관점 누락"]),
]


# ── 합성 시나리오 → 판정 회귀 (전공 무관) ──────────────────────────────────────


@pytest.mark.parametrize("profile", PROFILES, ids=lambda p: p.field)
@pytest.mark.parametrize("scenario", SCENARIOS)
def test_scenario_maps_to_verdict_across_majors(profile, scenario):
    students = generate(profile, scenario, count=40, seed=7)
    result = analyze(students, profile)
    assert result.verdict == Verdict(scenario), (
        f"{profile.field} {scenario}: got {result.verdict} "
        f"(avg={result.avg_score}, comp={result.completion_rate}, "
        f"stdev={result.stdev}, conc={result.drop_concentration})"
    )


def test_generate_is_deterministic():
    p = PROFILES[0]
    a = analyze(generate(p, "polarized", count=30, seed=3), p)
    b = analyze(generate(p, "polarized", count=30, seed=3), p)
    assert a.model_dump() == b.model_dump()


def test_unknown_scenario_raises():
    with pytest.raises(ValueError):
        generate(PROFILES[0], "mystery")


# ── 집계 정확성 (손으로 만든 작은 입력) ─────────────────────────────────────────


def _mk(**kw) -> StudentDatum:
    base = dict(
        id=1, name="x", watched_percent=1.0, completed=True,
        dropoff_point=None, quiz=[], questions_asked=0, weakness_hits={}, score=50.0,
    )
    base.update(kw)
    return StudentDatum(**base)


def test_empty_input_is_safe():
    p = PROFILES[0]
    r = analyze([], p)
    assert r.student_count == 0
    assert r.drop_buckets == [0] * 10
    assert r.weakness_totals == {ax: 0 for ax in p.weakness_axes}
    assert r.verdict == Verdict.confused  # 안내 판정(표본 없음)


def test_aggregation_math():
    p = CourseProfile(subject="X", field="공학", weakness_axes=["a", "b"])
    students = [
        _mk(id=1, score=90, completed=True, watched_percent=1.0,
            quiz=[True, True], questions_asked=1, weakness_hits={"a": 2}),
        _mk(id=2, score=50, completed=False, watched_percent=0.3, dropoff_point=30.0,
            quiz=[True, False], questions_asked=3, weakness_hits={"a": 1, "b": 4}),
    ]
    r = analyze(students, p, video_minutes=10.0)
    assert r.student_count == 2
    assert r.avg_score == 70.0
    assert r.completion_rate == 50.0
    assert r.avg_watched == 0.65
    assert r.avg_questions == 2.0
    assert r.study_min_per == 6.5            # 0.65 × 10
    assert r.per_question == [100.0, 50.0]   # 문항1 둘 다 정답, 문항2 1/2
    assert r.weakness_totals == {"a": 3, "b": 4}
    assert r.drop_buckets[3] == 1            # 30% → 3번 버킷
    assert r.drop_concentration == 100.0     # 이탈자 전원이 한 버킷
    assert r.progress.completed == 1
    assert len(r.roster) == 2                # 둘 다 시청함


def test_roster_excludes_non_watchers_and_grades_levels():
    p = CourseProfile(subject="X", field="법학", weakness_axes=["a"])
    students = [
        _mk(id=1, score=80, watched_percent=1.0, completed=True),    # 우수
        _mk(id=2, score=60, watched_percent=0.4, completed=False, dropoff_point=40.0),  # 보통
        _mk(id=3, score=40, watched_percent=0.0, completed=False),   # 미시청 → roster 제외
    ]
    r = analyze(students, p)
    ids = {e.id: e.level for e in r.roster}
    assert ids == {1: "우수", 2: "보통"}      # id=3 제외
    assert r.progress.none == 1
