"""집중도 점수 산식 단위 테스트 (스펙 11 §D).

dashboard._attention_score / _attention_aggregate 는 learning_sessions 의 딴짓
신호를 0~100 으로 환산하는 순수 함수다(DB 불필요). 산식 변경 시 회귀 가드.
"""
from types import SimpleNamespace

from app.services.dashboard import _attention_aggregate, _attention_score


def _sess(**kw):
    """집중도 산식이 읽는 필드만 가진 가짜 세션."""
    base = dict(
        warning_level=0,
        no_response_cnt=0,
        total_sec=600,
        total_pause_seconds=0,
        is_network_unstable=False,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_perfect_session_scores_100():
    assert _attention_score(_sess()) == 100


def test_warnings_and_no_response_penalize_and_clamp():
    # 경고·무반응이 많아도 0 미만으로 내려가지 않는다(clamp).
    s = _sess(warning_level=99, no_response_cnt=99)
    score = _attention_score(s)
    assert 0 <= score < 100
    assert score == 0  # cap*penalty 합이 100 을 넘어 0 으로 clamp


def test_pause_ratio_reduces_score():
    # 정지비율이 클수록 점수가 낮다.
    low = _attention_score(_sess(total_pause_seconds=0))
    high = _attention_score(_sess(total_pause_seconds=300))  # 50% 정지
    assert high < low


def test_network_penalty_is_light():
    assert _attention_score(_sess(is_network_unstable=True)) == 95


def test_aggregate_distribution_buckets():
    sessions = [
        _sess(),                                   # 100 → focused
        _sess(warning_level=3, no_response_cnt=2), # 100-36-16=48 → moderate
        _sess(warning_level=5, no_response_cnt=5), # 0 → distracted
    ]
    agg = _attention_aggregate(sessions)
    assert agg["distribution"] == {"focused": 1, "moderate": 1, "distracted": 1}
    assert 0 <= agg["score"] <= 100


def test_aggregate_empty():
    agg = _attention_aggregate([])
    assert agg["score"] == 0
    assert agg["distribution"] == {"focused": 0, "moderate": 0, "distracted": 0}
