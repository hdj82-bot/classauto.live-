"""합성(가짜) 학습 데이터 생성 — 실 이벤트 수집 인프라 연결 전 분석/판정/AI 층 검증용.

근거: docs/planning/analytics-spec.md §0(가짜 데이터 우선) · §5(6월 범위).

추후 실제 Supabase 집계가 같은 ``StudentDatum`` 인터페이스를 채우면 그대로 교체된다.
**과목 비종속**: 점수·완주·이탈 같은 학습 행동만 시나리오별로 만들고, 취약 축은
``CourseProfile.weakness_axes`` 를 그대로 키로 쓴다(把字句 등 특정 과목 문자열 없음).

시나리오는 §2.3 4분류와 1:1 — 생성 → analyze 하면 의도한 verdict 가 나오도록 분포를
설계했다(서로 다른 전공으로 weakness_axes 만 바꿔가며 회귀 검증할 때 기준이 된다).
"""
from __future__ import annotations

import random

from app.schemas.analytics_pro import CourseProfile, StudentDatum

SCENARIOS = ("excelling", "confused", "polarized", "dropout")

# 과목과 무관한 일반 이름 풀(이름은 과목 장식이 아니다). 인원이 풀보다 많으면 번호를 붙인다.
_NAMES = [
    "김민준", "이서연", "박도윤", "최지우", "정하준", "강서윤", "조시우", "윤지호",
    "장하은", "임주원", "한예준", "오서아", "서지안", "신유준", "권하린", "황지율",
    "안건우", "송수아", "류지민", "전우진", "홍예나", "고은채", "문대현", "양소율",
    "배준호", "백서진", "남윤재", "심다인", "노하경", "하지후", "구본영", "표서우",
    "민채원", "엄지완", "원태경", "천소민", "방시현", "공하늘", "현유나", "마동훈",
]


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def _name(i: int) -> str:
    return _NAMES[i] if i < len(_NAMES) else f"학습자 {i + 1:02d}"


def _quiz_from_score(score: float, q_len: int, rnd: random.Random) -> list[bool]:
    """정답 확률을 점수에 비례시켜 문항별 정/오답을 만든다."""
    p = _clamp(score, 0, 100) / 100.0
    return [rnd.random() < p for _ in range(q_len)]


def _weakness_hits(
    axes: list[str], intensity: float, rnd: random.Random
) -> dict[str, int]:
    """취약 축별 적중 빈도. intensity 가 높을수록(부진할수록) 많이 적중한다."""
    return {ax: rnd.randint(0, max(0, round(intensity * rnd.uniform(0.5, 1.5)))) for ax in axes}


def generate(
    profile: CourseProfile,
    scenario: str = "excelling",
    *,
    count: int = 40,
    quiz_len: int = 6,
    seed: int = 1,
) -> list[StudentDatum]:
    """``scenario`` 분포로 학생 ``count`` 명을 결정적으로 생성(seed 고정 시 재현 가능).

    scenario ∈ SCENARIOS. 잘못된 값이면 ValueError.
    """
    if scenario not in SCENARIOS:
        raise ValueError(f"unknown scenario {scenario!r}; expected one of {SCENARIOS}")

    rnd = random.Random(f"{scenario}:{seed}:{count}")
    axes = profile.weakness_axes
    students: list[StudentDatum] = []

    for i in range(count):
        # 완주 여부는 시드 운에 흔들리지 않게 **결정적 패턴**으로 둔다(판정 임계가
        # 확률적 미완주율 경계를 우연히 넘나들어 회귀가 깨지는 것을 막는다). 점수의
        # 분산만 난수로 준다.
        if scenario == "excelling":
            # 우등: 높은 점수·낮은 분산·높은 완주(미완주 10% < 40 → 이탈 아님).
            score = _clamp(rnd.gauss(82, 7))
            completed = i % 10 != 0
            questions = rnd.randint(0, 2)
            intensity = 1.0
        elif scenario == "confused":
            # 혼란: 낮은 점수(평균<55)·낮은 완주(40%<55)·질문 많음.
            score = _clamp(rnd.gauss(45, 8))
            completed = i % 5 < 2
            questions = rnd.randint(2, 6)
            intensity = 4.0
        elif scenario == "polarized":
            # 양극화: 상/하 두 집단(평균≥55·σ 큼). 완주 80%(미완주 20%<40 → 이탈 아님).
            high = i % 2 == 0
            score = _clamp(rnd.gauss(85 if high else 35, 4))
            completed = i % 5 != 0
            questions = rnd.randint(0, 2) if high else rnd.randint(2, 5)
            intensity = 1.0 if high else 4.5
        else:  # dropout
            # 구간 이탈: 평균≥55인데 미완주 60%(≥40), 미완주 이탈 지점이 한 구간에 몰림.
            score = _clamp(rnd.gauss(62, 8))
            completed = i % 5 < 2
            questions = rnd.randint(0, 3)
            intensity = 2.0

        if completed:
            watched = 1.0
            dropoff = None
        else:
            if scenario == "dropout":
                # 60~70% 구간에 집중된 이탈(±소폭) → drop_concentration ≥ 45% 보장.
                dropoff = _clamp(rnd.gauss(64, 3), 0, 99)
            else:
                dropoff = _clamp(rnd.uniform(10, 90), 0, 99)
            watched = round(dropoff / 100.0, 3)

        students.append(
            StudentDatum(
                id=i + 1,
                name=_name(i),
                watched_percent=watched,
                completed=completed,
                dropoff_point=None if completed else round(dropoff, 1),
                quiz=_quiz_from_score(score, quiz_len, rnd),
                questions_asked=questions,
                weakness_hits=_weakness_hits(axes, intensity, rnd),
                score=round(score, 1),
            )
        )

    return students
