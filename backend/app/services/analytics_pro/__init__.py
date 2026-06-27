"""학습 분석 PRO (베타 전용 실기능) — 강의별 분석 코어.

docs/planning/analytics-spec.md A블록(§2)의 집계·판정·합성데이터 층. 마케팅
미리보기(/analytics-example)와 별개이며, 추후 AI 브리핑 층(§2.4)·학기 B블록(§3)·
API/게이트가 이 패키지 위에 얹힌다.
"""
from app.services.analytics_pro.analyze import DEFAULT_VIDEO_MINUTES, analyze
from app.services.analytics_pro.briefing import build_rule_based, generate_briefing
from app.services.analytics_pro.semester import (
    build_rule_based_review,
    build_rule_based_survey,
    compute_timeline,
    generate_review,
    generate_survey,
    synthesize_responses,
    synthesize_trend,
)
from app.services.analytics_pro.synthetic import SCENARIOS, generate

__all__ = [
    "analyze",
    "generate",
    "generate_briefing",
    "build_rule_based",
    "SCENARIOS",
    "DEFAULT_VIDEO_MINUTES",
    # B 학기 전체 분석(§3)
    "compute_timeline",
    "synthesize_trend",
    "generate_survey",
    "build_rule_based_survey",
    "synthesize_responses",
    "generate_review",
    "build_rule_based_review",
]
