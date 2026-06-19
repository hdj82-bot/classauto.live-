"""강의별 분석 집계 + 4분류 판정.

근거: docs/planning/analytics-spec.md §2.2(집계) · §2.3(판정 규칙).

순수 함수다 — 입력은 ``StudentDatum`` 목록 + ``CourseProfile``, 외부 의존 0(과목 무관).
판정은 데이터 기반 **규칙**으로(근거 제시 가능), 자연어 브리핑은 별도 AI 층이 맡는다
(§0 원칙 3: 분류를 AI 감에 맡기지 않는다). 추후 실 집계가 같은 인터페이스를 채우면
합성 데이터 경로만 교체된다(§5).
"""
from __future__ import annotations

from statistics import pstdev

from app.schemas.analytics_pro import (
    CourseProfile,
    LectureAnalysis,
    ProgressBuckets,
    RosterEntry,
    StudentDatum,
    Verdict,
)

# 등급 임계(§2.2 roster): 부진<50 / 보통 / 우수≥75
LEVEL_LOW = 50.0
LEVEL_HIGH = 75.0

# 진도 버킷 임계(시청 진도 0~1). 완주(completed)는 항상 '완료'.
STARTED_MIN = 0.05      # 0 초과 ~ 이 미만: '시작만'
IN_PROGRESS_MIN = 0.5   # 이 이상(미완주): '진행중', 미만(시청 있음): '시작만'

# 판정 임계(§2.3) — 스펙의 수치를 상수로 고정(설명 가능성).
DROPOUT_INCOMPLETE_FRAC = 0.40   # 미완주자 ≥ 전체 40%
DROPOUT_CONCENTRATION = 45.0     # 최대 이탈 버킷 집중도 ≥ 45%
DROPOUT_MIN_SCORE = 55.0         # 이탈 직전 정답률 양호(평균 ≥ 55)
POLARIZED_STDEV = 24.0
POLARIZED_MIN_SCORE = 55.0
CONFUSED_MAX_SCORE = 55.0
CONFUSED_MAX_COMPLETION = 55.0

# 학습시간 환산 기준 — 영상 길이(분). 호출부가 실제 영상 길이를 넘기면 그것을 쓴다.
DEFAULT_VIDEO_MINUTES = 12.0

_DIRECTION = {
    Verdict.confused: "핵심 개념 재설명 — 이해도·완주율이 동반 저조합니다.",
    Verdict.excelling: "심화·응용·문제풀이 — 이해도·완주율이 동반 양호합니다.",
    Verdict.polarized: "전체 진도 + 부진 그룹 개별 보충/상담 — 평균은 양호하나 편차가 큽니다.",
    Verdict.dropout: "영상 구간 점검 — 특정 시청 구간에서 다수가 이탈했습니다.",
}


def _level(score: float) -> str:
    if score < LEVEL_LOW:
        return "부진"
    if score >= LEVEL_HIGH:
        return "우수"
    return "보통"


def _top_weakness(hits: dict[str, int]) -> str | None:
    """가장 많이 적중한 취약 축. 동률이면 입력 순서상 먼저 나온 축."""
    best: str | None = None
    best_n = 0
    for ax, n in hits.items():
        if n > best_n:
            best, best_n = ax, n
    return best


def _judge(
    n: int,
    completed_n: int,
    completion_rate: float,
    avg_score: float,
    stdev: float,
    drop_concentration: float,
    drop_buckets: list[int],
) -> tuple[Verdict, str]:
    """§2.3 규칙을 스펙 순서 그대로 적용(우선순위: 이탈 → 양극화 → 혼란 → 우등)."""
    incomplete_frac = (n - completed_n) / n if n else 0.0

    if (
        incomplete_frac >= DROPOUT_INCOMPLETE_FRAC
        and drop_concentration >= DROPOUT_CONCENTRATION
        and avg_score >= DROPOUT_MIN_SCORE
    ):
        peak = drop_buckets.index(max(drop_buckets)) if any(drop_buckets) else 0
        reason = (
            f"미완주 {incomplete_frac * 100:.0f}% 중 {drop_concentration:.0f}%가 "
            f"{peak * 10}~{peak * 10 + 10}% 구간 한 곳에 몰림 / 이탈 직전 정답률 양호"
            f"(평균 {avg_score:.0f}) → 내용이 아니라 영상 구간 의심"
        )
        return Verdict.dropout, reason

    if stdev >= POLARIZED_STDEV and avg_score >= POLARIZED_MIN_SCORE:
        reason = (
            f"평균({avg_score:.0f})은 양호하나 표준편차({stdev:.0f})가 큼 / "
            "하위 그룹(<50점) 형성 → 양극화"
        )
        return Verdict.polarized, reason

    if avg_score < CONFUSED_MAX_SCORE and completion_rate < CONFUSED_MAX_COMPLETION:
        reason = (
            f"이해도({avg_score:.0f})·완주율({completion_rate:.0f}%)이 동반 저조 / "
            "질문 빈도 높음 → 혼란"
        )
        return Verdict.confused, reason

    reason = (
        f"이해도({avg_score:.0f})·완주율({completion_rate:.0f}%)이 동반 양호 / "
        f"분산 작음(σ={stdev:.0f}) → 우등"
    )
    return Verdict.excelling, reason


def _empty(profile: CourseProfile) -> LectureAnalysis:
    return LectureAnalysis(
        student_count=0,
        avg_score=0.0,
        completion_rate=0.0,
        avg_watched=0.0,
        avg_questions=0.0,
        study_min_per=0.0,
        stdev=0.0,
        drop_buckets=[0] * 10,
        drop_concentration=0.0,
        per_question=[],
        weakness_totals={ax: 0 for ax in profile.weakness_axes},
        progress=ProgressBuckets(completed=0, in_progress=0, started=0, none=0),
        roster=[],
        verdict=Verdict.confused,
        verdict_reason="표본이 없어 판정할 수 없습니다(시청 데이터 대기).",
        recommended_direction="아직 시청 데이터가 없습니다.",
    )


def analyze(
    students: list[StudentDatum],
    profile: CourseProfile,
    *,
    video_minutes: float = DEFAULT_VIDEO_MINUTES,
) -> LectureAnalysis:
    """원자료 → 지표 집계 + 4분류 판정(§2.2~2.3). 빈 입력은 0값 + 안내 판정."""
    n = len(students)
    if n == 0:
        return _empty(profile)

    scores = [s.score for s in students]
    avg_score = sum(scores) / n
    completed_n = sum(1 for s in students if s.completed)
    completion_rate = completed_n / n * 100.0
    avg_watched = sum(s.watched_percent for s in students) / n
    avg_questions = sum(s.questions_asked for s in students) / n
    study_min_per = avg_watched * video_minutes
    score_stdev = pstdev(scores) if n > 1 else 0.0

    # 이탈 지점 분포(미완주 + dropoff_point 보유자만). 10% 버킷, 100%는 9번 버킷에.
    drop_buckets = [0] * 10
    for s in students:
        if not s.completed and s.dropoff_point is not None:
            idx = min(9, int(s.dropoff_point // 10))
            drop_buckets[idx] += 1
    total_drops = sum(drop_buckets)
    drop_concentration = (max(drop_buckets) / total_drops * 100.0) if total_drops else 0.0

    # 문항별 정답률(문항 수는 가장 긴 quiz 기준, 답이 없는 학생은 해당 문항에서 제외).
    q_len = max((len(s.quiz) for s in students), default=0)
    per_question: list[float] = []
    for i in range(q_len):
        answered = [s.quiz[i] for s in students if i < len(s.quiz)]
        if answered:
            per_question.append(sum(1 for a in answered if a) / len(answered) * 100.0)
        else:
            per_question.append(0.0)

    # 취약 축 누계 — profile.weakness_axes 를 키로 0 초기화 후 합산(미선언 축도 흡수).
    weakness_totals: dict[str, int] = {ax: 0 for ax in profile.weakness_axes}
    for s in students:
        for ax, c in s.weakness_hits.items():
            weakness_totals[ax] = weakness_totals.get(ax, 0) + c

    # 진도 분포.
    done = in_prog = started = none = 0
    for s in students:
        if s.completed:
            done += 1
        elif s.watched_percent >= IN_PROGRESS_MIN:
            in_prog += 1
        elif s.watched_percent >= STARTED_MIN:
            started += 1
        else:
            none += 1
    progress = ProgressBuckets(
        completed=done, in_progress=in_prog, started=started, none=none
    )

    # 명단(시청한 학생만 — watched_percent > 0).
    roster = [
        RosterEntry(
            id=s.id,
            name=s.name,
            level=_level(s.score),
            score=round(s.score, 1),
            top_weakness=_top_weakness(s.weakness_hits),
        )
        for s in students
        if s.watched_percent > 0
    ]

    verdict, reason = _judge(
        n, completed_n, completion_rate, avg_score, score_stdev, drop_concentration, drop_buckets
    )

    return LectureAnalysis(
        student_count=n,
        avg_score=round(avg_score, 1),
        completion_rate=round(completion_rate, 1),
        avg_watched=round(avg_watched, 3),
        avg_questions=round(avg_questions, 2),
        study_min_per=round(study_min_per, 1),
        stdev=round(score_stdev, 1),
        drop_buckets=drop_buckets,
        drop_concentration=round(drop_concentration, 1),
        per_question=[round(p, 1) for p in per_question],
        weakness_totals=weakness_totals,
        progress=progress,
        roster=roster,
        verdict=verdict,
        verdict_reason=reason,
        recommended_direction=_DIRECTION[verdict],
    )
