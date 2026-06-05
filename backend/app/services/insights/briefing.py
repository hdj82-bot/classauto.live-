"""Claude 합성 — "대면수업 솔루션 보고서" 생성 (11 §H·§5, 09 §10 RQ2).

집계(aggregator) → Claude 경량 합성 → class_briefings 저장. 비용 가드레일(08)을
지킨다.

비용·호출 상한:
- 합성 모델 = ``settings.CLAUDE_MODEL`` (경량 Haiku, "공용 기본값"). 학생 인터랙션
  경로가 아니라 강의×주 1회 수준이라 가드레일 위험이 낮다(11 §5).
- **재생성 최소 간격**: 같은 강의 보고서는 기본 6시간 내 재호출 시 캐시 반환
  (force=True 로만 우회). 교수자 새로고침 연타로 인한 비용 폭주 차단.
- **월 강의별 실제 호출 상한**: 한 달 같은 강의의 Claude 합성 횟수 상한(백스톱).
  초과 시 규칙 기반(mock) 합성으로 폴백한다.
- ``ANTHROPIC_API_KEY`` 미설정/예외/JSON 파싱 실패 시 **규칙 기반 합성**으로
  폴백 — 키 없이도 보고서가 동작(개발·테스트·오프라인).

환각 방지(11 §5): 시스템 프롬프트가 "제공된 집계 수치 외 인용 금지"를 강제하고,
프롬프트에 집계 JSON 전체를 grounding 으로 넣는다.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

import anthropic
import anyio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.metrics import track_external_api
from app.core.retry import retry_external
from app.models.cost_log import CostCategory, CostLog
from app.models.lecture import Lecture
from app.services import dashboard as dashboard_svc
from app.services.insights import aggregator
from app.services.insights.models import ClassBriefing

logger = logging.getLogger(__name__)

MOCK_MODEL = "rule-based-mock"
INSIGHTS_MAX_TOKENS = 2048
# 같은 강의 보고서 재생성 최소 간격(분). 이 안에서는 force 없으면 캐시 반환.
INSIGHTS_MIN_REGEN_INTERVAL_MINUTES = 360  # 6h
# 한 달 같은 강의가 일으킬 수 있는 실제 Claude 합성 호출 상한(백스톱).
INSIGHTS_MONTHLY_MAX_PER_LECTURE = 30

_CLAUDE_RETRY_ON = (
    anthropic.APIConnectionError,
    anthropic.APITimeoutError,
    anthropic.RateLimitError,
    anthropic.InternalServerError,
)

_SYSTEM_PROMPT = """\
당신은 플립러닝 강의의 상호작용 데이터를 분석해 교수자에게 **차주 대면 수업의 초점**을
제안하는 조교입니다. 아래 규칙을 반드시 지키세요.

규칙:
1. 오직 사용자가 제공한 집계 JSON 의 수치만 근거로 삼습니다. JSON 에 없는 수치·사실을
   지어내지 않습니다(환각 금지).
2. 결과는 아래 스키마의 **JSON 한 개**로만 출력합니다(마크다운·설명 문장 금지).
3. 한국어로 간결하게 작성합니다. 중국어/한자 용어는 원문 그대로 둡니다.
4. recommendations 의 target_slides 는 watch.slides 의 index 를, target_students 는
   students[].user_id 를 그대로 사용합니다.

출력 JSON 스키마:
{
  "summary": ["학습 데이터 요약 불릿", ...],
  "weak_concepts": [
    {"concept": "...", "why": "근거 한 줄", "severity": 0.0, "evidence": {...}}
  ],
  "recommendations": [
    {"type": "review|reorder|supplement|activity|contact",
     "focus": "차주 수업 초점 한 줄",
     "activity": "구체적 활동 제안",
     "rationale": "어떤 데이터에 근거하는지",
     "target_slides": [int], "target_students": ["user_id"]}
  ],
  "class_vs_individual": {
    "class_signals": ["학급 전체 신호", ...],
    "individual_signals": [
      {"student": "user_id 또는 이름", "signal": "...", "suggestion": "..."}
    ]
  }
}
"""


@track_external_api("claude")
@retry_external(label="claude.insights.create", extra_retry_on=_CLAUDE_RETRY_ON)
def _claude_call(client, user_content: str):
    return client.messages.create(
        model=settings.CLAUDE_MODEL,
        max_tokens=INSIGHTS_MAX_TOKENS,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )


def _strip_json(raw: str) -> str:
    """코드펜스/잡텍스트를 벗기고 첫 ``{`` ~ 마지막 ``}`` 구간만 취한다."""
    text = raw.strip()
    if text.startswith("```"):
        # ```json ... ``` 펜스 제거
        text = text.split("```", 2)
        text = text[1] if len(text) > 1 else raw
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start : end + 1]
    return text


def _synthesize_with_claude(aggregate: dict) -> tuple[dict, int, int]:
    """동기 Claude 호출(스레드에서 실행). (payload, input_tokens, output_tokens)."""
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=30.0)
    user_content = (
        "## 강의 상호작용 집계 (이 수치만 근거로 사용)\n"
        + json.dumps(aggregate, ensure_ascii=False)
        + "\n\n위 데이터로 차주 대면수업 솔루션 보고서를 스키마 JSON 으로 생성하세요."
    )
    response = _claude_call(client, user_content)
    text_block = next((b for b in response.content if b.type == "text"), None)
    raw = text_block.text if text_block else "{}"
    payload = json.loads(_strip_json(raw))
    if not isinstance(payload, dict):
        raise ValueError("Claude 응답이 객체 JSON 이 아님")
    # 누락 키 보정(스키마 안정화).
    payload.setdefault("summary", [])
    payload.setdefault("weak_concepts", [])
    payload.setdefault("recommendations", [])
    payload.setdefault("class_vs_individual", {"class_signals": [], "individual_signals": []})
    return payload, response.usage.input_tokens, response.usage.output_tokens


def build_rule_based_payload(aggregate: dict) -> dict:
    """규칙 기반 합성(폴백) — 키 없이도 실제로 유용한 보고서를 만든다.

    집계 신호를 결정적으로 문장화한다(테스트·오프라인·월 상한 초과 시).
    """
    comp = aggregate["completion"]
    att = aggregate["attention"]
    quiz = aggregate["quiz"]
    qa = aggregate["qa"]
    weak = aggregate["weak_concepts"]
    students = aggregate["students"]

    summary = [
        f"완주율 {comp['completion_rate']}% (학습자 {comp['total_students']}명 중 {comp['completed']}명 완료), 평균 진도 {comp['avg_progress_pct']}%.",
        f"전체 퀴즈 정답률 {quiz['overall_accuracy']}% (문항 응답 {quiz['total_questions']}건).",
        f"Q&A {qa['total']}건 중 범위 밖 거부 {qa['rejections']}건(거부율 {qa['rejection_rate']}%).",
        f"딴짓 경고 누적 {att['total_warnings']}건, 경고 다발 학습자 {att['high_warning_students']}명, 역질문 무반응 {att['total_no_response']}건.",
    ]

    weak_concepts = []
    for w in weak:
        if w["kind"] == "quiz_category":
            why = f"카테고리 정답률 {w['evidence']['accuracy']}% (응답 {w['evidence']['responses']}건)로 낮음."
        elif w["kind"] == "watch_slide":
            why = f"이탈 {w['evidence']['drops']}회·재시청 {w['evidence']['replays']}회로 체류 난항."
        else:
            why = f"범위 밖 반복 질문 거부율 {w['evidence'].get('rejection_rate')}% — 자료 갭 가능."
        weak_concepts.append({
            "concept": w["concept"],
            "why": why,
            "severity": w["severity"],
            "evidence": w["evidence"],
        })

    recommendations = []
    for w in weak[:3]:
        if w["kind"] == "quiz_category":
            recommendations.append({
                "type": "review",
                "focus": f"'{w['concept']}' 개념 복습",
                "activity": "오답 문항을 함께 풀고 핵심 오개념을 교정하는 미니 강의(10분).",
                "rationale": f"정답률 {w['evidence']['accuracy']}% — 학급 다수가 취약.",
                "target_slides": [],
                "target_students": [],
            })
        elif w["kind"] == "watch_slide":
            recommendations.append({
                "type": "reorder",
                "focus": f"{w['concept']} 구간 재설명",
                "activity": "해당 슬라이드를 대면에서 다시 짚고 즉석 질문으로 이해도 점검.",
                "rationale": f"이탈 {w['evidence']['drops']}회·재시청 {w['evidence']['replays']}회.",
                "target_slides": [w.get("slide_index")] if w.get("slide_index") is not None else [],
                "target_students": [],
            })
        else:
            recommendations.append({
                "type": "supplement",
                "focus": "자주 묻는 범위 밖 질문 보강",
                "activity": "반복된 거부 질문을 다음 차시 도입부에 짧게 다뤄 자료 갭을 메움.",
                "rationale": f"거부율 {w['evidence'].get('rejection_rate')}%.",
                "target_slides": [],
                "target_students": [],
            })
    if not recommendations:
        recommendations.append({
            "type": "activity",
            "focus": "현재 학급은 뚜렷한 취약 신호가 없습니다",
            "activity": "도전 과제·심화 토론으로 상위 학습자 몰입을 유지하세요.",
            "rationale": "취약 개념 임계값을 넘는 신호 없음.",
            "target_slides": [],
            "target_students": [],
        })

    flagged = [s for s in students if s["signals"]]
    individual_signals = []
    for s in flagged[:8]:
        labels = {
            "low_progress": "진도 미달",
            "low_accuracy": "저성취",
            "high_no_response": "역질문 무반응 다발",
        }
        sig = ", ".join(labels.get(x, x) for x in s["signals"])
        individual_signals.append({
            "student": s.get("name") or s["user_id"],
            "signal": sig,
            "suggestion": "개별 학습 독려 메시지 또는 짧은 면담을 권장.",
        })

    class_signals = [
        f"완주율 {comp['completion_rate']}% / 평균 정답률 {quiz['overall_accuracy']}%.",
        f"취약 개념 {len(weak)}개 식별 — 상위 항목을 대면 초점으로.",
    ]

    return {
        "summary": summary,
        "weak_concepts": weak_concepts,
        "recommendations": recommendations,
        "class_vs_individual": {
            "class_signals": class_signals,
            "individual_signals": individual_signals,
        },
    }


def _source_window(aggregate: dict) -> dict:
    """재현성(11 §5) — 집계 totals·임계값 스냅샷."""
    return {
        "generated_for": datetime.now(timezone.utc).isoformat(),
        "totals": {
            "students": aggregate["completion"]["total_students"],
            "questions": aggregate["quiz"]["total_questions"],
            "qa": aggregate["qa"]["total"],
            "slides": len(aggregate["watch"]["slides"]),
            "weak_concepts": len(aggregate["weak_concepts"]),
        },
        "thresholds": {
            "weak_accuracy": aggregator.WEAK_ACCURACY_THRESHOLD,
            "high_drop_min": aggregator.HIGH_DROP_MIN,
        },
    }


async def _latest_briefing(db: AsyncSession, lecture_id: uuid.UUID) -> ClassBriefing | None:
    result = await db.execute(
        select(ClassBriefing)
        .where(ClassBriefing.lecture_id == lecture_id)
        .order_by(ClassBriefing.generated_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _monthly_real_call_count(db: AsyncSession, lecture_id: uuid.UUID) -> int:
    month_start = datetime.now(timezone.utc).replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )
    result = await db.execute(
        select(func.count())
        .select_from(ClassBriefing)
        .where(
            ClassBriefing.lecture_id == lecture_id,
            ClassBriefing.model != MOCK_MODEL,
            ClassBriefing.generated_at >= month_start,
        )
    )
    return result.scalar() or 0


async def generate_briefing(
    db: AsyncSession,
    lecture_id: uuid.UUID,
    *,
    force: bool = False,
    week_no: int | None = None,
) -> ClassBriefing:
    """집계 → 합성 → class_briefings 저장(또는 캐시 반환).

    비용 가드레일: 최소 재생성 간격 + 월 강의별 실제 호출 상한. 둘 다 위반 없이
    Claude 가 가능할 때만 실제 호출하고, 그 외에는 규칙 기반으로 폴백한다.
    """
    latest = await _latest_briefing(db, lecture_id)
    now = datetime.now(timezone.utc)

    if latest is not None and not force and latest.generated_at is not None:
        # SQLite 는 tz 를 보존하지 않아 naive 로 돌아올 수 있다 → UTC 로 정규화.
        generated_at = latest.generated_at
        if generated_at.tzinfo is None:
            generated_at = generated_at.replace(tzinfo=timezone.utc)
        if now - generated_at < timedelta(minutes=INSIGHTS_MIN_REGEN_INTERVAL_MINUTES):
            return latest  # 캐시 — 재호출 비용 차단

    use_claude = bool(settings.ANTHROPIC_API_KEY)
    if use_claude:
        month_count = await _monthly_real_call_count(db, lecture_id)
        if month_count >= INSIGHTS_MONTHLY_MAX_PER_LECTURE:
            logger.warning(
                "인사이트 월 합성 상한 초과(lecture=%s, count=%d) → 규칙 기반 폴백",
                lecture_id, month_count,
            )
            use_claude = False

    aggregate = await aggregator.build_aggregate(db, lecture_id)

    payload: dict
    model: str
    if use_claude:
        try:
            payload, in_tok, out_tok = await anyio.to_thread.run_sync(
                _synthesize_with_claude, aggregate
            )
            model = settings.CLAUDE_MODEL
            cost = (
                in_tok * settings.CLAUDE_INPUT_COST_PER_M
                + out_tok * settings.CLAUDE_OUTPUT_COST_PER_M
            ) / 1_000_000
            # 비용 서버 기록(08 가드레일) — 교수자 UI 엔 노출하지 않음(05 §1.1).
            try:
                db.add(
                    CostLog(
                        lecture_id=lecture_id,
                        category=CostCategory.llm_summary,
                        model=model,
                        input_tokens=in_tok,
                        output_tokens=out_tok,
                        cost_usd=round(cost, 6),
                        memo="insights class briefing",
                    )
                )
                await db.commit()
            except Exception as exc:  # noqa: BLE001
                logger.warning("인사이트 CostLog 기록 실패(무시): %s", exc)
                await db.rollback()
        except Exception as exc:  # noqa: BLE001
            logger.warning("인사이트 Claude 합성 실패 → 규칙 기반 폴백: %s", exc)
            payload = build_rule_based_payload(aggregate)
            model = MOCK_MODEL
    else:
        payload = build_rule_based_payload(aggregate)
        model = MOCK_MODEL

    # 재현 스냅샷(슬라이드 롤업) — best-effort.
    try:
        await dashboard_svc.rollup_slide_engagement(db, lecture_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("slide_engagement 롤업 실패(무시): %s", exc)
        await db.rollback()

    lecture = await db.get(Lecture, lecture_id)
    briefing = ClassBriefing(
        lecture_id=lecture_id,
        course_id=lecture.course_id if lecture else None,
        week_no=week_no,
        payload=payload,
        model=model,
        source_window=_source_window(aggregate),
    )
    db.add(briefing)
    await db.commit()
    await db.refresh(briefing)
    return briefing
