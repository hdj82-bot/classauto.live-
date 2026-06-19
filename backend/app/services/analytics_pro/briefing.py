"""AI 대면수업 브리핑 + 학생별 솔루션 합성 (docs/planning/analytics-spec.md §2.4).

규칙 판정(``analyze``)을 받아 자연어 운영안을 만든다(§0 원칙 3: 판정은 규칙, 설명은 AI).
프롬프트가 이 기능의 핵심 IP이며, 과목은 ``CourseProfile`` 로 변수화한다(把字句 등
특정 과목을 프롬프트에 박지 않는다 — §0-A).

비용/안정성(insights/briefing.py 패턴 재사용):
- 모델 = ``settings.ANALYTICS_BRIEFING_MODEL``(기본 Sonnet, 스펙 권장). 강의×주 1회 수준.
- ``ANTHROPIC_API_KEY`` 미설정/예외/JSON 파싱 실패 시 **규칙 기반 폴백** — 키 없이도
  유용한 브리핑이 나온다(개발·테스트·오프라인). 결과 ``source`` 로 출처를 투명 표기.
- 동기 Claude 호출은 스레드(anyio)에서 돌려 이벤트 루프를 막지 않는다.
"""
from __future__ import annotations

import json
import logging

import anthropic
import anyio

from app.core.config import settings
from app.core.metrics import track_external_api
from app.core.retry import retry_external
from app.schemas.analytics_pro import (
    Briefing,
    BriefingResult,
    CourseProfile,
    LectureAnalysis,
    RosterEntry,
    StudentSolution,
)

logger = logging.getLogger(__name__)

SOURCE_CLAUDE = "claude"
SOURCE_MOCK = "rule-based-mock"

_CLAUDE_RETRY_ON = (
    anthropic.APIConnectionError,
    anthropic.APITimeoutError,
    anthropic.RateLimitError,
    anthropic.InternalServerError,
)

# §2.4 시스템 프롬프트(IP). 과목 헤더만 f-string 으로 주입하고, JSON 스키마 본문은
# 중괄호 충돌을 피하려 리터럴로 둔다.
_PROMPT_RULES = """\

학습자의 사전학습 집계(JSON)와 규칙 판정을 받아, 교수자에게 이번 주 대면 수업 운영안을
제시한다.

판단 원칙(전 분야 공통):
- 이해도·완주율 낮고 질문 많음 → 핵심 개념 재설명
- 이해도·완주율 높음 → 심화·응용·문제풀이
- 평균은 양호하나 소수만 부진 → 전체 진도 + 부진 학생 개별 보충
- 특정 시청 구간에서 다수 이탈 & 그 전 정답률 양호 → 내용이 아니라 그 구간 영상
  자체(길이·난해함·기술 문제)를 점검하라고 지적

취약 개념 분석은 위 취약 축을 기준으로, 과목에 맞는 용어로 한다. 제공된 집계 수치
외의 사실을 지어내지 않는다(환각 금지). 한국어로 간결하게.

출력은 JSON 한 개만 (코드펜스·여는말 금지):
{
  "verdict_sentence": "이번 영상 종합 결과를 교수자에게 알리는 한 문장",
  "briefing": {
    "approach_title": "운영 방향 제목",
    "approach_detail": "왜+어떻게 2~3문장",
    "opening_move": "대면 첫 5분 실행 지시 한 문장",
    "recommended_minutes": 60,
    "focus_topics": ["1~3개"]
  },
  "student_solutions": [
    {"name": "", "level": "부진|보통|우수", "weakness": "약점 한 줄", "action": "교수 처방 한 줄"}
  ]
}
student_solutions 는 입력의 target_students 전원을 그대로 포함한다(이름·등급 유지).
"""


def _system_prompt(profile: CourseProfile) -> str:
    axes = ", ".join(profile.weakness_axes)
    header = (
        "너는 플립러닝 수업 설계를 돕는 교수법 분석 전문가다.\n"
        f"과목: {profile.subject} ({profile.field} 분야). "
        f"이 과목의 학습자 취약 개념 축: {axes}."
    )
    if profile.error_examples:
        header += f"\n대표 오류 예시: {profile.error_examples}"
    return header + "\n" + _PROMPT_RULES


def select_target_students(analysis: LectureAnalysis) -> list[RosterEntry]:
    """처방 대상 = 부진·보통 전원 + 상위 학생 1명(§2.4).

    상위 1명은 시청 학생 중 최고점. 부진·보통이 그를 이미 포함하면 중복 없이 한 번만.
    """
    roster = analysis.roster
    targets = [r for r in roster if r.level in ("부진", "보통")]
    if roster:
        top = max(roster, key=lambda r: r.score)
        if all(t.id != top.id for t in targets):
            targets.append(top)
    return targets


def _user_content(analysis: LectureAnalysis, targets: list[RosterEntry]) -> str:
    grounding = analysis.model_dump(mode="json")
    target_json = [
        {"name": t.name, "level": t.level, "score": t.score, "top_weakness": t.top_weakness}
        for t in targets
    ]
    return (
        "## 집계 (이 수치만 근거로 사용)\n"
        + json.dumps(grounding, ensure_ascii=False)
        + "\n\n## 규칙 판정\n"
        + json.dumps(
            {"verdict": analysis.verdict.value, "reason": analysis.verdict_reason,
             "direction": analysis.recommended_direction},
            ensure_ascii=False,
        )
        + "\n\n## 처방 대상 학생 (전원 포함)\n"
        + json.dumps(target_json, ensure_ascii=False)
        + "\n\n위 데이터로 대면 수업 운영안을 스키마 JSON 으로 생성하라."
    )


@track_external_api("claude")
@retry_external(label="claude.analytics_pro.briefing", extra_retry_on=_CLAUDE_RETRY_ON)
def _claude_call(client, system: str, user_content: str):
    return client.messages.create(
        model=settings.ANALYTICS_BRIEFING_MODEL,
        max_tokens=settings.ANALYTICS_BRIEFING_MAX_TOKENS,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    )


def _strip_json(raw: str) -> str:
    """코드펜스/잡텍스트를 벗기고 첫 ``{`` ~ 마지막 ``}`` 구간만 취한다."""
    text = raw.strip()
    if text.startswith("```"):
        parts = text.split("```", 2)
        text = parts[1] if len(parts) > 1 else raw
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start : end + 1]
    return text


def _synthesize_with_claude(
    analysis: LectureAnalysis, profile: CourseProfile, targets: list[RosterEntry]
) -> BriefingResult:
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=30.0)
    response = _claude_call(client, _system_prompt(profile), _user_content(analysis, targets))
    text_block = next((b for b in response.content if b.type == "text"), None)
    raw = text_block.text if text_block else "{}"
    payload = json.loads(_strip_json(raw))
    if not isinstance(payload, dict):
        raise ValueError("Claude 응답이 객체 JSON 이 아님")
    # Pydantic 검증(누락/형식 오류면 예외 → 폴백). source 표기.
    result = BriefingResult(
        verdict_sentence=str(payload.get("verdict_sentence") or analysis.verdict_reason),
        briefing=Briefing(**payload["briefing"]),
        student_solutions=[StudentSolution(**s) for s in payload.get("student_solutions", [])],
        source=SOURCE_CLAUDE,
    )
    return result


def build_rule_based(
    analysis: LectureAnalysis, profile: CourseProfile, targets: list[RosterEntry]
) -> BriefingResult:
    """규칙 기반 폴백 — 키 없이도 결정적으로 유용한 브리핑을 만든다(테스트·오프라인)."""
    # 취약 축 상위 1~3개(누계 큰 순).
    ranked = sorted(profile.weakness_axes, key=lambda ax: analysis.weakness_totals.get(ax, 0), reverse=True)
    focus = [ax for ax in ranked if analysis.weakness_totals.get(ax, 0) > 0][:3] or profile.weakness_axes[:1]

    opening = {
        "confused": "가장 많이 틀린 개념 1개를 칠판에 적고, 학생이 직접 오류를 고치게 하세요.",
        "excelling": "기본 개념은 건너뛰고, 바로 응용 문제 1개를 함께 풀며 시작하세요.",
        "polarized": "상·하위가 섞인 짝을 만들어 상위 학생이 설명하게 하며 시작하세요.",
        "dropout": "다수가 이탈한 구간을 먼저 함께 다시 보고 무엇이 막혔는지 물으세요.",
    }
    minutes = {"confused": 70, "excelling": 50, "polarized": 60, "dropout": 60}

    verdict = analysis.verdict.value
    detail = (
        f"{analysis.recommended_direction} 평균 이해도 {analysis.avg_score}점, "
        f"완주율 {analysis.completion_rate}%, 점수 표준편차 {analysis.stdev}."
    )
    briefing = Briefing(
        approach_title=analysis.recommended_direction.split(" — ")[0],
        approach_detail=detail,
        opening_move=opening.get(verdict, opening["confused"]),
        recommended_minutes=minutes.get(verdict, 60),
        focus_topics=focus,
    )

    action_by_level = {
        "부진": "취약 개념을 1:1 또는 소그룹으로 다시 짚고, 쉬운 예제부터 단계적으로.",
        "보통": "오답 위주로 짧게 보충하고, 응용 문제로 적용력을 점검.",
        "우수": "심화 과제·또래 설명 역할을 부여해 몰입을 유지.",
    }
    solutions = [
        StudentSolution(
            name=t.name,
            level=t.level,
            weakness=(t.top_weakness or "뚜렷한 취약 축 없음"),
            action=action_by_level.get(t.level, action_by_level["보통"]),
        )
        for t in targets
    ]

    return BriefingResult(
        verdict_sentence=analysis.verdict_reason,
        briefing=briefing,
        student_solutions=solutions,
        source=SOURCE_MOCK,
    )


async def generate_briefing(
    analysis: LectureAnalysis, profile: CourseProfile
) -> BriefingResult:
    """AI 브리핑 생성. 키 없거나 실패하면 규칙 기반으로 폴백(항상 결과 반환)."""
    targets = select_target_students(analysis)

    if not settings.ANTHROPIC_API_KEY:
        return build_rule_based(analysis, profile, targets)

    try:
        return await anyio.to_thread.run_sync(
            _synthesize_with_claude, analysis, profile, targets
        )
    except Exception as exc:  # noqa: BLE001 — 어떤 실패든 규칙 기반으로 폴백.
        logger.warning("분석 PRO 브리핑 Claude 합성 실패 — 규칙기반 폴백: %s", exc)
        return build_rule_based(analysis, profile, targets)
