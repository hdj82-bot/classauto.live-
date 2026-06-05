"""RAG 범위 제한(2차 가드레일) 단위 테스트 (docs/planning/02 §4 — 유사도 0.7).

핵심 검증(단독·외부 호출 0):
- ``is_in_scope`` 가 임계값 0.7 경계에서 정확히 갈린다.
- 범위 밖 질문(최고 유사도 < 0.7)은 Claude API 를 **호출하지 않고** 거부 메시지·비용 0
  으로 즉시 반환한다(2차 가드레일의 비용 절약 효과 — 02 §4.4).
- 범위 안 질문은 Claude 를 호출해 답변·토큰·비용을 채운다.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.services.pipeline import qa as qa_svc
from app.services.pipeline.qa import answer_question
from app.services.pipeline.retriever import RetrievalResult, is_in_scope


def _r(sim: float, slide: int = 1) -> RetrievalResult:
    return RetrievalResult(slide_number=slide, text_content="내용", similarity=sim)


# ── is_in_scope 임계값 경계 ───────────────────────────────────────────────────


def test_is_in_scope_threshold_boundary():
    assert is_in_scope([_r(0.70)]) is True       # 0.7 = 통과(>=)
    assert is_in_scope([_r(0.6999)]) is False     # 0.7 미만 = 거부
    assert is_in_scope([_r(0.95)]) is True
    assert is_in_scope([]) is False               # 결과 없음 = 범위 밖
    # 정렬상 results[0] 가 최고 유사도 — 첫 결과가 임계값을 못 넘으면 거부.
    assert is_in_scope([_r(0.5), _r(0.99)]) is False


def test_is_in_scope_respects_explicit_threshold():
    assert is_in_scope([_r(0.72)], threshold=0.8) is False
    assert is_in_scope([_r(0.85)], threshold=0.8) is True


# ── answer_question: 범위 밖이면 Claude 미호출(비용 0) ────────────────────────


def test_answer_question_out_of_scope_skips_claude():
    db = MagicMock()
    with patch.object(qa_svc, "search_similar_slides", return_value=[_r(0.55)]), \
         patch("anthropic.Anthropic") as anthropic_cls:
        result = answer_question(db, "task-1", "sess-1", "강의 범위 밖 잡담")

    assert result.in_scope is False
    assert result.cost_usd == 0.0
    assert result.input_tokens == 0 and result.output_tokens == 0
    assert result.answer == qa_svc.OUT_OF_SCOPE_MESSAGE
    # 2차 가드레일 — LLM 클라이언트 자체를 만들지 않는다(02 §4.4 비용 0).
    anthropic_cls.assert_not_called()


def test_answer_question_no_results_skips_claude():
    db = MagicMock()
    with patch.object(qa_svc, "search_similar_slides", return_value=[]), \
         patch("anthropic.Anthropic") as anthropic_cls:
        result = answer_question(db, "task-1", "sess-1", "관련 자료 없음")
    assert result.in_scope is False
    assert result.cost_usd == 0.0
    anthropic_cls.assert_not_called()


def test_answer_question_in_scope_calls_claude():
    """범위 안(>=0.7)이면 Claude 를 호출하고 답변·토큰·비용을 채운다."""
    db = MagicMock()

    text_block = MagicMock()
    text_block.type = "text"
    text_block.text = "환율은 두 통화의 교환 비율입니다. [슬라이드 1]"
    fake_resp = MagicMock()
    fake_resp.content = [text_block]
    fake_resp.usage.input_tokens = 120
    fake_resp.usage.output_tokens = 45

    with patch.object(qa_svc, "search_similar_slides", return_value=[_r(0.83)]), \
         patch("anthropic.Anthropic") as anthropic_cls, \
         patch.object(qa_svc, "_claude_qa_call", return_value=fake_resp) as call:
        result = answer_question(db, "task-1", "sess-1", "환율이란?")

    assert result.in_scope is True
    call.assert_called_once()
    anthropic_cls.assert_called_once()  # 범위 안에서만 클라이언트 생성
    assert "환율" in result.answer
    assert result.input_tokens == 120 and result.output_tokens == 45
    assert result.cost_usd > 0.0
