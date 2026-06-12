"""RAG 범위 제한(2차 가드레일) 단위 테스트 (docs/planning/02 §4 — 학생 게이트 0.4).

핵심 검증(단독·외부 호출 0):
- ``is_in_scope`` 가 임계값 0.4 경계에서 정확히 갈린다(0.7→0.4, 정상 질문 거부 해소).
- 범위 밖 질문(최고 유사도 < 0.4)은 Claude API 를 **호출하지 않고** 거부 메시지·비용 0
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
    assert is_in_scope([_r(0.40)]) is True       # 0.4 = 통과(>=)
    assert is_in_scope([_r(0.3999)]) is False     # 0.4 미만 = 거부
    assert is_in_scope([_r(0.95)]) is True
    assert is_in_scope([]) is False               # 결과 없음 = 범위 밖
    # 정렬상 results[0] 가 최고 유사도 — 첫 결과가 임계값을 못 넘으면 거부.
    assert is_in_scope([_r(0.3), _r(0.99)]) is False


def test_is_in_scope_respects_explicit_threshold():
    assert is_in_scope([_r(0.72)], threshold=0.8) is False
    assert is_in_scope([_r(0.85)], threshold=0.8) is True


# ── answer_question: 범위 판정은 Claude 가 한다(임베딩은 검색·컨텍스트용) ──────


def _fake_qa_resp(text: str = "환율은 두 통화의 교환 비율입니다. [슬라이드 1]"):
    text_block = MagicMock()
    text_block.type = "text"
    text_block.text = text
    fake_resp = MagicMock()
    fake_resp.content = [text_block]
    fake_resp.usage.input_tokens = 120
    fake_resp.usage.output_tokens = 45
    return fake_resp


def test_answer_question_out_of_scope_via_sentinel():
    """강의 자료는 있으나 Claude 가 무관하다고 판정([[OUT_OF_SCOPE]])하면 거부.

    이제 거부 판정은 Claude 가 한다 — 강의 자료가 있으면 Claude 를 호출하고, 응답
    센티넬로 범위 밖을 가린다(호출은 했으므로 비용은 기록).
    """
    db = MagicMock()
    sentinel = _fake_qa_resp(text="  [[OUT_OF_SCOPE]]  ")  # 앞뒤 공백도 처리되어야
    with patch.object(qa_svc, "search_similar_slides", return_value=[_r(0.3)]), \
         patch.object(qa_svc, "search_similar_script", return_value=[_r(0.2)]), \
         patch("anthropic.Anthropic") as anthropic_cls, \
         patch.object(qa_svc, "_claude_qa_call", return_value=sentinel) as call:
        result = answer_question(db, "task-1", "sess-1", "오늘 점심 뭐 먹지?")

    assert result.in_scope is False
    assert result.answer == qa_svc.OUT_OF_SCOPE_MESSAGE
    call.assert_called_once()
    anthropic_cls.assert_called_once()
    assert result.cost_usd > 0.0  # 호출했으므로 비용 기록


def test_answer_question_no_corpus_skips_claude():
    """슬라이드·스크립트 모두 없으면 관련성 판단 불가 → Claude 미호출·비용 0 거부."""
    db = MagicMock()
    with patch.object(qa_svc, "search_similar_slides", return_value=[]), \
         patch.object(qa_svc, "search_similar_script", return_value=[]), \
         patch("anthropic.Anthropic") as anthropic_cls:
        result = answer_question(db, "task-1", "sess-1", "관련 자료 없음")
    assert result.in_scope is False
    assert result.cost_usd == 0.0
    anthropic_cls.assert_not_called()


def test_answer_question_in_scope_calls_claude():
    """스크립트 유사도 ≥ 0.4 면 관련 확정 → Claude 호출·답변·토큰·비용을 채운다."""
    db = MagicMock()
    with patch.object(qa_svc, "search_similar_script", return_value=[_r(0.83)]), \
         patch("anthropic.Anthropic") as anthropic_cls, \
         patch.object(qa_svc, "_claude_qa_call", return_value=_fake_qa_resp()) as call:
        result = answer_question(db, "task-1", "sess-1", "환율이란?")

    assert result.in_scope is True
    call.assert_called_once()
    # ≥ 0.4 경로는 거부 불가(allow_refusal=False)로 호출돼야 한다.
    assert call.call_args.kwargs.get("allow_refusal") is False
    anthropic_cls.assert_called_once()
    assert "환율" in result.answer
    assert result.input_tokens == 120 and result.output_tokens == 45
    assert result.cost_usd > 0.0


def test_answer_question_answers_beyond_embeddings():
    """임베딩 유사도가 낮아도(0.1) Claude 가 강의 관련으로 판단·답변하면 통과.

    종전 임베딩 하드 게이트(0.4)였다면 거부됐을 질문 — '서술어'처럼 PPT/스크립트
    텍스트엔 약하지만 강의 주제와 관련된 질문 회귀 방지.
    """
    db = MagicMock()
    expert = _fake_qa_resp(text="서술어는 문장에서 동작·상태를 나타내는 핵심 성분입니다 ...")
    with patch.object(qa_svc, "search_similar_slides", return_value=[_r(0.1)]), \
         patch.object(qa_svc, "search_similar_script", return_value=[_r(0.12, slide=2)]), \
         patch("anthropic.Anthropic") as anthropic_cls, \
         patch.object(qa_svc, "_claude_qa_call", return_value=expert) as call:
        result = answer_question(db, "task-1", "sess-1", "서술어에 대해 자세히 알려주세요")

    assert result.in_scope is True
    assert "서술어" in result.answer
    call.assert_called_once()
    anthropic_cls.assert_called_once()
