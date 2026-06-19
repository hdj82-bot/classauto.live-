"""학습 분석 PRO (베타 전용) — 강의별 분석 입출력 스키마.

근거: docs/planning/analytics-spec.md A블록(§2). 마케팅 미리보기(/analytics-example)
와 별개로, 베타테스터에게만 운영자 토글로 제공되는 **실기능**의 데이터 계약이다.

도메인 범용 원칙(§0-A): 특정 과목(把字句 등)을 코드에 박지 않는다. 취약 개념 축은
``CourseProfile.weakness_axes`` 로 주입받아 동적으로 처리한다. 집계·판정 로직 자체는
모든 전공에 동일하며, 바뀌는 것은 weakness_axes 의 내용뿐이다.
"""
import enum

from pydantic import BaseModel, Field


class CourseProfile(BaseModel):
    """과목 메타데이터 주입(§0-A). 모든 집계·프롬프트가 이를 참조한다.

    예) subject="유체역학", field="공학", weakness_axes=["오개념","공식 적용 오류"].
    把字句·보어누락 등은 '어학 전공의 한 예시'일 뿐 기본값/전제가 아니다.
    """

    subject: str = Field(..., min_length=1, max_length=120)
    field: str = Field(..., min_length=1, max_length=60)
    weakness_axes: list[str] = Field(..., min_length=1, max_length=12)
    error_examples: str | None = Field(None, max_length=1000)


class StudentDatum(BaseModel):
    """학생 1명의 학습 행동 원자료(§2.1).

    ``weakness_hits`` 의 키는 ``CourseProfile.weakness_axes`` 를 사용한다(과목 비종속).
    고정 문자열(보어누락 등)을 키로 박지 말 것 — 호출부가 weakness_axes 로 구성한다.
    """

    id: int
    name: str
    watched_percent: float = Field(..., ge=0, le=1)
    completed: bool
    dropoff_point: float | None = Field(None, ge=0, le=100)  # 미완주 시 이탈 지점(%)
    quiz: list[bool] = Field(default_factory=list)  # 문항별 정/오답
    questions_asked: int = Field(..., ge=0)
    weakness_hits: dict[str, int] = Field(default_factory=dict)
    score: float = Field(..., ge=0, le=100)  # 퀴즈 정답률(0~100)


class Verdict(str, enum.Enum):
    """종합 판정 4분류(§2.3). 학습 행동 지표만으로 규칙 판정 — 모든 전공 공통."""

    confused = "confused"      # 혼란
    excelling = "excelling"    # 우등
    polarized = "polarized"    # 양극화
    dropout = "dropout"        # 구간 이탈


class RosterEntry(BaseModel):
    """시청 학생별 요약(§2.2 roster)."""

    id: int
    name: str
    level: str  # "부진"(<50) | "보통" | "우수"(≥75)
    score: float
    top_weakness: str | None  # weakness_hits 최다 축(없으면 None)


class ProgressBuckets(BaseModel):
    """진도 분포(§2.2 progress)."""

    completed: int    # 완료
    in_progress: int  # 진행중
    started: int      # 시작만
    none: int         # 미시청


class LectureAnalysis(BaseModel):
    """``analyze()`` 결과 — §2.2 집계 + §2.3 판정. 과목 무관.

    자연어 브리핑/학생별 솔루션(§2.4)은 이 결과를 입력으로 별도 AI 층이 생성한다
    (판정은 규칙, 설명은 AI — §0 원칙 3). 본 스키마에는 AI 생성물이 들어가지 않는다.

    verdict 는 ``Verdict`` enum 으로 보관한다(str 기반이라 JSON 직렬화 시 값 문자열).
    """

    student_count: int
    avg_score: float
    completion_rate: float       # 0~100(%)
    avg_watched: float           # 0~1
    avg_questions: float
    study_min_per: float         # 인당 학습시간(분, 환산)
    stdev: float                 # 점수 표준편차(양극화 신호)
    drop_buckets: list[int]      # 길이 10(10% 버킷별 미완주 이탈 수)
    drop_concentration: float    # 0~100(%) 최대 버킷 집중도(이탈 신호)
    per_question: list[float]    # 문항별 정답률(0~100)
    weakness_totals: dict[str, int]
    progress: ProgressBuckets
    roster: list[RosterEntry]
    verdict: Verdict
    verdict_reason: str          # 판정 근거(규칙 기반, 설명 가능)
    recommended_direction: str   # 판정별 권장 방향
