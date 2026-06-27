"""학기 전체 분석 B블록 (docs/planning/analytics-spec.md §3).

A블록(강의별)과 시간축이 다르다 — B는 10주차에 열려 학기말(마감 = 학기주차−1)까지
작동한다(§3.1). 구성:
- (a) 주차별 학습효율 추이 — 순수 합성 집계(과목 무관, AI 비의존). §3.3
- (b) 학기말 설문 자동생성 — AI(프롬프트=IP) + 규칙기반 폴백. §3.4
- (c) 응답 결과 시각화 — 데모용 합성 분포(실 구현 시 실제 응답 집계). §3.5
- (d) 학기 총평[PRO] + 논문 제안 — AI + 규칙기반 폴백. §3.6

설계 원칙(§0): 판정·집계는 규칙, 설명·생성은 AI. 과목은 ``CourseProfile`` 로 변수화
(把字句 등 하드코딩 없음). AI 산출물(특히 DOI)은 교수자 검토 전제 — §3.7 경고 고정.

비용/안정성은 briefing.py 패턴 재사용(동기 Claude+스레드, retry/track 데코, _strip_json,
키 미설정/실패 시 규칙기반 폴백, source 로 출처 투명 표기).
"""
from __future__ import annotations

import json
import logging
import random

import anthropic
import anyio

from app.core.config import settings
from app.core.metrics import track_external_api
from app.core.retry import retry_external
from app.schemas.analytics_pro import (
    CourseProfile,
    PaperSuggestion,
    SemesterProfile,
    SemesterReview,
    SemesterTimeline,
    SemesterTrend,
    SurveyQuestion,
    SurveyReference,
    SurveyResponseDist,
    SurveyResult,
    WeeklyMetric,
)
from app.services.analytics_pro.briefing import (
    SOURCE_CLAUDE,
    SOURCE_MOCK,
    _CLAUDE_RETRY_ON,
    _strip_json,
)

logger = logging.getLogger(__name__)

TRIGGER_WEEK = 10  # 기능 개방 주차(§3.1 고정)

# §3.4 상단 고정 경고(§3.7 할루시네이션 방어 — 교수자 책임·DOI 실재 확인).
SURVEY_WARNING = (
    "⚠️ AI 생성물은 반드시 교수자 검토가 필요합니다. 문항·근거·참고문헌은 초안이며, "
    "최종 책임은 교수자에게 있습니다. 특히 DOI는 실재 여부를 반드시 확인하세요."
)


# ── (timeline) 타임라인 — 순수 계산 ─────────────────────────────────────────


def compute_timeline(semester_weeks: int, current_week: int) -> SemesterTimeline:
    """분석 마감 주차 = 학기 총 주차 − 1(§3.1). 10주차에 개방."""
    deadline = semester_weeks - 1
    return SemesterTimeline(
        semester_weeks=semester_weeks,
        current_week=current_week,
        trigger_week=TRIGGER_WEEK,
        deadline_week=deadline,
        is_open=current_week >= TRIGGER_WEEK,
        is_past_deadline=current_week > deadline,
    )


# ── (a) 주차별 학습효율 추이 — 합성 집계(과목 무관) ──────────────────────────


def synthesize_trend(sp: SemesterProfile, *, seed: int = 1) -> SemesterTrend:
    """1주~현재까지 누적 지표를 결정적으로 생성(§3.3).

    ClassAuto 도입 효과 가시화를 위해 1주 대비 우상향하도록 설계하되, 시드 고정
    소폭 노이즈만 준다(판정·델타가 시드 운에 안 흔들리게). 지표는 학습 행동 기반이라
    과목과 무관(§3.3).
    """
    rnd = random.Random(f"trend:{seed}:{sp.semester_weeks}")
    n = max(1, min(sp.current_week, sp.semester_weeks))
    weeks: list[WeeklyMetric] = []
    for w in range(1, n + 1):
        # 1주(기준) → 현재까지 선형 상승 + 소폭 노이즈. 상한 clamp.
        frac = (w - 1) / max(1, n - 1)
        comp = min(98.0, 58.0 + 32.0 * frac + rnd.uniform(-2.0, 2.0))
        und = min(95.0, 55.0 + 28.0 * frac + rnd.uniform(-2.0, 2.0))
        eng = min(95.0, 40.0 + 40.0 * frac + rnd.uniform(-2.0, 2.0))
        weeks.append(
            WeeklyMetric(
                week=w,
                completion_rate=round(comp, 1),
                avg_understanding=round(und, 1),
                engagement=round(eng, 1),
            )
        )
    first, last = weeks[0], weeks[-1]
    return SemesterTrend(
        weeks=weeks,
        completion_delta=round(last.completion_rate - first.completion_rate, 1),
        understanding_delta=round(last.avg_understanding - first.avg_understanding, 1),
        engagement_delta=round(last.engagement - first.engagement, 1),
        timeline=compute_timeline(sp.semester_weeks, sp.current_week),
    )


# ── (b) 학기말 설문 자동생성 — AI(IP) + 규칙기반 폴백 ────────────────────────

# §3.4 시스템 프롬프트(IP). 과목 헤더만 주입, JSON 스키마는 리터럴.
_SURVEY_RULES = """\

너는 교육공학 전문가다. 위 과목의 10주차까지 학습 데이터와 강의계획서 맥락을 전제로
학기말 학습자 설문을 설계한다.
- 문항 6개: 5점 리커트 5개 + 주관식 1개.
- 각 문항마다 (1) 교수법적 설계 근거와 (2) 실제 교육공학 문헌(citation + DOI)을 제시.
- 위 취약 개념에 대한 자기효능감을 측정하는 문항을 1개 이상 포함.
- 인식·자기효능감·전이(transfer)·만족도를 균형 있게.
- DOI는 실재하는 것만. 불확실하면 doi를 빈 문자열로 두고 교수자가 채우게 한다(환각 금지).
한국어로 작성. 출력은 JSON 한 개만(코드펜스·여는말 금지):
{
  "questions": [
    {
      "no": 1,
      "text": "문항 본문",
      "scale": "5점 리커트",
      "rationale": "교수법 근거 1~2문장",
      "reference": {"citation": "저자(연도). 제목. 출처.", "doi": "10.xxxx/xxxxx"}
    }
  ]
}
questions 는 정확히 6개(리커트 5 + 주관식 1).
"""

# §3.6 시스템 프롬프트(IP).
_REVIEW_RULES = """\

너는 교육공학 연구자다. 위 과목의 학기 학습 데이터·강의계획서·학기말 설문 결과를
종합해 교수자를 위한 학술적 학기 총평을 작성한다. 최신 교육공학 이론(플립러닝,
인지부하, 멀티미디어 학습, 자기조절학습, 형성평가 등)에 근거하라. 제공 맥락 밖의
구체 수치를 지어내지 마라(환각 금지). 한국어로 작성. 출력은 JSON 한 개만:
{
  "overview": "종합 총평 2~3문장",
  "theory_lens": "적용한 핵심 이론 1~2개 한 줄",
  "strengths": ["..."],
  "weaknesses": ["..."],
  "improvements": ["..."],
  "paper_suggestions": [
    {"title": "국문 제목", "direction": "데이터로 무엇을 주장할지", "method": "권장 방법"}
  ]
}
paper_suggestions 는 정확히 2개. 이 수업의 현실적 데이터로 쓸 수 있는 주제로(전공 맥락 반영).
"""


def _course_header(profile: CourseProfile) -> str:
    axes = ", ".join(profile.weakness_axes)
    header = (
        f"과목: {profile.subject} ({profile.field} 분야). "
        f"이 과목의 학습자 취약 개념 축: {axes}."
    )
    if profile.error_examples:
        header += f"\n대표 오류 예시: {profile.error_examples}"
    return header


@track_external_api("claude")
@retry_external(label="claude.analytics_pro.semester", extra_retry_on=_CLAUDE_RETRY_ON)
def _claude_call(client, system: str, user_content: str, max_tokens: int):
    return client.messages.create(
        model=settings.ANALYTICS_BRIEFING_MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    )


def _parse_claude(response) -> dict:
    text_block = next((b for b in response.content if b.type == "text"), None)
    raw = text_block.text if text_block else "{}"
    payload = json.loads(_strip_json(raw))
    if not isinstance(payload, dict):
        raise ValueError("Claude 응답이 객체 JSON 이 아님")
    return payload


def build_rule_based_survey(profile: CourseProfile) -> SurveyResult:
    """규칙 기반 설문 폴백 — 키 없이도 유효한 6문항(리커트 5 + 주관식 1).

    참고문헌은 실재하는 표준 교육공학 문헌의 citation 만 두고 DOI 는 빈 문자열로
    남겨 교수자가 실재 확인 후 채우게 한다(§3.7 환각 방어 — 가짜 DOI 생성 금지).
    """
    axis = profile.weakness_axes[0]
    subject = profile.subject
    qs = [
        SurveyQuestion(
            no=1,
            text=f"{subject} 사전학습 영상이 대면 수업 이해에 도움이 되었다.",
            scale="5점 리커트",
            rationale="플립러닝의 핵심 가정(사전학습→대면 심화)에 대한 학습자 인식 측정.",
            reference=SurveyReference(
                citation="Bishop, J. L., & Verleger, M. A. (2013). The flipped classroom: A survey of the research. ASEE.",
            ),
        ),
        SurveyQuestion(
            no=2,
            text=f"나는 '{axis}'와 관련된 과제를 스스로 해결할 수 있다고 느낀다.",
            scale="5점 리커트",
            rationale=f"이 수업의 실제 취약 개념('{axis}')에 대한 자기효능감 측정(§3.4).",
            reference=SurveyReference(
                citation="Bandura, A. (1977). Self-efficacy: Toward a unifying theory of behavioral change. Psychological Review.",
            ),
        ),
        SurveyQuestion(
            no=3,
            text="영상 분량과 난이도는 사전학습에 적절했다.",
            scale="5점 리커트",
            rationale="인지부하 이론 관점에서 자료 설계의 적정성 점검.",
            reference=SurveyReference(
                citation="Sweller, J. (1988). Cognitive load during problem solving. Cognitive Science.",
            ),
        ),
        SurveyQuestion(
            no=4,
            text="이 수업에서 배운 내용을 다른 상황·과목에 적용할 수 있을 것 같다.",
            scale="5점 리커트",
            rationale="학습 전이(transfer) 인식 측정.",
            reference=SurveyReference(
                citation="Barnett, S. M., & Ceci, S. J. (2002). When and where do we apply what we learn? Psychological Bulletin.",
            ),
        ),
        SurveyQuestion(
            no=5,
            text="전반적으로 이 수업의 플립러닝 방식에 만족한다.",
            scale="5점 리커트",
            rationale="학습자 만족도(전반) 측정 — 인식·전이와 함께 균형.",
            reference=SurveyReference(
                citation="Kirkpatrick, D. L. (1994). Evaluating training programs: The four levels. Berrett-Koehler.",
            ),
        ),
        SurveyQuestion(
            no=6,
            text=f"'{axis}'를 더 잘 이해하기 위해 수업에서 바뀌었으면 하는 점을 자유롭게 적어주세요.",
            scale="주관식",
            rationale="형성평가 관점의 개방형 피드백 — 취약 개념 개선 단서 수집.",
            reference=SurveyReference(
                citation="Black, P., & Wiliam, D. (1998). Assessment and classroom learning. Assessment in Education.",
            ),
        ),
    ]
    return SurveyResult(warning=SURVEY_WARNING, questions=qs, source=SOURCE_MOCK)


def _synthesize_survey_with_claude(profile: CourseProfile) -> SurveyResult:
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=30.0)
    system = _course_header(profile) + "\n" + _SURVEY_RULES
    user = "위 과목의 학기말 학습자 설문을 스키마 JSON 으로 설계하라."
    payload = _parse_claude(
        _claude_call(client, system, user, settings.ANALYTICS_SURVEY_MAX_TOKENS)
    )
    questions = [SurveyQuestion(**q) for q in payload["questions"]]
    if not questions:
        raise ValueError("설문 문항이 비어 있음")
    return SurveyResult(warning=SURVEY_WARNING, questions=questions, source=SOURCE_CLAUDE)


async def generate_survey(profile: CourseProfile) -> SurveyResult:
    """학기말 설문 생성(§3.4). 키 없거나 실패하면 규칙기반 폴백(항상 결과 반환)."""
    if not settings.ANTHROPIC_API_KEY:
        return build_rule_based_survey(profile)
    try:
        return await anyio.to_thread.run_sync(_synthesize_survey_with_claude, profile)
    except Exception as exc:  # noqa: BLE001 — 어떤 실패든 규칙기반 폴백.
        logger.warning("분석 PRO 설문 Claude 합성 실패 — 규칙기반 폴백: %s", exc)
        return build_rule_based_survey(profile)


# ── (c) 응답 결과 시각화 — 데모용 합성 분포 ─────────────────────────────────


def synthesize_responses(
    survey: SurveyResult, *, respondents: int = 30, seed: int = 1
) -> list[SurveyResponseDist]:
    """설문 응답 5점 분포를 데모용으로 합성(§3.5).

    실제 구현 시 실 응답 집계로 교체(같은 ``SurveyResponseDist`` 인터페이스).
    주관식(리커트 아님)은 분포 시각화 대상이 아니므로 제외한다.
    """
    rnd = random.Random(f"resp:{seed}:{respondents}")
    out: list[SurveyResponseDist] = []
    for q in survey.questions:
        if "리커트" not in q.scale:
            continue
        # 대체로 긍정(4~5점)으로 치우친 현실적 분포.
        weights = [0.05, 0.10, 0.20, 0.35, 0.30]
        dist = [0, 0, 0, 0, 0]
        for _ in range(respondents):
            r = rnd.random()
            acc = 0.0
            for idx, wgt in enumerate(weights):
                acc += wgt
                if r <= acc:
                    dist[idx] += 1
                    break
            else:
                dist[4] += 1
        total = sum(dist) or 1
        avg = sum((i + 1) * c for i, c in enumerate(dist)) / total
        out.append(SurveyResponseDist(no=q.no, text=q.text, dist=dist, average=round(avg, 2)))
    return out


# ── (d) 학기 총평[PRO] + 논문 제안 — AI(IP) + 규칙기반 폴백 ──────────────────


def build_rule_based_review(profile: CourseProfile, trend: SemesterTrend) -> SemesterReview:
    """규칙 기반 총평 폴백 — 추이 델타를 근거로 결정적 총평을 만든다(키 없이도 유효)."""
    subject, field = profile.subject, profile.field
    overview = (
        f"{subject}({field}) 플립러닝 운영 결과, 1주 대비 완주율 "
        f"{trend.completion_delta:+.1f}%p·이해도 {trend.understanding_delta:+.1f}점·"
        f"대면참여도 {trend.engagement_delta:+.1f}점의 변화가 관찰되었다. "
        "사전학습→대면 심화 구조가 학습 행동 지표에 누적 효과를 낸 것으로 보인다."
    )
    strengths = [
        "사전학습 영상 완주율이 학기 진행에 따라 꾸준히 상승.",
        "대면 참여도 증가 — 사전학습 기반 토론·문제풀이 정착 신호.",
    ]
    weaknesses = [
        f"'{profile.weakness_axes[0]}' 등 취약 개념의 자기효능감은 별도 보강 필요.",
        "상·하위 학습자 격차가 일부 주차에서 관찰됨(양극화 가능성).",
    ]
    improvements = [
        "취약 개념 전용 인터스티셜 퀴즈·보충 영상으로 하위 그룹 개별 보강.",
        "대면 수업을 또래 설명(peer instruction) 구조로 전환해 격차 완화.",
    ]
    papers = [
        PaperSuggestion(
            title=f"플립러닝이 {subject} 학습자의 완주율과 대면 참여에 미치는 영향",
            direction="주차별 완주율·참여도 추이의 우상향을 ClassAuto 도입 효과로 주장.",
            method="단일집단 사전-사후 설계 + 주차별 반복측정(repeated measures).",
        ),
        PaperSuggestion(
            title=f"{field} 수업에서 취약 개념 자기효능감과 학습 전이의 관계",
            direction="설문의 자기효능감·전이 문항 상관으로 취약 개념 개입 효과 논의.",
            method="설문 기반 상관·회귀 분석(자기효능감 → 전이).",
        ),
    ]
    return SemesterReview(
        overview=overview,
        theory_lens="플립러닝 · 인지부하 이론 · 자기조절학습",
        strengths=strengths,
        weaknesses=weaknesses,
        improvements=improvements,
        paper_suggestions=papers,
        source=SOURCE_MOCK,
    )


def _synthesize_review_with_claude(profile: CourseProfile, trend: SemesterTrend) -> SemesterReview:
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=30.0)
    system = _course_header(profile) + "\n" + _REVIEW_RULES
    user = (
        "## 주차별 추이 요약(이 수치만 근거)\n"
        + json.dumps(
            {
                "completion_delta": trend.completion_delta,
                "understanding_delta": trend.understanding_delta,
                "engagement_delta": trend.engagement_delta,
                "weeks": len(trend.weeks),
            },
            ensure_ascii=False,
        )
        + "\n\n위 맥락으로 학기 총평과 논문 제안을 스키마 JSON 으로 작성하라."
    )
    payload = _parse_claude(
        _claude_call(client, system, user, settings.ANALYTICS_REVIEW_MAX_TOKENS)
    )
    papers = [PaperSuggestion(**p) for p in payload.get("paper_suggestions", [])]
    return SemesterReview(
        overview=str(payload["overview"]),
        theory_lens=str(payload.get("theory_lens", "")),
        strengths=list(payload.get("strengths", [])),
        weaknesses=list(payload.get("weaknesses", [])),
        improvements=list(payload.get("improvements", [])),
        paper_suggestions=papers,
        source=SOURCE_CLAUDE,
    )


async def generate_review(profile: CourseProfile, trend: SemesterTrend) -> SemesterReview:
    """학기 총평[PRO] 생성(§3.6). 키 없거나 실패하면 규칙기반 폴백."""
    if not settings.ANTHROPIC_API_KEY:
        return build_rule_based_review(profile, trend)
    try:
        return await anyio.to_thread.run_sync(_synthesize_review_with_claude, profile, trend)
    except Exception as exc:  # noqa: BLE001 — 어떤 실패든 규칙기반 폴백.
        logger.warning("분석 PRO 총평 Claude 합성 실패 — 규칙기반 폴백: %s", exc)
        return build_rule_based_review(profile, trend)
