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


# ── AI 브리핑·학생 솔루션(§2.4) — 판정은 규칙, 설명은 AI ──────────────────────


class Briefing(BaseModel):
    """AI 대면 수업 운영안(§2.4 briefing). 강의 전체 방향."""

    approach_title: str
    approach_detail: str        # 왜+어떻게 2~3문장
    opening_move: str           # 대면 첫 5분 실행 지시 한 문장
    recommended_minutes: int = Field(..., ge=0, le=180)
    focus_topics: list[str]     # 1~3개


class StudentSolution(BaseModel):
    """학생별 개인화 처방(§2.4 studentSolutions)."""

    name: str
    level: str                  # 부진|보통|우수
    weakness: str               # 약점 한 줄
    action: str                 # 교수 처방 한 줄


class BriefingResult(BaseModel):
    """``generate_briefing()`` 결과 — analyze 판정 + AI(또는 규칙기반 폴백) 설명.

    ``source`` 로 실제 Claude 생성인지 규칙기반 폴백인지 투명하게 표기한다.
    """

    verdict_sentence: str
    briefing: Briefing
    student_solutions: list[StudentSolution]
    source: str                 # "claude" | "rule-based-mock"


# ── B. 학기 전체 분석(§3) — 10주차~학기말 ────────────────────────────────────


class SemesterProfile(BaseModel):
    """학기 분석 입력(§3.1). 과목 메타(CourseProfile) + 학기 타임라인.

    ``semester_weeks`` 는 학기 총 주차(15/16 등), ``current_week`` 는 현재 주차.
    분석 마감 주차는 ``semester_weeks - 1`` 로 자동 계산(§3.1).
    """

    course: CourseProfile
    semester_weeks: int = Field(..., ge=2, le=24)
    current_week: int = Field(..., ge=1, le=24)
    enrolled: int = Field(40, ge=1, le=2000)


class SemesterTimeline(BaseModel):
    """학기 분석 타임라인 판정(§3.1). 순수 계산 — AI 비의존."""

    semester_weeks: int
    current_week: int
    trigger_week: int            # 기능 개방 주차(스펙 고정 10)
    deadline_week: int           # 분석 마감 = semester_weeks - 1
    is_open: bool                # current_week >= trigger_week
    is_past_deadline: bool       # current_week > deadline_week


class WeeklyMetric(BaseModel):
    """주차별 학습효율 1포인트(§3.3)."""

    week: int
    completion_rate: float       # 0~100(%)
    avg_understanding: float     # 0~100
    engagement: float            # 0~100(대면 참여도)


class SemesterTrend(BaseModel):
    """주차별 추이 + 1주 대비 상승폭 요약(§3.3 — ClassAuto 도입 효과 가시화)."""

    weeks: list[WeeklyMetric]
    completion_delta: float      # +%p (현재 - 1주)
    understanding_delta: float
    engagement_delta: float
    timeline: SemesterTimeline


class SurveyReference(BaseModel):
    """설문 문항 근거 문헌(§3.4). DOI 는 교수자 검증 대상(§3.7)."""

    citation: str
    doi: str = ""                # 빈 값 = 교수자가 실재 확인 후 채움(폴백 시)


class SurveyQuestion(BaseModel):
    """학기말 설문 1문항(§3.4) — 본문 + 교수법 근거 + 참고문헌."""

    no: int
    text: str
    scale: str                   # "5점 리커트" | "주관식"
    rationale: str               # 교수법 설계 근거
    reference: SurveyReference


class SurveyResult(BaseModel):
    """``generate_survey()`` 결과(§3.4). 상단 경고 고정 + 출처 표기."""

    warning: str
    questions: list[SurveyQuestion]
    source: str                  # "claude" | "rule-based-mock"


class SurveyResponseDist(BaseModel):
    """설문 응답 분포 1문항(§3.5) — 5점 척도 분포 + 평균(데모 합성)."""

    no: int
    text: str
    dist: list[int]              # 길이 5(1~5점 응답 수)
    average: float


class PaperSuggestion(BaseModel):
    """논문 제목·방향 제안(§3.6) — 집필은 Accept.best 로 연결."""

    title: str
    direction: str
    method: str


class SemesterReview(BaseModel):
    """학기 총평[PRO](§3.6) — 교육공학 이론 렌즈 + 장단점 + 논문 제안."""

    overview: str
    theory_lens: str
    strengths: list[str]
    weaknesses: list[str]
    improvements: list[str]
    paper_suggestions: list[PaperSuggestion]
    source: str                  # "claude" | "rule-based-mock"
