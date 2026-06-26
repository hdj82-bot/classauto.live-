"""H1(비용 추적) + H3(RAG 하드 플로어) 단위 테스트.

- script_generator.claude_cost_usd: usage 합산/비정상값 0 처리.
- generate_scripts(usage_sink=): 슬라이드별 토큰 사용량 적립.
- qa.answer_question: 유사도가 하드 플로어 미만이면 Claude 호출 없이 결정적 거부.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.core.config import settings
from app.services.pipeline import qa as qa_mod
from app.services.pipeline import script_generator as sg
from app.services.pipeline.retriever import RetrievalResult
from app.services.pipeline.schemas import SlideContent


# ── claude_cost_usd ───────────────────────────────────────────────────────────


def test_claude_cost_usd_sums_tokens(monkeypatch):
    monkeypatch.setattr(settings, "CLAUDE_INPUT_COST_PER_M", 1.0)
    monkeypatch.setattr(settings, "CLAUDE_OUTPUT_COST_PER_M", 2.0)
    usages = [
        {"input": 1000, "output": 500, "cache_read": 0, "cache_write": 0},
        {"input": 0, "output": 250, "cache_read": 2000, "cache_write": 0},
    ]
    # input+cache = 1000 + (0+2000) = 3000; output = 750
    # (3000×1 + 750×2)/1e6 = 4500/1e6 = 0.0045
    assert sg.claude_cost_usd(usages) == pytest.approx(0.0045)


def test_claude_cost_usd_handles_garbage_as_zero():
    # 테스트 mock 등 비정상 토큰값은 0 으로(파이프라인 비차단).
    assert sg.claude_cost_usd([{"input": MagicMock()}]) == 0.0
    assert sg.claude_cost_usd([]) == 0.0


# ── generate_scripts usage_sink ───────────────────────────────────────────────


def _mock_response(text: str) -> SimpleNamespace:
    return SimpleNamespace(
        content=[SimpleNamespace(type="text", text=text)],
        usage=SimpleNamespace(
            input_tokens=10, output_tokens=20,
            cache_read_input_tokens=1, cache_creation_input_tokens=2,
        ),
    )


def test_generate_scripts_collects_usage_into_sink():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = _mock_response("스크립트")
    usages: list = []
    with patch(
        "app.services.pipeline.script_generator.anthropic.Anthropic",
        return_value=mock_client,
    ):
        scripts = sg.generate_scripts(
            [SlideContent(slide_number=1, texts=["a"]),
             SlideContent(slide_number=2, texts=["b"])],
            usage_sink=usages,
        )
    assert len(scripts) == 2
    # 슬라이드 2개 → usage 2건 적립.
    assert len(usages) == 2
    assert all(u["input"] == 10 and u["output"] == 20 for u in usages)


def test_generate_scripts_without_sink_is_unaffected():
    mock_client = MagicMock()
    mock_client.messages.create.return_value = _mock_response("스크립트")
    with patch(
        "app.services.pipeline.script_generator.anthropic.Anthropic",
        return_value=mock_client,
    ):
        scripts = sg.generate_scripts([SlideContent(slide_number=1, texts=["a"])])
    assert len(scripts) == 1 and scripts[0].script == "스크립트"


# ── RAG 하드 플로어 (H3) ──────────────────────────────────────────────────────


def test_hard_floor_rejects_without_calling_claude(monkeypatch):
    """유사도가 하드 플로어(0.2) 미만이면 Claude 호출 없이 OUT_OF_SCOPE(비용 0)."""
    monkeypatch.setattr(
        qa_mod, "search_similar_script",
        lambda db, task_id, question, top_k=3: [
            RetrievalResult(slide_number=1, text_content="강의 발화 내용", similarity=0.1)
        ],
    )

    def _boom(*_a, **_k):
        raise AssertionError("하드 플로어 미만인데 Claude 가 호출됨")

    monkeypatch.setattr(qa_mod, "_claude_qa_call", _boom)

    res = qa_mod.answer_question(
        db=None, task_id="t1", session_id="s1", question="전혀 무관한 잡담",
    )
    assert res.in_scope is False
    assert res.cost_usd == 0.0
    assert res.answer == qa_mod.OUT_OF_SCOPE_MESSAGE


def test_above_floor_calls_claude(monkeypatch):
    """[0.2, 0.4) 구간은 Claude 판정(allow_refusal=True)을 거친다 — 하드 플로어가 막지 않음."""
    monkeypatch.setattr(
        qa_mod, "search_similar_script",
        lambda db, task_id, question, top_k=3: [
            RetrievalResult(slide_number=1, text_content="강의 발화 내용", similarity=0.3)
        ],
    )
    monkeypatch.setattr(qa_mod, "_record_qa_llm_cost", lambda *a, **k: None)
    captured = {}

    def _fake_call(client, user_content, allow_refusal=False):
        captured["allow_refusal"] = allow_refusal
        return SimpleNamespace(
            content=[SimpleNamespace(type="text", text="답변입니다.")],
            usage=SimpleNamespace(input_tokens=5, output_tokens=5),
        )

    monkeypatch.setattr(qa_mod, "_claude_qa_call", _fake_call)
    with patch("app.services.pipeline.qa.anthropic.Anthropic", return_value=MagicMock()):
        res = qa_mod.answer_question(
            db=None, task_id="t1", session_id="s1", question="표현만 다른 관련 질문",
        )
    assert res.in_scope is True
    assert captured["allow_refusal"] is True  # < 0.4 → 거부 허용 경로
